import assert from "node:assert/strict";
import { test } from "node:test";
import { Axon } from "../src/router.js";
import type { AxonConfig } from "../src/types.js";

const BASE: AxonConfig = {
  tiers: {
    frontier: { model: "gpt-5", apiKey: "sk-frontier" },
    balanced: { model: "claude-sonnet", apiKey: "sk-balanced" },
    fast: { model: "claude-haiku", apiKey: "sk-fast" },
  },
  judge: { model: "gemini-3.5-flash", apiKey: "sk-judge" },
  fallbackTier: "balanced",
};

test("constructor health is all ok when keys are present", async () => {
  const axon = new Axon(BASE);
  assert.deepEqual(await axon.health(), {
    frontier: "ok",
    balanced: "ok",
    fast: "ok",
    fallback: "ok",
  });
});

test("empty Fast key is failed: invalid key; fallback mirrors fallbackTier", async () => {
  const axon = new Axon({
    ...BASE,
    tiers: {
      ...BASE.tiers,
      fast: { model: "claude-haiku", apiKey: "" },
    },
  });

  assert.deepEqual(await axon.health(), {
    frontier: "ok",
    balanced: "ok",
    fast: "failed: invalid key",
    fallback: "ok",
  });
});

test("empty fallback-tier key is failed on that tier and fallback", async () => {
  const axon = new Axon({
    ...BASE,
    tiers: {
      ...BASE.tiers,
      balanced: { model: "claude-sonnet", apiKey: "   " },
    },
  });

  assert.deepEqual(await axon.health(), {
    frontier: "ok",
    balanced: "failed: invalid key",
    fast: "ok",
    fallback: "failed: invalid key",
  });
});

test("openai-compatible without baseURL is failed: missing baseURL", async () => {
  const axon = new Axon({
    ...BASE,
    tiers: {
      ...BASE.tiers,
      frontier: { model: "deepseek-chat", apiKey: "sk-ds" },
    },
  });

  assert.deepEqual(await axon.health(), {
    frontier: "failed: missing baseURL",
    balanced: "ok",
    fast: "ok",
    fallback: "ok",
  });
});

test("live inference failure updates health in the same status format", async () => {
  const axon = new Axon(BASE, {
    complete: async (config) => {
      if (config.model === BASE.tiers.fast.model) {
        return {
          ok: false,
          status: "failed: timeout",
          reason: "timed out",
        };
      }
      return {
        ok: true,
        text: "ok",
        latencyMs: 1,
        usage: {},
        provider: "openai",
        model: config.model,
      };
    },
  });

  await axon.infer("fix the spelling in this title");

  assert.deepEqual(await axon.health(), {
    frontier: "ok",
    balanced: "ok",
    fast: "failed: timeout",
    fallback: "ok",
  });
});

test("live fallback-tier failure updates fallback status", async () => {
  const axon = new Axon(BASE, {
    complete: async () => ({
      ok: false,
      status: "failed: invalid key",
      reason: "invalid api key",
    }),
  });

  await axon.infer("fix the spelling in this title");

  const health = await axon.health();
  assert.equal(health.fast, "failed: invalid key");
  assert.equal(health.balanced, "failed: invalid key");
  assert.equal(health.fallback, "failed: invalid key");
});

test("health({ live: true }) probes frontier, balanced, and fast", async () => {
  const calls: string[] = [];
  const axon = new Axon(BASE, {
    complete: async (config) => {
      calls.push(config.model);
      return {
        ok: true,
        text: "pong",
        latencyMs: 1,
        usage: {},
        provider: "openai",
        model: config.model,
      };
    },
  });

  assert.deepEqual(await axon.health({ live: true }), {
    frontier: "ok",
    balanced: "ok",
    fast: "ok",
    fallback: "ok",
  });

  assert.deepEqual(
    [...calls].sort(),
    [
      BASE.tiers.balanced.model,
      BASE.tiers.fast.model,
      BASE.tiers.frontier.model,
    ].sort(),
  );
});

test("health({ live: true }) skips network when structural check fails", async () => {
  const calls: string[] = [];
  const axon = new Axon(
    {
      ...BASE,
      tiers: {
        ...BASE.tiers,
        fast: { model: "claude-haiku", apiKey: "" },
      },
    },
    {
      complete: async (config) => {
        calls.push(config.model);
        return {
          ok: true,
          text: "pong",
          latencyMs: 1,
          usage: {},
          provider: "openai",
          model: config.model,
        };
      },
    },
  );

  assert.deepEqual(await axon.health({ live: true }), {
    frontier: "ok",
    balanced: "ok",
    fast: "failed: invalid key",
    fallback: "ok",
  });
  assert.equal(calls.includes(BASE.tiers.fast.model), false);
});

test("health({ live: true }) records live failures and mirrors fallback", async () => {
  const axon = new Axon(BASE, {
    complete: async (config) => {
      if (config.model === BASE.tiers.balanced.model) {
        return {
          ok: false,
          status: "failed: timeout",
          reason: "timed out",
        };
      }
      return {
        ok: true,
        text: "pong",
        latencyMs: 1,
        usage: {},
        provider: "openai",
        model: config.model,
      };
    },
  });

  assert.deepEqual(await axon.health({ live: true }), {
    frontier: "ok",
    balanced: "failed: timeout",
    fast: "ok",
    fallback: "failed: timeout",
  });
});

test("health() without live does not probe the network", async () => {
  let calls = 0;
  const axon = new Axon(BASE, {
    complete: async () => {
      calls += 1;
      return {
        ok: true,
        text: "pong",
        latencyMs: 1,
        usage: {},
        provider: "openai",
        model: "mock",
      };
    },
  });

  await axon.health();
  await axon.health({});
  assert.equal(calls, 0);
});
