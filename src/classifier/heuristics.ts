import type { InferContext } from "../types.js";

export type GateResult = {
  pass: boolean;
};

export function evaluateGate(
  _prompt: string,
  _context?: InferContext,
): GateResult {
  throw new Error("Gate heuristics are not implemented yet");
}
