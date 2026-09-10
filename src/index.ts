import { Axon as AxonEngine } from "./router.js";
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
 * and call `infer()`. Classification, providers, and metrics stay internal.
 */
export class Axon {
  #engine: AxonEngine;

  constructor(config: AxonConfig) {
    this.#engine = new AxonEngine(config);
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
