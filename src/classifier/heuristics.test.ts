import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { evaluateGate } from "./heuristics.js";

describe("evaluateGate known_intent", () => {
  it("passes clean heuristic intents", () => {
    const passes = [
      "reword the header text",
      "translate this to Spanish",
      "convert 72 F to celsius",
      "define idempotent",
      "What is the capital of France?",
      "fix the wording on this label",
      "rewrite the given sentence in a more formal tone",
      "Make the second sentence shorter.",
      "what does RAG mean",
    ];
    for (const prompt of passes) {
      const result = evaluateGate(prompt);
      assert.equal(result.pass, true, `expected pass: ${prompt}`);
    }
  });

  it("does not treat incidental 'to' as unit conversion", () => {
    const fails = [
      "optimize it to be much faster",
      "update the handleRequest function in server.py to return 400 when body is empty",
      "your task is to tackle this open problem thoroughly",
      "Reverse engineer this code to create a new version",
      "Create a Twitter post to promote your new product.",
      "Based on the given input, classify the Reddit thread as being either related to politics or to finance.",
      "You are given a code snippet and you need to detect a bug in it.",
      "Create a program that generate a 100 to 500-word long text summarizing the content of the given text.",
    ];
    for (const prompt of fails) {
      const result = evaluateGate(prompt);
      assert.equal(result.pass, false, `expected fail: ${prompt}`);
      if (!result.pass) {
        assert.ok(
          result.reasons.includes("known_intent") ||
            result.reasons.includes("length_limit") ||
            result.reasons.includes("sequencing_language"),
          `expected gate fail reasons for: ${prompt}, got ${result.reasons.join("|")}`,
        );
      }
    }
  });

  it("requires known_intent specifically when length and sequencing are fine", () => {
    const result = evaluateGate("optimize it to be much faster");
    assert.equal(result.pass, false);
    if (!result.pass) {
      assert.ok(result.reasons.includes("known_intent"));
      assert.ok(!result.reasons.includes("length_limit"));
    }
  });
});
