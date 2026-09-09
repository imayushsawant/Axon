import type { InferContext, PriorMessage, TierConfig } from "../types.js";

export type BlastRadius = "Low" | "Medium" | "High";
export type ReasoningDepth = "Low" | "Medium" | "High";
export type Ambiguity = "Clear" | "Unclear";

export type RubricRating = {
  blastRadius: BlastRadius;
  irreversible: boolean;
  reasoningDepth: ReasoningDepth;
  ambiguity: Ambiguity;
};

export type JudgeSuccess = {
  ok: true;
  rating: RubricRating;
};

export type JudgeFailure = {
  ok: false;
  status: string;
  reason: string;
};

export type JudgeResult = JudgeSuccess | JudgeFailure;

export type JudgeCompleteRequest = {
  prompt: string;
  priorMessages?: PriorMessage[];
  codeContext?: string;
};

export type JudgeCompleteResult =
  | { ok: true; text: string }
  | { ok: false; status: string; reason: string };

export type JudgeComplete = (
  config: TierConfig,
  request: JudgeCompleteRequest,
) => Promise<JudgeCompleteResult>;

export type RatePromptOptions = {
  judge: TierConfig;
  complete: JudgeComplete;
};

export const JUDGE_SYSTEM_PROMPT = `You are Axon's Judge. Classify the user's prompt on four independent axes. Do not write an answer to the prompt. Do not choose a model or tier. Do not combine the axes into one score.

Return ONLY a JSON object with exactly these keys:
- "blastRadius": "Low" | "Medium" | "High"
- "irreversible": true | false
- "reasoningDepth": "Low" | "Medium" | "High"
- "ambiguity": "Clear" | "Unclear"

## Blast Radius
Judged by how far incorrect output would propagate through downstream behavior, not by how many files or modules are structurally touched.

- Low: A wrong response stays visible and contained to what the user directly sees or interacts with. Nothing else in the system silently consumes or depends on this output being correct. If it's wrong, someone notices immediately (or it's cosmetic) and nothing downstream is corrupted.
- Medium: A wrong response feeds into one other part of the system, but the effect stays contained to a specific feature or flow. A bug here causes a localized, traceable problem, not something that quietly spreads everywhere.
- High: A wrong response feeds into a mechanism that many other parts of the system rely on being correct, and the failure is likely to be silent, propagating incorrect state or output across multiple features before anyone notices.

## Irreversibility
true if a wrong response could cause real-world harm that code changes alone can't undo: destructive data loss, financial transactions, irrevocable external actions (sent messages, published content, revoked access), or security/auth changes.
false if effects are confined to reviewable code or text a developer can revert or discard.

This is a veto axis for later routing, but you still must rate the other three axes independently.
Judge worst-case potential. You cannot assume a human will review the output unless the provided context explicitly says the result is shown for review and not auto-executed. If that is not stated, treat irreversible actions as irreversible.

## Reasoning Depth
Independent of how risky or reversible the task is. Count interdependent steps or sequential thinking required to complete the task correctly.

- Low: Single, self-contained action. One step. No following or multiple steps.
- Medium: Multiple steps where later steps depend on earlier ones, but the whole thing stays in one logical block and does not span different sections of the system. Example: add a new validation rule to an existing Zod schema, checking it does not conflict with existing rules.
- High: Many interdependent steps, or steps that require significant context before starting. Often spans how multiple pieces interact, not a checklist. Changes in a later step depend on decisions in an earlier step. Example: designing a JWT token-sharing flow between two servers — timing, security, what each server must know, and how failure states cascade.

## Ambiguity
Given the prompt AND any conversation, code, or metadata provided:

- Clear: There is enough context to start processing and know what exact action to perform.
- Unclear: There is not enough data to decide what exact action to perform.

Example: "Fix the reconnect bug" is Unclear. "Fix the reconnect bug where hosts lose leaderboard view on reconnect" is Clear.

If you cannot classify an axis from the given information, you must still pick the valid categorical value that best matches the definitions. Do not add extra keys. Do not wrap the JSON in markdown.`;

