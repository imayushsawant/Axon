import type {
  AxonConfig,
  HealthStatus,
  InferOptions,
  InferResult,
} from "./types.js";

export class Axon {
  readonly config: AxonConfig;

  constructor(config: AxonConfig) {
    this.config = config;
  }

  async infer(_prompt: string, _options?: InferOptions): Promise<InferResult> {
    throw new Error("infer() is not implemented yet");
  }

  async health(): Promise<HealthStatus> {
    throw new Error("health() is not implemented yet");
  }
}
