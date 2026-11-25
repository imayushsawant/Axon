import type { InferContext, JevJudgeConfig } from "../types.js";
import { JUDGE_SYSTEM_PROMPT, type JudgeResult, type RubricRating } from "./rubric.js";

// Use the same rubric text as the LLM Judge so backend selection cannot change policy.
function section(heading: string): string {
  return JUDGE_SYSTEM_PROMPT.split(`## ${heading}\n`)[1]!.split("\n## ")[0]!.trim();
}

function bands(heading: string): Record<string, string> {
  const text = section(heading);
  return Object.fromEntries(["Low", "Medium", "High"].map((label) => [
    label, text.split(`- ${label}: `)[1]!.split("\n")[0]!,
  ]));
}

const questions = {
  blastRadius: {
    type: "choice", instructions: `${section("Blast Radius")}\n${section("Calibration & Tie-Break Rule")}`,
    criteria: bands("Blast Radius"),
  },
  irreversible: {
    type: "choice", instructions: section("Irreversibility"),
    criteria: { true: "Wrong output could cause real-world harm code changes alone cannot undo.", false: "Effects are confined to reviewable code or text a developer can revert or discard." },
  },
  reasoningDepth: {
    type: "choice", instructions: `${section("Reasoning Depth")}\n${section("Calibration & Tie-Break Rule")}`,
    criteria: bands("Reasoning Depth"),
  },
  ambiguity: {
    type: "choice", instructions: section("Ambiguity"),
    criteria: { Clear: "There is enough context to start processing and know what exact action to perform.", Unclear: "There is not enough data to decide what exact action to perform." },
  },
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function failure(status: string, reason: string): JudgeResult {
  return { ok: false, status, reason };
}

export async function rateWithJev(
  config: JevJudgeConfig,
  prompt: string,
  context?: InferContext,
  fetchFn: typeof fetch = globalThis.fetch,
): Promise<JudgeResult> {
  const timeoutMs = config.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    return failure("failed: invalid judge config", "Jev timeoutMs must be a positive 32-bit integer");
  }
  if (!config.model.trim() || !config.apiKey.trim()) {
    return failure("failed: invalid judge config", "Jev requires a non-empty model and API key");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const baseURL = config.baseURL ?? "https://api.typesafe.ai/v1";
    const response = await fetchFn(`${baseURL.replace(/\/+$/, "")}/systemone`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.model, state: {
        prompt, priorMessages: context?.priorMessages,
        codeContext: context?.codeContext, metadata: context?.metadata,
      }, questions }),
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok) {
      // Do not expose response bodies that may echo customer context or credentials.
      await response.body?.cancel();
      return failure(`failed: Jev HTTP ${response.status}`, `Jev request failed with HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!record(payload) || !record(payload.answers)) {
      return failure("failed: malformed judge output", "Jev response missing answers");
    }
    const selected: Record<string, string> = {};
    for (const [axis, question] of Object.entries(questions)) {
      const answer = payload.answers[axis];
      if (!record(answer) || answer.type !== "choice" || typeof answer.choice !== "string" ||
          !Object.hasOwn(question.criteria, answer.choice)) {
        return failure("failed: malformed judge output", `Jev response has invalid ${axis} answer`);
      }
      selected[axis] = answer.choice;
    }
    return {
      ok: true,
      rating: {
        blastRadius: selected.blastRadius as RubricRating["blastRadius"],
        irreversible: selected.irreversible === "true",
        reasoningDepth: selected.reasoningDepth as RubricRating["reasoningDepth"],
        ambiguity: selected.ambiguity as RubricRating["ambiguity"],
      },
    };
  } catch {
    return controller.signal.aborted
      ? failure("failed: judge timeout", "Jev request timed out")
      : failure("failed: judge call", "Jev request or response could not be processed");
  } finally {
    clearTimeout(timer);
  }
}
