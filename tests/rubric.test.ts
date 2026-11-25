import assert from "node:assert/strict";
import { test } from "node:test";
import {
  JUDGE_SYSTEM_PROMPT,
  parseJudgeOutput,
  ratePrompt,
  type JudgeComplete,
  type JudgeCompleteRequest,
} from "../src/classifier/rubric.js";

const JUDGE = { model: "gpt-4o-mini", apiKey: "sk-judge" };

const VALID = {
  blastRadius: "Low",
  irreversible: false,
  reasoningDepth: "Medium",
  ambiguity: "Clear",
};

function mockComplete(
  impl: (
    config: typeof JUDGE,
    request: JudgeCompleteRequest,
  ) => Promise<{ ok: true; text: string } | { ok: false; status: string; reason: string }>,
): JudgeComplete {
  return impl;
}

test("system prompt requires four independent axes and forbids a tier or combined score", () => {
  assert.match(JUDGE_SYSTEM_PROMPT, /blastRadius/);
  assert.match(JUDGE_SYSTEM_PROMPT, /irreversible/);
  assert.match(JUDGE_SYSTEM_PROMPT, /reasoningDepth/);
  assert.match(JUDGE_SYSTEM_PROMPT, /ambiguity/);
  assert.match(JUDGE_SYSTEM_PROMPT, /Do not choose a model or tier/);
  assert.match(JUDGE_SYSTEM_PROMPT, /Do not combine the axes into one score/);
  assert.match(JUDGE_SYSTEM_PROMPT, /worst-case potential/);
  assert.match(JUDGE_SYSTEM_PROMPT, /Fix the reconnect bug/);
});

test("parseJudgeOutput accepts a valid four-axis object", () => {
  const result = parseJudgeOutput(JSON.stringify(VALID));
  assert.deepEqual(result, { ok: true, rating: VALID });
});

test("parseJudgeOutput canonicalizes lowercase axis labels", () => {
  const result = parseJudgeOutput(
    JSON.stringify({
      blastRadius: "high",
      irreversible: true,
      reasoningDepth: "low",
      ambiguity: "unclear",
    }),
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.rating, {
      blastRadius: "High",
      irreversible: true,
      reasoningDepth: "Low",
      ambiguity: "Unclear",
    });
  }
});

test("parseJudgeOutput fails on missing axes instead of guessing", () => {
  const result = parseJudgeOutput(
    JSON.stringify({ blastRadius: "Low", irreversible: false }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: malformed judge output");
    assert.match(result.reason, /reasoningDepth/);
  }
});

test("parseJudgeOutput fails on invalid enum values", () => {
  const result = parseJudgeOutput(
    JSON.stringify({ ...VALID, blastRadius: "catastrophic" }),
  );
  assert.equal(result.ok, false);
});

test("parseJudgeOutput fails on non-JSON", () => {
  const result = parseJudgeOutput("I think this is frontier");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: malformed judge output");
  }
});

test("parseJudgeOutput does not treat a combined score as a valid rating", () => {
  const result = parseJudgeOutput(JSON.stringify({ score: 9, tier: "frontier" }));
  assert.equal(result.ok, false);
});

test("ratePrompt sends the original prompt, context, and system instructions", async () => {
  let seenRequest: JudgeCompleteRequest | undefined;
  let seenConfig: unknown;

  const result = await ratePrompt(
    "Fix the reconnect bug",
    {
      priorMessages: [{ role: "user", content: "hosts drop" }],
      codeContext: "function reconnect() {}",
      metadata: { autoExecuted: false },
    },
    {
      judge: JUDGE,
      complete: mockComplete(async (config, request) => {
        seenConfig = config;
        seenRequest = request;
        return { ok: true, text: JSON.stringify(VALID) };
      }),
    },
  );

  assert.deepEqual(seenConfig, JUDGE);
  assert.ok(seenRequest);
  assert.equal(seenRequest!.priorMessages?.[0]?.role, "system");
  assert.equal(seenRequest!.priorMessages?.[0]?.content, JUDGE_SYSTEM_PROMPT);
  assert.deepEqual(seenRequest!.priorMessages?.[1], {
    role: "user",
    content: "hosts drop",
  });
  assert.equal(seenRequest!.codeContext, "function reconnect() {}");
  assert.match(seenRequest!.prompt, /Fix the reconnect bug/);
  assert.match(seenRequest!.prompt, /autoExecuted/);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.rating, VALID);
  }
});

test("ratePrompt maps a failed Judge model call without inventing ratings", async () => {
  const result = await ratePrompt("do a thing", undefined, {
    judge: JUDGE,
    complete: mockComplete(async () => ({
      ok: false,
      status: "failed: invalid key",
      reason: "bad key",
    })),
  });
  assert.deepEqual(result, {
    ok: false,
    status: "failed: invalid key",
    reason: "bad key",
  });
});

test("ratePrompt fails closed when the model returns malformed JSON", async () => {
  const result = await ratePrompt("do a thing", undefined, {
    judge: JUDGE,
    complete: mockComplete(async () => ({
      ok: true,
      text: "looks Balanced to me",
    })),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: malformed judge output");
  }
});

test("ratePrompt does not import or invoke tier lookup", async () => {
  const source = await import("node:fs/promises").then((fs) =>
    fs.readFile(new URL("../src/classifier/rubric.ts", import.meta.url), "utf8"),
  );
  assert.equal(source.includes("lookupTier"), false);
  assert.equal(source.includes("tierLookup"), false);
  assert.equal(source.includes("../models/providers"), false);
});
