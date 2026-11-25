import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Axon as ESMAxon } from "../dist/index.js";

const require = createRequire(import.meta.url);
const { Axon: CJSAxon } = require("../dist/index.cjs");
const tiers = Object.fromEntries(["frontier", "balanced", "fast"].map(
  (tier) => [tier, { model: tier, apiKey: "test-key" }],
));
const judge = { provider: "jev", model: "jev-latest", apiKey: "test-key" };
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return Response.json({ answers: Object.fromEntries(Object.entries({
    blastRadius: "Low", irreversible: "false", reasoningDepth: "Low", ambiguity: "Clear",
  }).map(([key, choice]) => [key, { type: "choice", choice }])) });
};
try {
  for (const Axon of [ESMAxon, CJSAxon]) {
    const axon = new Axon({ tiers, judge, fallbackTier: "balanced" });
    const result = await axon.classify("explain how JWT auth should work");
    assert.equal(result.source, "judge");
    assert.equal(result.allocatedTier, "fast");
    assert.equal((await axon.classify("fix the spelling in this title")).source, "gate");
  }
  assert.equal(calls, 2);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Built ESM/CJS exports and public Jev configuration passed");
