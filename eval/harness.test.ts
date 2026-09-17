import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { completedRowIndexes, csvColumn, parseCsv, stringifyCsv } from "./csv.js";
import { contextForEvalRow, contextLooksLikeStub } from "./evalContext.js";
import { computeMetrics, formatRate } from "./metrics.js";
import { normalizeBool, normalizeIrreversibility, normalizeTier } from "./normalize.js";

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

  it("reads Context headers case-insensitively", () => {
    const parsed = parseCsv("prompt,Context\nhello,true\n");
    assert.equal(csvColumn(parsed[0]!, "context"), "true");
  });
});

describe("normalize", () => {
  it("accepts tier casing", () => {
    assert.equal(normalizeTier("Frontier"), "frontier");
    assert.equal(normalizeTier("nope"), undefined);
  });

  it("parses context flags", () => {
    assert.equal(normalizeBool("true"), true);
    assert.equal(normalizeBool("FALSE"), false);
    assert.equal(normalizeBool(""), undefined);
  });

  it("parses irreversibility labels", () => {
    assert.equal(normalizeIrreversibility("true"), true);
    assert.equal(normalizeIrreversibility("reversible"), false);
    assert.equal(normalizeIrreversibility(""), undefined);
  });
});

describe("metrics", () => {
  it("splits Gate vs Judge tier-match and scores axes when human labels exist", () => {
    const rows = [
      {
        expected_tier: "fast",
        actual_tier: "fast",
        decided_by: "gate",
        context: "false",
        human_blast_radius: "Low",
        judge_blast_radius: "High",
        error: "",
      },
      {
        expected_tier: "frontier",
        actual_tier: "balanced",
        decided_by: "judge",
        context: "true",
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
        context: "false",
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
        context: "false",
        human_blast_radius: "Low",
        judge_blast_radius: "Low",
        error: "",
      },
      {
        expected_tier: "balanced",
        actual_tier: "balanced",
        decided_by: "judge_failed",
        context: "true",
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

describe("evalContext", () => {
  it("does not attach context when context=false", () => {
    const ctx = contextForEvalRow({
      prompt: "fix the null pointer exception on line 42 of index.js by adding a fallback value",
      context: "false",
      human_ambiguity: "Clear",
    });
    assert.equal(ctx, undefined);
  });

  it("attaches real index.js around line 42 for the NPE prompt", () => {
    const ctx = contextForEvalRow({
      prompt: "fix the null pointer exception on line 42 of index.js by adding a fallback value",
      context: "true",
      human_ambiguity: "Clear",
    });
    assert.ok(ctx);
    assert.equal(contextLooksLikeStub(ctx), false);
    assert.match(ctx!.codeContext ?? "", /index\.js/);
    assert.match(ctx!.codeContext ?? "", /42\|/);
    assert.match(ctx!.codeContext ?? "", /body\.user\.name/);
  });

  it("does not name a specific button for the unclear palette prompt", () => {
    const ctx = contextForEvalRow({
      prompt: "Update the color of the button we discussed to match the new palette.",
      context: "true",
      human_ambiguity: "Unclear",
    });
    assert.ok(ctx);
    const blob = `${ctx!.codeContext}\n${(ctx!.priorMessages ?? []).map((m) => m.content).join("\n")}`;
    assert.equal(contextLooksLikeStub(ctx), false);
    assert.equal(/\b(submit button|login form button)\b/i.test(blob), false);
  });

  it("includes the cron job definition for the project-cron question", () => {
    const ctx = contextForEvalRow({
      prompt: "what is the point of cron job in this project?",
      context: "true",
      human_ambiguity: "Clear",
    });
    assert.ok(ctx);
    assert.match(ctx!.codeContext ?? "", /nightly-rag-reindex|reindex-sources/);
  });

  it("attaches the specific navbar 28px icon context for row 9 nav bar prompt rather than general logo stub", () => {
    const ctx = contextForEvalRow({
      prompt:
        "The icon in the nav bar is looking small as compared to the previous icon, So can you just try to make it bigger And tell me how are you going to do it are you going to increase the size from the navbar, or directly [logo.tsx](file;file:///d%3A/Code/flux/components/ui/logo.tsx)",
      context: "true",
      human_ambiguity: "Clear",
    });
    assert.ok(ctx);
    assert.equal(contextLooksLikeStub(ctx), false);
    assert.match(ctx!.priorMessages?.[0]?.content ?? "", /Previous PNG was 28px/);
  });

  it("honors CSV code_context and prior_messages overrides", () => {
    const ctx = contextForEvalRow({
      prompt: "fix it",
      context: "true",
      human_ambiguity: "Clear",
      code_context: "function target() { return 1; }",
      prior_messages: JSON.stringify([
        { role: "user", content: "target() is in src/target.ts" },
      ]),
    });
    assert.deepEqual(ctx, {
      priorMessages: [{ role: "user", content: "target() is in src/target.ts" }],
      codeContext: "function target() { return 1; }",
    });
  });
});

describe("resume", () => {
  it("skips row indexes already in the output CSV", () => {
    const text = "row_index,prompt\n1,a\n3,c\n";
    const done = completedRowIndexes(text);
    assert.deepEqual([...done].sort((a, b) => a - b), [1, 3]);
  });
});
