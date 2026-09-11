import type {
  GateFail,
  GateFailReason,
  GatePass,
  GateResult,
} from "./classifier/heuristics.js";
import type {
  Ambiguity,
  BlastRadius,
  JudgeFailure,
  ReasoningDepth,
  RubricRating,
} from "./classifier/rubric.js";
import { Axon as AxonEngine, type RoutingDecision } from "./router.js";
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
  PriorMessage,
  TierConfig,
} from "./types.js";

export type {
  Ambiguity,
  AxonConfig,
  BlastRadius,
  FailedStage,
  GateFail,
  GateFailReason,
  GatePass,
  GateResult,
  HealthOptions,
  HealthStatus,
  InferContext,
  InferDegraded,
  InferOptions,
  InferResult,
  InferStopped,
  InferSuccess,
  JudgeFailure,
  ModelTier,
  PriorMessage,
  ReasoningDepth,
  RoutingDecision,
  RubricRating,
  TierConfig,
};

function asInferOptions(
  optionsOrContext?: InferOptions | InferContext,
): InferOptions | undefined {
  if (optionsOrContext === undefined) {
    return undefined;
  }
  if ("context" in optionsOrContext) {
    return optionsOrContext;
  }
  return { context: optionsOrContext as InferContext };
}

/**
 * Public Axon SDK. Developers configure tiers (and optional Judge / fallback)
 * and call `infer()` or `classify()`. Provider and metrics internals stay private.
 */
export class Axon {
  #engine: AxonEngine;

  constructor(config: AxonConfig) {
    this.#engine = new AxonEngine(config);
  }

  classify(
    prompt: string,
    optionsOrContext?: InferOptions | InferContext,
  ): Promise<RoutingDecision> {
    return this.#engine.classify(prompt, asInferOptions(optionsOrContext));
  }

  infer(
    prompt: string,
    optionsOrContext?: InferOptions | InferContext,
  ): Promise<InferResult> {
    return this.#engine.infer(prompt, asInferOptions(optionsOrContext));
  }

  health(options?: HealthOptions): Promise<HealthStatus> {
    return this.#engine.health(options);
  }
}
