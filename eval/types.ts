export type ModelTier = "frontier" | "balanced" | "fast";

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

export type ClassifyDecision =
  | {
      allocatedTier: "fast";
      source: "gate";
      gate: { pass: true } | { pass: false; reasons: string[] };
    }
  | {
      allocatedTier: ModelTier;
      source: "judge";
      gate: { pass: true } | { pass: false; reasons: string[] };
      axes: {
        blastRadius: string;
        irreversible: boolean;
        reasoningDepth: string;
        ambiguity: string;
      };
    }
  | {
      allocatedTier: ModelTier;
      source: "judge_failed";
      gate: { pass: true } | { pass: false; reasons: string[] };
      judgeFailure: { reason: string };
    };
