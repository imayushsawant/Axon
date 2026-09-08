export type ModelTier = "frontier" | "balanced" | "fast";

export type FailedStage = "judge" | "frontier" | "balanced" | "fast";

export type TierConfig = {
  model: string;
  apiKey: string;
  baseURL?: string;
};

export type AxonConfig = {
  tiers: {
    frontier: TierConfig;
    balanced: TierConfig;
    fast: TierConfig;
  };
  judge?: TierConfig;
  fallbackTier: ModelTier;
};

export type PriorMessage = {
  role: string;
  content: string;
};

export type InferContext = {
  priorMessages?: PriorMessage[];
  codeContext?: string;
  metadata?: Record<string, unknown>;
};

export type InferOptions = {
  context?: InferContext;
};

export type InferSuccess = {
  response: string;
  tier: ModelTier;
  costSaved: number;
  latencySaved: number;
  usedFallback: false;
};

export type InferDegraded = {
  response: string;
  tier: ModelTier;
  costSaved: number;
  latencySaved: number;
  usedFallback: true;
  failedStage: FailedStage;
  failedReason: string;
};

export type InferStopped = {
  needsConfirmation: true;
  allocatedTier: "frontier";
  failedStage: "frontier";
  failedReason: string;
  usedFallback: false;
};

export type InferResult = InferSuccess | InferDegraded | InferStopped;

export type HealthStatus = {
  frontier: string;
  balanced: string;
  fast: string;
  fallback: string;
};
