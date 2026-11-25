import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Axon,
  type ClassifyOptions,
} from "../src/router.js";
import type { JudgeComplete } from "../src/classifier/rubric.js";
import type { RubricRating } from "../src/classifier/rubric.js";
import type { AxonConfig } from "../src/types.js";

const CONFIG: AxonConfig = {
  tiers: {
    frontier: { model: "gpt-5", apiKey: "sk-frontier" },
    balanced: { model: "claude-sonnet", apiKey: "sk-balanced" },
    fast: { model: "claude-haiku", apiKey: "sk-fast" },
  },
  judge: { model: "gemini-3.5-flash", apiKey: "sk-judge" },
  fallbackTier: "balanced",
};

const GATE_FAST = "fix the spelling in this title";
const GATE_FAIL = "explain how JWT auth should work";
const GATE_VETO = "fix the spelling across the entire title";

function axes(partial: Partial<RubricRating>): RubricRating {
  return {
    blastRadius: "Low",
    irreversible: false,
    reasoningDepth: "Low",
    ambiguity: "Clear",
    ...partial,
  };
}

function mockJudge(
  rating: RubricRating,
  calls: { count: number },
): JudgeComplete {
  return async () => {
    calls.count += 1;
    return { ok: true, text: JSON.stringify(rating) };
  };
}

function axonWith(judgeComplete: JudgeComplete): Axon {
  return new Axon(CONFIG, { judgeComplete });
}

async function classify(
  prompt: string,
  complete: JudgeComplete,
  options?: ClassifyOptions,
) {
  return axonWith(complete).classify(prompt, options);
}

test("Gate pass allocates Fast and does not invoke Judge", async () => {
  const calls = { count: 0 };
  const complete: JudgeComplete = async () => {
    calls.count += 1;
    throw new Error("Judge must not be invoked on Gate pass");
  };

  const decision = await classify(GATE_FAST, complete);

  assert.equal(calls.count, 0);
  assert.equal(decision.judgeInvoked, false);
  assert.equal(decision.source, "gate");
  assert.equal(decision.allocatedTier, "fast");
  assert.equal(decision.irreversible, false);
  assert.equal(decision.gate.pass, true);
});

test("Gate fail invokes Judge then lookupTier allocates Balanced", async () => {
  const calls = { count: 0 };
  const rating = axes({
    blastRadius: "Medium",
    reasoningDepth: "Low",
    ambiguity: "Clear",
  });
  const decision = await classify(GATE_FAIL, mockJudge(rating, calls));

  assert.equal(calls.count, 1);
  assert.equal(decision.judgeInvoked, true);
  assert.equal(decision.source, "judge");
  assert.equal(decision.gate.pass, false);
  if (decision.source === "judge") {
    assert.deepEqual(decision.axes, rating);
  }
  assert.equal(decision.allocatedTier, "balanced");
  assert.equal(decision.irreversible, false);
});

test("Gate fail invokes Judge then lookupTier allocates Frontier", async () => {
  const calls = { count: 0 };
  const rating = axes({
    blastRadius: "High",
    reasoningDepth: "High",
    ambiguity: "Clear",
  });
  const decision = await classify(GATE_FAIL, mockJudge(rating, calls));

  assert.equal(calls.count, 1);
  assert.equal(decision.judgeInvoked, true);
  assert.equal(decision.source, "judge");
  assert.equal(decision.gate.pass, false);
  if (decision.source === "judge") {
    assert.deepEqual(decision.axes, rating);
  }
  assert.equal(decision.allocatedTier, "frontier");
  assert.equal(decision.irreversible, false);
});

test("irreversible axes always allocate Frontier via lookupTier", async () => {
  const calls = { count: 0 };
  const rating = axes({
    blastRadius: "Low",
    irreversible: true,
    reasoningDepth: "Low",
    ambiguity: "Clear",
  });
  const decision = await classify(GATE_FAIL, mockJudge(rating, calls));

  assert.equal(calls.count, 1);
  assert.equal(decision.source, "judge");
  assert.equal(decision.allocatedTier, "frontier");
  assert.equal(decision.irreversible, true);
  if (decision.source === "judge") {
    assert.equal(decision.axes.irreversible, true);
  }
});

test("Gate veto escalates to Judge and never Fast from heuristics", async () => {
  const calls = { count: 0 };
  const rating = axes({
    blastRadius: "Medium",
    reasoningDepth: "Medium",
    ambiguity: "Clear",
  });
  const decision = await classify(GATE_VETO, mockJudge(rating, calls));

  assert.equal(calls.count, 1);
  assert.equal(decision.judgeInvoked, true);
  assert.equal(decision.source, "judge");
  assert.equal(decision.gate.pass, false);
  if (!decision.gate.pass) {
    assert.deepEqual(decision.gate.reasons, ["scope_denylist"]);
    assert.equal(decision.gate.details.vetoTerm, "entire");
  }
  assert.notEqual(decision.allocatedTier, "fast");
  assert.equal(decision.allocatedTier, "balanced");
});
