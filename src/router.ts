import { evaluateGate, type GateResult } from "./classifier/heuristics.js";
import {
  ratePrompt,
  type JudgeComplete,
  type JudgeFailure,
  type RubricRating,
} from "./classifier/rubric.js";
import { lookupTier } from "./classifier/tierLookup.js";
import { costSaved, latencySaved } from "./metrics/costLatency.js";
import {
  complete,
  resolveProviderId,
  type CompleteRequest,
  type ProviderResult,
} from "./models/providers.js";
import type {
  AxonConfig,
  FailedStage,
  HealthOptions,
  HealthStatus,
  InferContext,
  InferDegraded,
  InferOptions,
  InferResult,
  InferStopped,
  InferSuccess,
  ModelTier,
  TierConfig,
} from "./types.js";

export const AXON_STOPPED_RESPONSE =
  "Handle API key configuration and any model errors for the end user.";

export type RoutingDecision =
  | {
      allocatedTier: "fast";
      source: "gate";
      judgeInvoked: false;
      irreversible: false;
      gate: GateResult;
    }
  | {
      allocatedTier: ModelTier;
      source: "judge";
      judgeInvoked: true;
      irreversible: boolean;
      gate: GateResult;
      axes: RubricRating;
    }
  | {
      allocatedTier: ModelTier;
      source: "judge_failed";
      judgeInvoked: true;
      irreversible: false;
      gate: GateResult;
      judgeFailure: JudgeFailure;
      usedFallback: true;
    };

export type ClassifyOptions = InferOptions & {
  complete?: JudgeComplete;
};

export type ModelComplete = (
  config: TierConfig,
  request: CompleteRequest,
) => Promise<ProviderResult>;

export type AxonInternals = {
  judgeComplete?: JudgeComplete;
  complete?: ModelComplete;
};

function asJudgeComplete(completeFn: ModelComplete): JudgeComplete {
  return async (config: TierConfig, request) => {
    const result = await completeFn(config, request);
    if (!result.ok) {
      return {
        ok: false,
        status: result.status,
        reason: result.reason,
      };
    }
    return { ok: true, text: result.text };
  };
}

function answerRequest(
  prompt: string,
  context?: InferContext,
): CompleteRequest {
  const request: CompleteRequest = { prompt };
  if (context?.priorMessages !== undefined) {
    request.priorMessages = context.priorMessages;
  }
  if (context?.codeContext !== undefined) {
    request.codeContext = context.codeContext;
  }
  return request;
}

export function structuralTierStatus(config: TierConfig): string {
  if (config.apiKey.trim() === "") {
    return "failed: invalid key";
  }
  if (resolveProviderId(config.model) === "openai-compatible") {
    if (config.baseURL === undefined || config.baseURL.trim() === "") {
      return "failed: missing baseURL";
    }
  }
  return "ok";
}

function toSuccess(
  response: string,
  tier: ModelTier,
  fallbackTier: ModelTier,
): InferSuccess {
  return {
    response,
    tier,
    costSaved: costSaved(tier, fallbackTier),
    latencySaved: latencySaved(tier, fallbackTier),
    usedFallback: false,
  };
}

function toDegraded(
  response: string,
  answeredTier: ModelTier,
  fallbackTier: ModelTier,
  failedStage: FailedStage,
  failedReason: string,
): InferDegraded {
  return {
    response,
    tier: answeredTier,
    costSaved: costSaved(answeredTier, fallbackTier),
    latencySaved: latencySaved(answeredTier, fallbackTier),
    usedFallback: true,
    failedStage,
    failedReason,
  };
}

function toStopped(
  allocatedTier: ModelTier,
  failedStage: FailedStage,
  failedReason: string,
): InferStopped {
  return {
    needsConfirmation: true,
    allocatedTier,
    failedStage,
    failedReason,
    usedFallback: false,
    response: AXON_STOPPED_RESPONSE,
  };
}

export class Axon {
  readonly config: AxonConfig;
  private readonly modelComplete: ModelComplete;
  private readonly judgeComplete: JudgeComplete;
  private readonly liveStatus: Partial<Record<ModelTier, string>> = {};

  constructor(config: AxonConfig, internals?: AxonInternals) {
    this.config = config;
    this.modelComplete = internals?.complete ?? complete;
    this.judgeComplete =
      internals?.judgeComplete ?? asJudgeComplete(this.modelComplete);
  }

