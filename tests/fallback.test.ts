import assert from "node:assert/strict";
import { test } from "node:test";
import type { JudgeComplete, RubricRating } from "../src/classifier/rubric.js";
import type { ProviderResult } from "../src/models/providers.js";
import {
  AXON_STOPPED_RESPONSE,
  Axon,
  type ModelComplete,
} from "../src/router.js";
import type { AxonConfig, InferStopped, ModelTier } from "../src/types.js";

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

function fail(status: string, reason: string): ProviderResult {
  return { ok: false, status, reason };
}

function byModel(
  outcomes: Record<string, ProviderResult | (() => ProviderResult)>,
  calls: string[],
): ModelComplete {
  return async (config) => {
    calls.push(config.model);
    const outcome = outcomes[config.model];
    if (outcome === undefined) {
      throw new Error(`unexpected model ${config.model}`);
    }
    return typeof outcome === "function" ? outcome() : outcome;
  };
}

function assertStopped(
  result: InferStopped,
  expected: {
    allocatedTier: ModelTier;
    failedStage: InferStopped["failedStage"];
    failedReason: string;
  },
): void {
  assert.equal(result.needsConfirmation, true);
  assert.equal(result.usedFallback, false);
  assert.equal(result.allocatedTier, expected.allocatedTier);
  assert.equal(result.failedStage, expected.failedStage);
  assert.equal(result.failedReason, expected.failedReason);
  assert.equal(result.response, AXON_STOPPED_RESPONSE);
}

test("Fast live fail uses configured fallback and does not throw", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    complete: byModel(
      {
        [CONFIG.tiers.fast.model]: fail("failed: timeout", "timed out"),
        [CONFIG.tiers.balanced.model]: okText("fallback answer"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAST);

  assert.deepEqual(calls, [
    CONFIG.tiers.fast.model,
    CONFIG.tiers.balanced.model,
  ]);
  assert.equal(result.usedFallback, true);
  if (result.usedFallback) {
    assert.equal(result.response, "fallback answer");
    assert.equal(result.tier, "balanced");
    assert.equal(result.failedStage, "fast");
    assert.equal(result.failedReason, "timed out");
    assert.equal(result.costSaved, 0);
    assert.equal(result.latencySaved, 0);
  }
});

test("reversible Frontier live fail uses fallback", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "High", reasoningDepth: "High" }),
    ),
    complete: byModel(
      {
        [CONFIG.tiers.frontier.model]: fail("failed: timeout", "frontier down"),
        [CONFIG.tiers.balanced.model]: okText("from fallback"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [
    CONFIG.tiers.frontier.model,
    CONFIG.tiers.balanced.model,
  ]);
  assert.equal(result.usedFallback, true);
  if (result.usedFallback) {
    assert.equal(result.failedStage, "frontier");
    assert.equal(result.tier, "balanced");
  }
});

test("irreversible Frontier live fail does not downgrade", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(axes({ irreversible: true })),
    complete: byModel(
      {
        [CONFIG.tiers.frontier.model]: fail(
          "failed: timeout",
          "frontier down",
        ),
        [CONFIG.tiers.balanced.model]: okText("should not run"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [CONFIG.tiers.frontier.model]);
  assert.equal("needsConfirmation" in result, true);
  if ("needsConfirmation" in result && result.needsConfirmation) {
    assertStopped(result, {
      allocatedTier: "frontier",
      failedStage: "frontier",
      failedReason: "frontier down",
    });
  }
});

test("Judge fail uses fallback and records failedStage judge", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: async () => ({
      ok: false,
      status: "failed: judge call",
      reason: "judge down",
    }),
    complete: byModel(
      {
        [CONFIG.tiers.balanced.model]: okText("after judge fail"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [CONFIG.tiers.balanced.model]);
  assert.equal(result.usedFallback, true);
  if (result.usedFallback) {
    assert.equal(result.failedStage, "judge");
    assert.equal(result.failedReason, "judge down");
    assert.equal(result.tier, "balanced");
    assert.equal(result.response, "after judge fail");
  }
});

test("fallbackTier from config is Fast when Fast is configured as fallback", async () => {
  const calls: string[] = [];
  const config: AxonConfig = { ...CONFIG, fallbackTier: "fast" };
  const axon = new Axon(config, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "Medium", reasoningDepth: "Low" }),
    ),
    complete: byModel(
      {
        [CONFIG.tiers.balanced.model]: fail("failed: timeout", "balanced down"),
        [CONFIG.tiers.fast.model]: okText("fast fallback"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [
    CONFIG.tiers.balanced.model,
    CONFIG.tiers.fast.model,
  ]);
  assert.equal(result.usedFallback, true);
  if (result.usedFallback) {
    assert.equal(result.tier, "fast");
    assert.equal(result.failedStage, "balanced");
  }
});

test("allocated tier is fallbackTier: live fail does not call a second model", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: mockJudge(
      axes({ blastRadius: "Medium", reasoningDepth: "Low" }),
    ),
    complete: byModel(
      {
        [CONFIG.tiers.balanced.model]: fail("failed: timeout", "balanced down"),
        [CONFIG.tiers.fast.model]: okText("should not run"),
        [CONFIG.tiers.frontier.model]: okText("should not run"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [CONFIG.tiers.balanced.model]);
  assert.equal("needsConfirmation" in result, true);
  if ("needsConfirmation" in result && result.needsConfirmation) {
    assertStopped(result, {
      allocatedTier: "balanced",
      failedStage: "balanced",
      failedReason: "balanced down",
    });
  }
});

test("allocated fail and fallback fail returns InferStopped", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    complete: byModel(
      {
        [CONFIG.tiers.fast.model]: fail("failed: timeout", "fast down"),
        [CONFIG.tiers.balanced.model]: fail(
          "failed: invalid key",
          "invalid api key",
        ),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAST);

  assert.deepEqual(calls, [
    CONFIG.tiers.fast.model,
    CONFIG.tiers.balanced.model,
  ]);
  assert.equal("needsConfirmation" in result, true);
  if ("needsConfirmation" in result && result.needsConfirmation) {
    assertStopped(result, {
      allocatedTier: "fast",
      failedStage: "balanced",
      failedReason: "invalid api key",
    });
  }
});

test("Judge fail and fallback fail returns InferStopped", async () => {
  const calls: string[] = [];
  const axon = new Axon(CONFIG, {
    judgeComplete: async () => ({
      ok: false,
      status: "failed: judge call",
      reason: "judge down",
    }),
    complete: byModel(
      {
        [CONFIG.tiers.balanced.model]: fail("failed: timeout", "balanced down"),
      },
      calls,
    ),
  });

  const result = await axon.infer(GATE_FAIL);

  assert.deepEqual(calls, [CONFIG.tiers.balanced.model]);
  assert.equal("needsConfirmation" in result, true);
  if ("needsConfirmation" in result && result.needsConfirmation) {
    assertStopped(result, {
      allocatedTier: "balanced",
      failedStage: "balanced",
      failedReason: "balanced down",
    });
  }
});
