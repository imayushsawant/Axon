export type BlastRadius = "Low" | "Medium" | "High";
export type ReasoningDepth = "Low" | "Medium" | "High";
export type Ambiguity = "Clear" | "Unclear";
export type Tier = "frontier" | "balanced" | "fast";

export type SeverityAxes = {
  blastRadius: BlastRadius;
  irreversible: boolean;
  reasoningDepth: ReasoningDepth;
  ambiguity: Ambiguity;
};

const REVERSIBLE_MAPPING: {
  [B in BlastRadius]: {
    [R in ReasoningDepth]: {
      [A in Ambiguity]: Tier;
    };
  };
} = {
  Low: {
    Low: { Clear: "fast", Unclear: "balanced" },
    Medium: { Clear: "fast", Unclear: "balanced" },
    High: { Clear: "frontier", Unclear: "frontier" },
  },
  Medium: {
    Low: { Clear: "balanced", Unclear: "balanced" },
    Medium: { Clear: "balanced", Unclear: "frontier" },
    High: { Clear: "frontier", Unclear: "frontier" },
  },
  High: {
    Low: { Clear: "balanced", Unclear: "balanced" },
    Medium: { Clear: "balanced", Unclear: "frontier" },
    High: { Clear: "frontier", Unclear: "frontier" },
  },
};

export function lookupTier(severity: SeverityAxes): Tier {
  if (severity.irreversible) {
    return "frontier";
  }

  return REVERSIBLE_MAPPING[severity.blastRadius][severity.reasoningDepth][
    severity.ambiguity
  ];
}
