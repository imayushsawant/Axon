import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedRowIndexes, parseCsv, stringifyCsv } from "./csv.js";
import { computeMetrics, formatRate } from "./metrics.js";
import { isAudited, normalizeIrreversibility, normalizeTier } from "./normalize.js";

describe("csv", () => {
  it("round-trips quoted prompts with commas and quotes", () => {
    const rows = [
      {
        prompt: 'Fix the "reconnect" bug, then ship',
        category: "near-miss",
        expected_tier: "balanced",
      },
    ];
    const text = stringifyCsv(rows, ["prompt", "category", "expected_tier"]);
    const parsed = parseCsv(text);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0]?.prompt, 'Fix the "reconnect" bug, then ship');
  });

  it("parses multiline quoted fields", () => {
    const text = "prompt,expected_tier\n\"line 1\nline 2\",fast\n";
    const parsed = parseCsv(text);
    assert.equal(parsed[0]?.prompt, "line 1\nline 2");
  });
});

describe("normalize", () => {
  it("accepts tier casing", () => {
    assert.equal(normalizeTier("Frontier"), "frontier");
    assert.equal(normalizeTier("nope"), undefined);
  });

  it("treats only explicit yes-like values as audited", () => {
    assert.equal(isAudited("yes"), true);
    assert.equal(isAudited("no"), false);
    assert.equal(isAudited(""), false);
  });

  it("parses irreversibility labels", () => {
    assert.equal(normalizeIrreversibility("true"), true);
    assert.equal(normalizeIrreversibility("reversible"), false);
    assert.equal(normalizeIrreversibility(""), undefined);
  });
});

describe("metrics", () => {
  it("splits Gate vs Judge tier-match and ignores unaudited axes", () => {
    const rows = [
      {
        expected_tier: "fast",
        actual_tier: "fast",
        decided_by: "gate",
        audited: "no",
        human_blast_radius: "Low",
        judge_blast_radius: "High",
        error: "",
      },
      {
        expected_tier: "frontier",
        actual_tier: "balanced",
        decided_by: "judge",
        audited: "yes",
        human_blast_radius: "High",
        judge_blast_radius: "High",
        human_irreversibility: "true",
        judge_irreversibility: "false",
        human_reasoning_depth: "High",
        judge_reasoning_depth: "High",
        human_ambiguity: "Clear",
        judge_ambiguity: "Clear",
        error: "",
      },
      {
        expected_tier: "balanced",
        actual_tier: "balanced",
        decided_by: "judge",
        audited: "no",
        human_blast_radius: "Low",
        judge_blast_radius: "Medium",
        error: "",
      },
    ];

    const metrics = computeMetrics(rows);
    assert.equal(metrics.overall.matched, 2);
    assert.equal(metrics.overall.total, 3);
    assert.equal(metrics.gate.matched, 1);
    assert.equal(metrics.gate.total, 1);
    assert.equal(metrics.judge.matched, 1);
    assert.equal(metrics.judge.total, 2);
    assert.equal(metrics.axis_agreement_row_count, 1);
    assert.equal(metrics.axis_agreement.blast_radius.matched, 1);
    assert.equal(metrics.axis_agreement.irreversibility.matched, 0);
    assert.equal(metrics.axis_agreement.irreversibility.total, 1);
  });

  it("does not score axes on Gate-only or judge_failed rows", () => {
    const rows = [
      {
        expected_tier: "fast",
        actual_tier: "fast",
        decided_by: "gate",
        audited: "yes",
        human_blast_radius: "Low",
        judge_blast_radius: "Low",
        error: "",
      },
      {
        expected_tier: "balanced",
        actual_tier: "balanced",
        decided_by: "judge_failed",
        audited: "yes",
        human_blast_radius: "Medium",
        judge_blast_radius: "",
        error: "timeout",
      },
    ];
    const metrics = computeMetrics(rows);
    assert.equal(metrics.axis_agreement_row_count, 0);
    assert.equal(metrics.axis_agreement.blast_radius.total, 0);
    assert.equal(formatRate(metrics.axis_agreement.blast_radius), "n/a (0 rows)");
  });
});

describe("resume", () => {
  it("skips row indexes already in the output CSV", () => {
    const text = "row_index,prompt\n1,a\n3,c\n";
    const done = completedRowIndexes(text);
    assert.deepEqual([...done].sort((a, b) => a - b), [1, 3]);
  });
});
