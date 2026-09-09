import { evaluateGate, type GateResult } from "./classifier/heuristics.js";
import {
  ratePrompt,
  type JudgeComplete,
  type JudgeFailure,
  type RubricRating,
} from "./classifier/rubric.js";
import { lookupTier } from "./classifier/tierLookup.js";
import { complete } from "./models/providers.js";
import type {
  AxonConfig,
  HealthStatus,
  InferOptions,
  InferResult,
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

export type AxonInternals = {
  complete?: JudgeComplete;
};

function asJudgeComplete(completeFn: typeof complete): JudgeComplete {
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

const defaultJudgeComplete = asJudgeComplete(complete);

export class Axon {
  readonly config: AxonConfig;
  private readonly complete: JudgeComplete;

  constructor(config: AxonConfig, internals?: AxonInternals) {
    this.config = config;
    this.complete = internals?.complete ?? defaultJudgeComplete;
  }

  async classify(
    prompt: string,
    options?: ClassifyOptions,
  ): Promise<RoutingDecision> {
    const gate = evaluateGate(prompt, options?.context);
    const completeFn = options?.complete ?? this.complete;

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

  async infer(_prompt: string, _options?: InferOptions): Promise<InferResult> {
    throw new Error("infer() is not implemented yet");
  }

  async health(): Promise<HealthStatus> {
    throw new Error("health() is not implemented yet");
  }
}
