import type { ModelTier } from "../types.js";

/** Experimental per-request USD baselines (not live usage). */
const COST_USD: Record<ModelTier, number> = {
  frontier: 0.015,
  balanced: 0.003,
  fast: 0.0004,
};

/** Experimental per-request latency baselines in ms. */
const LATENCY_MS: Record<ModelTier, number> = {
  frontier: 2500,
  balanced: 800,
  fast: 250,
};

export function costSaved(
  chosenTier: ModelTier,
  fallbackTier: ModelTier,
): number {
  return COST_USD[fallbackTier] - COST_USD[chosenTier];
}

export function latencySaved(
  chosenTier: ModelTier,
  fallbackTier: ModelTier,
): number {
  return LATENCY_MS[fallbackTier] - LATENCY_MS[chosenTier];
}
