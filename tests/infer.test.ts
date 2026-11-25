import assert from "node:assert/strict";
import { test } from "node:test";
import type { JudgeComplete, RubricRating } from "../src/classifier/rubric.js";
import { costSaved, latencySaved } from "../src/metrics/costLatency.js";
import type {
  CompleteRequest,
  ProviderResult,
} from "../src/models/providers.js";
import { Axon, type ModelComplete } from "../src/router.js";
import type { AxonConfig, InferSuccess, TierConfig } from "../src/types.js";

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

function axes(partial: Partial<RubricRating> = {}): RubricRating {
  return {
    blastRadius: "Low",
    irreversible: false,
    reasoningDepth: "Low",
    ambiguity: "Clear",
    ...partial,
  };
}

function mockJudge(rating: RubricRating): JudgeComplete {
  return async () => ({ ok: true, text: JSON.stringify(rating) });
}

function okText(text: string): ProviderResult {
  return {
    ok: true,
    text,
    latencyMs: 1,
    usage: {},
    provider: "openai",
    model: "mock",
  };
}

function recordingComplete(
  impl: (
    config: TierConfig,
    request: CompleteRequest,
  ) => Promise<ProviderResult>,
  calls: Array<{ model: string; request: CompleteRequest }>,
): ModelComplete {
  return async (config, request) => {
    calls.push({ model: config.model, request });
    return impl(config, request);
  };
}

function assertPublicSuccess(
  result: InferSuccess,
  expected: { response: string; tier: InferSuccess["tier"] },
): void {
  assert.equal(result.response, expected.response);
  assert.equal(result.tier, expected.tier);
  assert.equal(result.usedFallback, false);
  assert.equal(
    result.costSaved,
    costSaved(expected.tier, CONFIG.fallbackTier),
  );
  assert.equal(
    result.latencySaved,
    latencySaved(expected.tier, CONFIG.fallbackTier),
  );
  assert.equal("gate" in result, false);
  assert.equal("axes" in result, false);
  assert.equal("source" in result, false);
  assert.equal("judgeInvoked" in result, false);
}

test("Gate pass calls the Fast model and returns a public success", async () => {
  const calls: Array<{ model: string; request: CompleteRequest }> = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: async () => {
      throw new Error("Judge must not be invoked on Gate pass");
    },
    complete: recordingComplete(async () => okText("fixed title"), calls),
  });

  const result = await axon.infer(GATE_FAST);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.model, CONFIG.tiers.fast.model);
  assert.equal(calls[0]?.request.prompt, GATE_FAST);
  assert.equal(result.usedFallback, false);
  if (result.usedFallback === false && "response" in result) {
    assertPublicSuccess(result, { response: "fixed title", tier: "fast" });
  }
});

test("Judge Balanced calls the Balanced model", async () => {
  const calls: Array<{ model: string; request: CompleteRequest }> = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "Medium", reasoningDepth: "Low" }),
    ),
    complete: recordingComplete(async () => okText("balanced answer"), calls),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.model, CONFIG.tiers.balanced.model);
  assert.equal(result.usedFallback, false);
  if (result.usedFallback === false && "response" in result) {
    assertPublicSuccess(result, {
      response: "balanced answer",
      tier: "balanced",
    });
  }
});

test("Judge Frontier calls the Frontier model", async () => {
  const calls: Array<{ model: string; request: CompleteRequest }> = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "High", reasoningDepth: "High" }),
    ),
    complete: recordingComplete(async () => okText("frontier answer"), calls),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.model, CONFIG.tiers.frontier.model);
  assert.equal(result.usedFallback, false);
  if (result.usedFallback === false && "response" in result) {
    assertPublicSuccess(result, {
      response: "frontier answer",
      tier: "frontier",
    });
  }
});

test("infer forwards priorMessages and codeContext, not metadata", async () => {
  const calls: Array<{ model: string; request: CompleteRequest }> = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "Medium", reasoningDepth: "Low" }),
    ),
    complete: recordingComplete(async () => okText("ok"), calls),
  });

  await axon.infer(GATE_FAIL, {
    context: {
      priorMessages: [{ role: "user", content: "earlier" }],
      codeContext: "const x = 1;",
      metadata: { secret: true },
    },
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.request, {
    prompt: GATE_FAIL,
    priorMessages: [{ role: "user", content: "earlier" }],
    codeContext: "const x = 1;",
  });
  assert.equal(JSON.stringify(calls[0]?.request).includes("secret"), false);
});

