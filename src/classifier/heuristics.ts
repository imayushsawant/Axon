import type { InferContext } from "../types.js";

export type GateFailReason =
  | "scope_denylist"
  | "length_limit"
  | "known_intent"
  | "sequencing_language"
  | "context_or_code";

export type GatePass = {
  pass: true;
  escalateToJudge: false;
  tier: "fast";
};

export type GateFail = {
  pass: false;
  escalateToJudge: true;
  reasons: GateFailReason[];
  details: {
    vetoTerm?: string;
    wordCount?: number;
    sequencingTerm?: string;
    contextKind?: "priorMessages" | "codeContext" | "code_fence";
  };
};

export type GateResult = GatePass | GateFail;

const SCOPE_DENYLIST = [
  "entire",
  "all",
  "every",
  "whole",
  "across",
  "throughout",
  "system-wide",
  "globally",
  "everywhere",
  "codebase",
] as const;

const SEQUENCING_PHRASES = ["after that", "followed by", "once done"] as const;

const SEQUENCING_WORDS = [
  "first",
  "then",
  "next",
  "also",
  "subsequently",
] as const;

const INTENT_WORDS = [
  "typo",
  "spelling",
  "grammar",
  "reword",
  "rephrase",
  "rewrite",
  "convert",
  "translate",
  "define",
] as const;

/** Explicit conversion / rewrite phrases only — no open-ended "X to Y". */
const INTENT_PHRASES = [
  "fix the wording",
  "rewrite this sentence",
  "rewrite the sentence",
  "rewrite the given sentence",
  "more formal tone",
  "to celsius",
  "to fahrenheit",
  "to kg",
  "to lbs",
  "to lbs.",
  "to meters",
  "to km",
  "to miles",
  "to usd",
  "to inr",
  "what is",
] as const;

const CODE_FENCE = /```|~~~|<\/?code[\s>]|<\/?pre[\s>]/i;
const WHAT_DOES_MEAN = /\bwhat\s+does\s+\S+\s+mean\b/i;
/** e.g. "make the second sentence shorter" — not bare "shorter" alone. */
const MAKE_SHORTER = /\bmake\b[\s\S]{0,40}\bshorter\b/i;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasWord(haystack: string, word: string): boolean {
  return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(haystack);
}

function hasPhrase(haystack: string, phrase: string): boolean {
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

function wordCount(prompt: string): number {
  const trimmed = prompt.trim();
  if (trimmed === "") {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function findScopeVeto(prompt: string): string | undefined {
  for (const term of SCOPE_DENYLIST) {
    if (hasWord(prompt, term)) {
      return term;
    }
  }
  return undefined;
}

function matchesKnownIntent(prompt: string): boolean {
  if (INTENT_WORDS.some((word) => hasWord(prompt, word))) {
    return true;
  }
  if (INTENT_PHRASES.some((phrase) => hasPhrase(prompt, phrase))) {
    return true;
  }
  if (WHAT_DOES_MEAN.test(prompt) || MAKE_SHORTER.test(prompt)) {
    return true;
  }
  return false;
}

function findSequencing(prompt: string): string | undefined {
  for (const phrase of SEQUENCING_PHRASES) {
    if (hasPhrase(prompt, phrase)) {
      return phrase;
    }
  }
  for (const word of SEQUENCING_WORDS) {
    if (hasWord(prompt, word)) {
      return word;
    }
  }
  return undefined;
}

function findContextOrCode(
  prompt: string,
  context?: InferContext,
): GateFail["details"]["contextKind"] {
  if (context?.priorMessages !== undefined && context.priorMessages.length > 0) {
    return "priorMessages";
  }
  if (
    context?.codeContext !== undefined &&
    context.codeContext.trim() !== ""
  ) {
    return "codeContext";
  }
  if (CODE_FENCE.test(prompt)) {
    return "code_fence";
  }
  return undefined;
}

function fail(
  reasons: GateFailReason[],
  details: GateFail["details"] = {},
): GateFail {
  return {
    pass: false,
    escalateToJudge: true,
    reasons,
    details,
  };
}

export function evaluateGate(
  prompt: string,
  context?: InferContext,
): GateResult {
  const vetoTerm = findScopeVeto(prompt);
  if (vetoTerm !== undefined) {
    return fail(["scope_denylist"], { vetoTerm });
  }

  const reasons: GateFailReason[] = [];
  const details: GateFail["details"] = {};

  const count = wordCount(prompt);
  details.wordCount = count;
  if (count > 20) {
    reasons.push("length_limit");
  }

  if (!matchesKnownIntent(prompt)) {
    reasons.push("known_intent");
  }

  const sequencingTerm = findSequencing(prompt);
  if (sequencingTerm !== undefined) {
    reasons.push("sequencing_language");
    details.sequencingTerm = sequencingTerm;
  }

  const contextKind = findContextOrCode(prompt, context);
  if (contextKind !== undefined) {
    reasons.push("context_or_code");
    details.contextKind = contextKind;
  }

  if (reasons.length > 0) {
    return fail(reasons, details);
  }

  return {
    pass: true,
    escalateToJudge: false,
    tier: "fast",
  };
}
