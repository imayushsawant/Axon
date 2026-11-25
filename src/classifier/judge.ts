import type { InferContext, JudgeConfig } from "../types.js";
import { ratePrompt, type JudgeComplete, type JudgeResult } from "./rubric.js";

export type JudgeBackend = (
  prompt: string,
  context: InferContext | undefined,
) => Promise<JudgeResult>;

export function createJudge(config: JudgeConfig, complete: JudgeComplete): JudgeBackend {
  return (prompt, context) => ratePrompt(prompt, context, { judge: config, complete });
}
