import type { ModelTier } from "../src/types.js";
export type { AxonConfig, ModelTier, TierConfig } from "../src/types.js";

export type InferContext = {
  priorMessages?: { role: string; content: string }[];
  codeContext?: string;
  metadata?: Record<string, unknown>;
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