  private statusFor(tier: ModelTier): string {
    const structural = structuralTierStatus(this.config.tiers[tier]);
    if (structural !== "ok") {
      return structural;
    }
    return this.liveStatus[tier] ?? "ok";
  }

  private snapshotHealth(): HealthStatus {
    const frontier = this.statusFor("frontier");
    const balanced = this.statusFor("balanced");
    const fast = this.statusFor("fast");
    const fallback = this.statusFor(this.config.fallbackTier);
    return { frontier, balanced, fast, fallback };
  }

  private markLive(tier: ModelTier, status: string): void {
    this.liveStatus[tier] = status;
  }

  async classify(
    prompt: string,
    options?: ClassifyOptions,
  ): Promise<RoutingDecision> {
    const gate = evaluateGate(prompt, options?.context);
    const completeFn = options?.complete ?? this.judgeComplete;

    if (gate.pass) {
      return {
        allocatedTier: "fast",
        source: "gate",
        judgeInvoked: false,
        irreversible: false,
        gate,
      };
    }

    const judgeConfig = this.config.judge ?? this.config.tiers.fast;
    const judge = await ratePrompt(prompt, options?.context, {
      judge: judgeConfig,
      complete: completeFn,
    });

    if (!judge.ok) {
      return {
        allocatedTier: this.config.fallbackTier,
        source: "judge_failed",
        judgeInvoked: true,
        irreversible: false,
        gate,
        judgeFailure: judge,
        usedFallback: true,
      };
    }

    const allocatedTier = lookupTier(judge.rating);
    return {
      allocatedTier,
      source: "judge",
      judgeInvoked: true,
      irreversible: judge.rating.irreversible,
      gate,
      axes: judge.rating,
    };
  }

  private async completeTier(
    tier: ModelTier,
    request: CompleteRequest,
  ): Promise<ProviderResult> {
    return this.modelComplete(this.config.tiers[tier], request);
  }

  private recordOutcome(tier: ModelTier, result: ProviderResult): void {
    this.markLive(tier, result.ok ? "ok" : result.status);
  }

  private async tryFallback(
    request: CompleteRequest,
    allocatedTier: ModelTier,
    failedStage: FailedStage,
    failedReason: string,
  ): Promise<InferDegraded | InferStopped> {
    const fallbackTier = this.config.fallbackTier;
    const result = await this.completeTier(fallbackTier, request);
    this.recordOutcome(fallbackTier, result);

    if (result.ok) {
      return toDegraded(
        result.text,
        fallbackTier,
        fallbackTier,
        failedStage,
        failedReason,
      );
    }

    return toStopped(allocatedTier, fallbackTier, result.reason);
  }

  async infer(prompt: string, options?: InferOptions): Promise<InferResult> {
    const decision = await this.classify(prompt, options);
    const request = answerRequest(prompt, options?.context);
    const fallbackTier = this.config.fallbackTier;

    if (decision.source === "judge_failed") {
      return this.tryFallback(
        request,
        fallbackTier,
        "judge",
        decision.judgeFailure.reason,
      );
    }

    const allocatedTier = decision.allocatedTier;
    const result = await this.completeTier(allocatedTier, request);
    this.recordOutcome(allocatedTier, result);

    if (result.ok) {
      return toSuccess(result.text, allocatedTier, fallbackTier);
    }

    if (decision.irreversible && allocatedTier === "frontier") {
      return toStopped("frontier", "frontier", result.reason);
    }

    if (allocatedTier === fallbackTier) {
      return toStopped(allocatedTier, allocatedTier, result.reason);
    }

    return this.tryFallback(
      request,
      allocatedTier,
      allocatedTier,
      result.reason,
    );
  }

  private async probeTier(tier: ModelTier): Promise<string> {
    const structural = structuralTierStatus(this.config.tiers[tier]);
    if (structural !== "ok") {
      return structural;
    }

    const result = await this.completeTier(tier, { prompt: "ping" });
    this.recordOutcome(tier, result);
    return result.ok ? "ok" : result.status;
  }

  async health(options?: HealthOptions): Promise<HealthStatus> {
    if (options?.live !== true) {
      return this.snapshotHealth();
    }

    const [frontier, balanced, fast] = await Promise.all([
      this.probeTier("frontier"),
      this.probeTier("balanced"),
      this.probeTier("fast"),
    ]);

    const byTier = { frontier, balanced, fast } as const;
    return {
      frontier,
      balanced,
      fast,
      fallback: byTier[this.config.fallbackTier],
    };
  }
}