const BLAST = new Set<BlastRadius>(["Low", "Medium", "High"]);
const DEPTH = new Set<ReasoningDepth>(["Low", "Medium", "High"]);
const AMBIGUITY = new Set<Ambiguity>(["Clear", "Unclear"]);

function fail(status: string, reason: string): JudgeFailure {
  return { ok: false, status, reason };
}

function titleCaseAxis(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  return trimmed[0]!.toUpperCase() + trimmed.slice(1).toLowerCase();
}

function stripFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (fenced?.[1] !== undefined) {
    return fenced[1].trim();
  }
  return trimmed;
}

export function parseJudgeOutput(text: string): JudgeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(text));
  } catch {
    return fail("failed: malformed judge output", "Judge response was not valid JSON");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return fail(
      "failed: malformed judge output",
      "Judge response was not a JSON object",
    );
  }

  const record = parsed as Record<string, unknown>;
  const required = [
    "blastRadius",
    "irreversible",
    "reasoningDepth",
    "ambiguity",
  ] as const;

  for (const key of required) {
    if (!(key in record)) {
      return fail(
        "failed: malformed judge output",
        `Judge response missing ${key}`,
      );
    }
  }

  if (typeof record.irreversible !== "boolean") {
    return fail(
      "failed: malformed judge output",
      "Judge response irreversible must be a boolean",
    );
  }

  if (typeof record.blastRadius !== "string") {
    return fail(
      "failed: malformed judge output",
      "Judge response blastRadius must be a string",
    );
  }
  if (typeof record.reasoningDepth !== "string") {
    return fail(
      "failed: malformed judge output",
      "Judge response reasoningDepth must be a string",
    );
  }
  if (typeof record.ambiguity !== "string") {
    return fail(
      "failed: malformed judge output",
      "Judge response ambiguity must be a string",
    );
  }

  const blastRadius = titleCaseAxis(record.blastRadius) as BlastRadius;
  const reasoningDepth = titleCaseAxis(record.reasoningDepth) as ReasoningDepth;
  const ambiguity = titleCaseAxis(record.ambiguity) as Ambiguity;

  if (!BLAST.has(blastRadius)) {
    return fail(
      "failed: malformed judge output",
      `Invalid blastRadius: ${record.blastRadius}`,
    );
  }
  if (!DEPTH.has(reasoningDepth)) {
    return fail(
      "failed: malformed judge output",
      `Invalid reasoningDepth: ${record.reasoningDepth}`,
    );
  }
  if (!AMBIGUITY.has(ambiguity)) {
    return fail(
      "failed: malformed judge output",
      `Invalid ambiguity: ${record.ambiguity}`,
    );
  }

  return {
    ok: true,
    rating: {
      blastRadius,
      irreversible: record.irreversible,
      reasoningDepth,
      ambiguity,
    },
  };
}

function judgeUserPrompt(prompt: string, context?: InferContext): string {
  const metadata =
    context?.metadata !== undefined
      ? `\n\nDeveloper metadata:\n${JSON.stringify(context.metadata)}`
      : "";
  return `Classify this prompt on the four axes.\n\nPrompt:\n${prompt}${metadata}`;
}

export async function ratePrompt(
  prompt: string,
  context: InferContext | undefined,
  options: RatePromptOptions,
): Promise<JudgeResult> {
  const priorMessages: PriorMessage[] = [
    { role: "system", content: JUDGE_SYSTEM_PROMPT },
  ];
  if (context?.priorMessages !== undefined) {
    priorMessages.push(...context.priorMessages);
  }

  const request: JudgeCompleteRequest = {
    prompt: judgeUserPrompt(prompt, context),
    priorMessages,
  };
  if (context?.codeContext !== undefined) {
    request.codeContext = context.codeContext;
  }

  let modelResult: JudgeCompleteResult;
  try {
    modelResult = await options.complete(options.judge, request);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Judge call failed";
    return fail("failed: judge call", reason);
  }

  if (!modelResult.ok) {
    return {
      ok: false,
      status: modelResult.status,
      reason: modelResult.reason,
    };
  }

  return parseJudgeOutput(modelResult.text);
}
