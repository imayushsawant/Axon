import type { InferContext, JudgeConfig } from "../types.js";
import { ratePrompt, type JudgeComplete, type JudgeResult } from "./rubric.js";
import { rateWithJev } from "./jev.js";

export type JudgeBackend = (
  prompt: string,
  context: InferContext | undefined,
) => Promise<JudgeResult>;

export function createJudge(config: JudgeConfig, complete: JudgeComplete, fetchFn?: typeof fetch): JudgeBackend {
  if (config.provider === "jev") {
    return (prompt, context) => rateWithJev(config, prompt, context, fetchFn);
  }
  return (prompt, context) => ratePrompt(prompt, context, { judge: config, complete });
}
