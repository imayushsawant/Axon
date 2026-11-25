import assert from "node:assert/strict";
import { test } from "node:test";
import { Axon } from "../src/index.js";
import type { AxonConfig } from "../src/index.js";

const CONFIG: AxonConfig = {
  tiers: {
    frontier: { model: "gpt-5", apiKey: "sk-frontier" },
    balanced: { model: "claude-sonnet", apiKey: "sk-balanced" },
    fast: { model: "claude-haiku", apiKey: "sk-fast" },
  },
  fallbackTier: "balanced",
};

test("public Axon exposes structural health without internals", async () => {
  const axon = new Axon(CONFIG);
  assert.deepEqual(await axon.health(), {
    frontier: "ok",
    balanced: "ok",
    fast: "ok",
    fallback: "ok",
  });
});
