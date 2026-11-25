import assert from "node:assert/strict";
import { test } from "node:test";
import { Axon } from "../router.js";
import type { AxonConfig, JevJudgeConfig } from "../types.js";
import { rateWithJev } from "./jev.js";

const judge: JevJudgeConfig = { provider: "jev", model: "jev-latest", apiKey: "test-key" };
const rating = { blastRadius: "Medium", irreversible: false, reasoningDepth: "Low", ambiguity: "Clear" } as const;
function payload(axes = rating) {
  return { answers: Object.fromEntries(Object.entries(axes).map(([key, value]) => [
    key, { type: "choice", choice: String(value), confidence: 0.01 },
  ])) };
}
const success: typeof fetch = async () => Response.json(payload());
const tiers = {
  frontier: { model: "frontier-model", apiKey: "key" },
  balanced: { model: "balanced-model", apiKey: "key" },
  fast: { model: "fast-model", apiKey: "key" },
};

test("Jev sends one structured request with all context and four rubric questions", async () => {
  let calls = 0;
  const context = { priorMessages: [{ role: "user", content: "earlier" }], codeContext: "code", metadata: { project: "test" } };
  const fetchFn: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://example.test/v1/systemone");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-key");
    const body = JSON.parse(init!.body as string);
    assert.deepEqual(body.state, { prompt: "task", ...context });
    assert.equal(body.model, judge.model);
    assert.deepEqual(Object.keys(body.questions), Object.keys(rating));
    assert.match(body.questions.blastRadius.instructions, /Unbounded scope/);
    assert.match(body.questions.irreversible.instructions, /cannot assume a human/);
    assert.match(body.questions.reasoningDepth.criteria.High, /interdependent/);
    return Response.json(payload());
  };
  assert.deepEqual(await rateWithJev({ ...judge, baseURL: "https://example.test/v1/" }, "task", context, fetchFn), { ok: true, rating });
  assert.equal(calls, 1);
});

test("Jev HTTP, network, malformed JSON and invalid answers become JudgeFailure", async () => {
  for (const status of [400, 401, 402, 429, 500]) {
    const result = await rateWithJev(judge, "task", undefined, async () => new Response("private context", { status }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.match(result.reason, new RegExp(String(status)));
      assert.doesNotMatch(result.reason, /private context/);
    }
  }
  for (const body of [null, {}, { answers: {} }, { answers: { ...payload().answers, irreversible: { type: "choice", choice: "maybe" } } }, { answers: { ...payload().answers, blastRadius: { type: "score", choice: "High" } } }]) {
    assert.equal((await rateWithJev(judge, "task", undefined, async () => Response.json(body))).ok, false);
  }
  assert.equal((await rateWithJev(judge, "task", undefined, async () => new Response("invalid json"))).ok, false);
  assert.equal((await rateWithJev(judge, "task", undefined, async () => { throw new Error("network"); })).ok, false);
});

test("Jev timeout aborts requests and invalid configuration never sends a request", async () => {
  const result = await rateWithJev({ ...judge, timeoutMs: 5 }, "task", undefined, async (_url, init) => {
    return new Promise<Response>((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "failed: judge timeout");
  for (const config of [{ ...judge, timeoutMs: 0 }, { ...judge, apiKey: "" }, { ...judge, model: "" }]) {
    assert.equal((await rateWithJev(config, "task", undefined, async () => { assert.fail("must not send"); })).ok, false);
  }
});

test("equivalent Jev and LLM axes allocate the same tier; Gate bypasses both", async () => {
  const config: AxonConfig = { tiers, judge, fallbackTier: "balanced" };
  const jev = new Axon(config, { judgeFetch: success, judgeComplete: async () => { assert.fail("LLM judge must not run"); } });
  const llm = new Axon({ ...config, judge: { provider: "llm", model: "mock", apiKey: "key" } }, { judgeComplete: async () => ({ ok: true, text: JSON.stringify(rating) }) });
  assert.deepEqual(await jev.classify("explain how JWT auth should work"), await llm.classify("explain how JWT auth should work"));
  const gateOnly = new Axon(config, { judgeFetch: async () => { assert.fail("Gate must bypass Jev"); } });
  assert.equal((await gateOnly.classify("fix the spelling in this title")).source, "gate");
});

test("Jev irreversibility selects Frontier and does not downgrade on Frontier failure", async () => {
  const answers = payload().answers;
  answers.irreversible = { type: "choice", choice: "true", confidence: 1 };
  const calls: string[] = [];
  const axon = new Axon({ tiers, judge, fallbackTier: "balanced" }, {
    judgeFetch: async () => Response.json({ answers }),
    complete: async (config) => { calls.push(config.model); return { ok: false, status: "failed", reason: "outage" }; },
  });
  const result = await axon.infer("explain how JWT auth should work");
  assert.ok("needsConfirmation" in result);
  assert.deepEqual(calls, [tiers.frontier.model]);
});

for (const fallbackTier of ["frontier", "balanced", "fast"] as const) {
  test(`Jev failure calls only ${fallbackTier} fallback, and stops if fallback fails`, async () => {
    for (const failCompletion of [false, true]) {
      const calls: string[] = [];
      const axon = new Axon({ tiers, judge, fallbackTier }, {
        judgeFetch: async () => new Response(null, { status: 503 }),
        judgeComplete: async () => { assert.fail("must not retry with an LLM judge"); },
        complete: async (config) => {
          calls.push(config.model);
          return failCompletion ? { ok: false, status: "failed", reason: "outage" }
            : { ok: true, text: "answer", latencyMs: 1, usage: {}, provider: "mock", model: config.model };
        },
      });
      const result = await axon.infer("explain how JWT auth should work");
      assert.deepEqual(calls, [tiers[fallbackTier].model]);
      if (failCompletion) assert.ok("needsConfirmation" in result);
      else {
        assert.equal(result.usedFallback, true);
        assert.ok("failedStage" in result && result.failedStage === "judge");
      }
    }
  });
}
