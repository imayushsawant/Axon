import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluateGate, type GateFail } from "../src/classifier/heuristics.js";

const FAST_PROMPT = "fix the spelling in this title";

function assertFail(
  prompt: string,
  expectedReasons: GateFail["reasons"],
  context?: Parameters<typeof evaluateGate>[1],
): GateFail {
  const result = evaluateGate(prompt, context);
  assert.equal(result.pass, false);
  assert.equal(result.escalateToJudge, true);
  if (!result.pass) {
    for (const reason of expectedReasons) {
      assert.equal(
        result.reasons.includes(reason),
        true,
        `expected reason ${reason} in ${result.reasons.join(",")}`,
      );
    }
    return result;
  }
  throw new Error("expected gate failure");
}

test("passing prompt is Fast and does not escalate", () => {
  const result = evaluateGate(FAST_PROMPT);
  assert.deepEqual(result, {
    pass: true,
    escalateToJudge: false,
    tier: "fast",
  });
});

test("each known-intent family can pass when other rules pass", () => {
  const prompts = [
    "fix this typo please",
    "correct the grammar here",
    "fix the spelling",
    "fix the wording",
    "reword this heading",
    "rephrase this caption",
    "rewrite this sentence",
    "convert 10 miles",
    "32 to celsius",
    "98.6 to fahrenheit",
    "12 to kg",
    "20 to lbs",
    "10kg to lbs.",
    "translate this caption",
    "what is HTTP",
    "what does TLS mean",
    "define latency",
  ];

  for (const prompt of prompts) {
    const result = evaluateGate(prompt);
    assert.equal(result.pass, true, prompt);
    if (result.pass) {
      assert.equal(result.tier, "fast");
    }
  }
});

test("scope denylist is checked first and ignores other failures", () => {
  const result = assertFail(
    "first rewrite this sentence across the entire codebase with context ```js\nfoo\n```",
    ["scope_denylist"],
  );
  assert.equal(result.reasons.length, 1);
  assert.equal(result.reasons[0], "scope_denylist");
  assert.ok(
    result.details.vetoTerm === "entire" ||
      result.details.vetoTerm === "across" ||
      result.details.vetoTerm === "codebase",
  );
});

test("each denylist term vetoes even when intent would otherwise pass", () => {
  const prompts: Array<[string, string]> = [
    ["fix the typo in the entire title", "entire"],
    ["fix all spelling in the title", "all"],
    ["fix every grammar issue", "every"],
    ["reword the whole caption", "whole"],
    ["translate this across services", "across"],
    ["define this throughout docs", "throughout"],
    ["convert this system-wide flag", "system-wide"],
    ["translate this globally please", "globally"],
    ["rephrase this everywhere now", "everywhere"],
    ["fix the typo in this codebase", "codebase"],
  ];

  for (const [prompt, term] of prompts) {
    const result = assertFail(prompt, ["scope_denylist"]);
    assert.equal(result.details.vetoTerm, term, prompt);
  }
});

test("denylist does not match substrings (near-miss)", () => {
  const result = evaluateGate("fix a small typo");
  assert.equal(result.pass, true);
});

test("exactly 20 words can pass; 21 words fail length", () => {
  const twenty = ["fix", "the", "spelling", ...Array.from({ length: 17 }, () => "word")].join(
    " ",
  );
  assert.equal(twenty.trim().split(/\s+/).length, 20);
  assert.equal(evaluateGate(twenty).pass, true);

  const twentyOne = `${twenty} extra`;
  assert.equal(twentyOne.trim().split(/\s+/).length, 21);
  const failed = assertFail(twentyOne, ["length_limit"]);
  assert.equal(failed.details.wordCount, 21);
});

test("missing known intent fails even when short and otherwise clean", () => {
  assertFail("make this nicer", ["known_intent"]);
});

test("rewrite is a known intent; incidental conversion wording is not", () => {
  assert.equal(evaluateGate("rewrite this heading").pass, true);
  assertFail("5 apples to oranges", ["known_intent"]);
});

test("fix wording without the architecture phrase is a near-miss", () => {
  assertFail("fix wording", ["known_intent"]);
});

test("each sequencing term fails a prompt that would otherwise be Fast", () => {
  const cases: Array<[string, string]> = [
    ["first fix the spelling", "first"],
    ["fix the spelling then send", "then"],
    ["fix the spelling after that", "after that"],
    ["next fix the spelling", "next"],
    ["also fix the spelling", "also"],
    ["fix the spelling followed by a comma", "followed by"],
    ["fix the spelling once done", "once done"],
    ["subsequently fix the spelling", "subsequently"],
  ];

  for (const [prompt, term] of cases) {
    const result = assertFail(prompt, ["sequencing_language"]);
    assert.equal(result.details.sequencingTerm, term, prompt);
  }
});

test("non-empty priorMessages fail context even with Fast intent", () => {
  const result = assertFail(FAST_PROMPT, ["context_or_code"], {
    priorMessages: [{ role: "user", content: "hi" }],
  });
  assert.equal(result.details.contextKind, "priorMessages");
});

test("empty priorMessages does not fail Gate", () => {
  const result = evaluateGate(FAST_PROMPT, { priorMessages: [] });
  assert.equal(result.pass, true);
});

test("non-empty codeContext fails; whitespace-only does not", () => {
  const failed = assertFail(FAST_PROMPT, ["context_or_code"], {
    codeContext: "const x = 1",
  });
  assert.equal(failed.details.contextKind, "codeContext");

  const ok = evaluateGate(FAST_PROMPT, { codeContext: "   " });
  assert.equal(ok.pass, true);
});

test("code fences in the prompt fail even without context args", () => {
  const fenced = assertFail("fix the typo in ```js\nconst x = 1\n```", [
    "context_or_code",
  ]);
  assert.equal(fenced.details.contextKind, "code_fence");

  const tilde = assertFail("fix the typo\n~~~\ncode\n~~~", ["context_or_code"]);
  assert.equal(tilde.details.contextKind, "code_fence");
});

test("metadata alone does not fail Gate", () => {
  const result = evaluateGate(FAST_PROMPT, {
    metadata: { userId: "abc", source: "ui" },
  });
  assert.equal(result.pass, true);
});

test("non-veto failures can stack", () => {
  const prompt = [
    "first",
    "make",
    "this",
    "nicer",
    "then",
    ...Array.from({ length: 20 }, () => "word"),
  ].join(" ");
  const result = assertFail(prompt, [
    "length_limit",
    "known_intent",
    "sequencing_language",
  ]);
  assert.equal(result.reasons.includes("scope_denylist"), false);
  assert.ok((result.details.wordCount ?? 0) > 20);
});

test("Gate never returns Fast on veto even if the rest looks trivial", () => {
  const result = evaluateGate("fix this typo in the entire title");
  assert.equal(result.pass, false);
  if (!result.pass) {
    assert.equal(result.escalateToJudge, true);
  }
});
