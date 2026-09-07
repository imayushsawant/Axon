import type { ModelTier } from "../types.js";

export function costSaved(
  _chosenTier: ModelTier,
  _fallbackTier: ModelTier,
): number {
  throw new Error("Cost metrics are not implemented yet");
}

export function latencySaved(
  _chosenTier: ModelTier,
  _fallbackTier: ModelTier,
): number {
  throw new Error("Latency metrics are not implemented yet");
}
