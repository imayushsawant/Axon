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
  type CompleteRequest,
  type ProviderResult,
} from "./models/providers.js";
import type {
  AxonConfig,
  HealthStatus,
  InferContext,
  InferOptions,
  InferResult,
  InferSuccess,
  ModelTier,
  TierConfig,
} from "./types.js";

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

export class Axon {
  readonly config: AxonConfig;
  private readonly modelComplete: ModelComplete;
  private readonly judgeComplete: JudgeComplete;

  constructor(config: AxonConfig, internals?: AxonInternals) {
    this.config = config;
    this.modelComplete = internals?.complete ?? complete;
    this.judgeComplete =
      internals?.judgeComplete ?? asJudgeComplete(this.modelComplete);
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

  async infer(prompt: string, options?: InferOptions): Promise<InferResult> {
    const decision = await this.classify(prompt, options);

    if (decision.source === "judge_failed") {
      throw new Error(
        `Judge failed: ${decision.judgeFailure.reason}`,
      );
    }

    const tier = decision.allocatedTier;
    const tierConfig = this.config.tiers[tier];
    const result = await this.modelComplete(
      tierConfig,
      answerRequest(prompt, options?.context),
    );

    if (!result.ok) {
      throw new Error(result.reason);
    }

    return toSuccess(result.text, tier, this.config.fallbackTier);
  }

  async health(): Promise<HealthStatus> {
    throw new Error("health() is not implemented yet");
  }
}
