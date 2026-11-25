import assert from "node:assert/strict";
import { test } from "node:test";
import {
  lookupTier,
  type Ambiguity,
  type BlastRadius,
  type ReasoningDepth,
  type SeverityAxes,
  type Tier,
} from "../src/classifier/tierLookup.js";

const BLAST: readonly BlastRadius[] = ["Low", "Medium", "High"];
const DEPTH: readonly ReasoningDepth[] = ["Low", "Medium", "High"];
const AMBIGUITY: readonly Ambiguity[] = ["Clear", "Unclear"];

const REVERSIBLE_ROWS: ReadonlyArray<{
  blastRadius: BlastRadius;
  reasoningDepth: ReasoningDepth;
  ambiguity: Ambiguity;
  tier: Tier;
}> = [
  { blastRadius: "Low", reasoningDepth: "Low", ambiguity: "Clear", tier: "fast" },
  { blastRadius: "Low", reasoningDepth: "Low", ambiguity: "Unclear", tier: "balanced" },
  { blastRadius: "Low", reasoningDepth: "Medium", ambiguity: "Clear", tier: "fast" },
  { blastRadius: "Low", reasoningDepth: "Medium", ambiguity: "Unclear", tier: "balanced" },
  { blastRadius: "Low", reasoningDepth: "High", ambiguity: "Clear", tier: "frontier" },
  { blastRadius: "Low", reasoningDepth: "High", ambiguity: "Unclear", tier: "frontier" },
  { blastRadius: "Medium", reasoningDepth: "Low", ambiguity: "Clear", tier: "balanced" },
  { blastRadius: "Medium", reasoningDepth: "Low", ambiguity: "Unclear", tier: "balanced" },
  { blastRadius: "Medium", reasoningDepth: "Medium", ambiguity: "Clear", tier: "balanced" },
  { blastRadius: "Medium", reasoningDepth: "Medium", ambiguity: "Unclear", tier: "frontier" },
  { blastRadius: "Medium", reasoningDepth: "High", ambiguity: "Clear", tier: "frontier" },
  { blastRadius: "Medium", reasoningDepth: "High", ambiguity: "Unclear", tier: "frontier" },
  { blastRadius: "High", reasoningDepth: "Low", ambiguity: "Clear", tier: "balanced" },
  { blastRadius: "High", reasoningDepth: "Low", ambiguity: "Unclear", tier: "balanced" },
  { blastRadius: "High", reasoningDepth: "Medium", ambiguity: "Clear", tier: "balanced" },
  { blastRadius: "High", reasoningDepth: "Medium", ambiguity: "Unclear", tier: "frontier" },
  { blastRadius: "High", reasoningDepth: "High", ambiguity: "Clear", tier: "frontier" },
  { blastRadius: "High", reasoningDepth: "High", ambiguity: "Unclear", tier: "frontier" },
];

function axes(
  partial: Omit<SeverityAxes, "irreversible"> & { irreversible?: boolean },
): SeverityAxes {
  return {
    irreversible: false,
    ...partial,
  };
}

test("covers all 18 reversible combinations", () => {
  assert.equal(REVERSIBLE_ROWS.length, 18);

  for (const [index, row] of REVERSIBLE_ROWS.entries()) {
    const actual = lookupTier(
      axes({
        blastRadius: row.blastRadius,
        reasoningDepth: row.reasoningDepth,
        ambiguity: row.ambiguity,
      }),
    );
    assert.equal(
      actual,
      row.tier,
      `row ${index + 1}: ${row.blastRadius}/${row.reasoningDepth}/${row.ambiguity}`,
    );
  }
});

test("enumerates every reversible axis combination exactly once", () => {
  const seen = new Set(
    REVERSIBLE_ROWS.map(
      (row) => `${row.blastRadius}|${row.reasoningDepth}|${row.ambiguity}`,
    ),
  );
  assert.equal(seen.size, 18);

  for (const blastRadius of BLAST) {
    for (const reasoningDepth of DEPTH) {
      for (const ambiguity of AMBIGUITY) {
        assert.equal(
          seen.has(`${blastRadius}|${reasoningDepth}|${ambiguity}`),
          true,
          `missing ${blastRadius}/${reasoningDepth}/${ambiguity}`,
        );
      }
    }
  }
});

test("irreversible=true returns frontier for every reversible row", () => {
  for (const row of REVERSIBLE_ROWS) {
    const actual = lookupTier(
      axes({
        blastRadius: row.blastRadius,
        reasoningDepth: row.reasoningDepth,
        ambiguity: row.ambiguity,
        irreversible: true,
      }),
    );
    assert.equal(actual, "frontier");
  }
});

test("irreversible veto overrides combinations that would otherwise be fast or balanced", () => {
  const wouldBeFast = lookupTier(
    axes({
      blastRadius: "Low",
      reasoningDepth: "Low",
      ambiguity: "Clear",
      irreversible: true,
    }),
  );
  const wouldBeBalanced = lookupTier(
    axes({
      blastRadius: "High",
      reasoningDepth: "Low",
      ambiguity: "Clear",
      irreversible: true,
    }),
  );
  const alreadyFrontier = lookupTier(
    axes({
      blastRadius: "High",
      reasoningDepth: "High",
      ambiguity: "Unclear",
      irreversible: true,
    }),
  );

  assert.equal(wouldBeFast, "frontier");
  assert.equal(wouldBeBalanced, "frontier");
  assert.equal(alreadyFrontier, "frontier");
});

test("ambiguity boundary: Low/Low Clear is fast, Unclear is balanced", () => {
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Low",
        reasoningDepth: "Low",
        ambiguity: "Clear",
      }),
    ),
    "fast",
  );
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Low",
        reasoningDepth: "Low",
        ambiguity: "Unclear",
      }),
    ),
    "balanced",
  );
});

test("reasoning-depth boundary: Low blast Clear stays fast through Medium, jumps to frontier at High", () => {
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Low",
        reasoningDepth: "Medium",
        ambiguity: "Clear",
      }),
    ),
    "fast",
  );
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Low",
        reasoningDepth: "High",
        ambiguity: "Clear",
      }),
    ),
    "frontier",
  );
});

test("blast-radius boundary: Low/Medium/Clear is fast, Medium/Medium/Clear is balanced", () => {
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Low",
        reasoningDepth: "Medium",
        ambiguity: "Clear",
      }),
    ),
    "fast",
  );
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Medium",
        reasoningDepth: "Medium",
        ambiguity: "Clear",
      }),
    ),
    "balanced",
  );
});

test("unclear boundary: Medium/Medium Clear is balanced, Unclear is frontier", () => {
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Medium",
        reasoningDepth: "Medium",
        ambiguity: "Clear",
      }),
    ),
    "balanced",
  );
  assert.equal(
    lookupTier(
      axes({
        blastRadius: "Medium",
        reasoningDepth: "Medium",
        ambiguity: "Unclear",
      }),
    ),
    "frontier",
  );
});

test("irreversible=false is required for the reversible mapping", () => {
  assert.equal(
    lookupTier({
      blastRadius: "Low",
      reasoningDepth: "Low",
      ambiguity: "Clear",
      irreversible: false,
    }),
    "fast",
  );
});
