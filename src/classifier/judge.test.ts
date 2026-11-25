import assert from "node:assert/strict";
import { test } from "node:test";
import { createJudge } from "./judge.js";

test("legacy and explicit LLM judges share the same rating contract", async () => {
  const rating = { blastRadius: "Low", irreversible: false, reasoningDepth: "Medium", ambiguity: "Clear" };
  for (const config of [
    { model: "mock", apiKey: "key" },
    { provider: "llm" as const, model: "mock", apiKey: "key" },
  ]) {
    const judge = createJudge(config, async (seen, request) => {
      assert.equal(seen.model, "mock");
      assert.match(request.prompt, /test prompt/);
      return { ok: true, text: JSON.stringify(rating) };
    });
    assert.deepEqual(await judge("test prompt", undefined), { ok: true, rating });
  }
});
