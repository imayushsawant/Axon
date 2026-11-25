import assert from "node:assert/strict";
import { test } from "node:test";
import { loadAxonEvalConfig } from "./config.js";

test("eval selects and records the backend without changing legacy defaults", () => {
  const keys = ["AXON_JUDGE_PROVIDER", "AXON_JUDGE_MODEL", "AXON_JUDGE_API_KEY", "AXON_JUDGE_BASE_URL", "AXON_FAST_API_KEY", "AXON_FALLBACK_TIER"];
  const saved = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) delete process.env[key];
    process.env.AXON_JUDGE_API_KEY = "test-key";
    process.env.AXON_JUDGE_MODEL = "mock-llm";
    assert.equal(loadAxonEvalConfig().judge.provider, "llm");
    process.env.AXON_JUDGE_PROVIDER = "jev";
    delete process.env.AXON_JUDGE_MODEL;
    const { config, judge } = loadAxonEvalConfig();
    assert.equal(config.judge?.provider, "jev");
    assert.deepEqual(judge, { provider: "jev", model: "jev-latest", source: "judge" });
    process.env.AXON_JUDGE_BASE_URL = "https://example.test/v1";
    assert.equal(loadAxonEvalConfig().judge.baseURL, process.env.AXON_JUDGE_BASE_URL);
    delete process.env.AXON_JUDGE_API_KEY;
    assert.throws(() => loadAxonEvalConfig(), /required for Jev/);
    process.env.AXON_JUDGE_PROVIDER = "invalid";
    assert.throws(() => loadAxonEvalConfig(), /must be llm or jev/);
    delete process.env.AXON_JUDGE_PROVIDER;
    delete process.env.AXON_JUDGE_BASE_URL;
    process.env.AXON_FAST_API_KEY = "fast-key";
    assert.equal(loadAxonEvalConfig().judge.source, "fast (default)");
  } finally {
    keys.forEach((key, i) => {
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
});
