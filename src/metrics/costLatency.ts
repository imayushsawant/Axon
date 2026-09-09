import type { ModelTier } from "../types.js";

/**
 * Experimental per-request USD baselines by tier.
 * Representative sampled estimates, not model-specific and not live usage.
 */
export const TIER_COST_USD: Record<ModelTier, number> = {
  frontier: 0.015,
  balanced: 0.003,
  fast: 0.0004,
};

/**
 * Experimental per-request latency baselines by tier, in milliseconds.
 * Representative sampled estimates, not model-specific and not live usage.
 */
export const TIER_LATENCY_MS: Record<ModelTier, number> = {
  frontier: 2500,
  balanced: 800,
  fast: 250,
};

export function costSaved(
  chosenTier: ModelTier,
  fallbackTier: ModelTier,
): number {
  return TIER_COST_USD[fallbackTier] - TIER_COST_USD[chosenTier];
}

export function latencySaved(
  chosenTier: ModelTier,
  fallbackTier: ModelTier,
): number {
  return TIER_LATENCY_MS[fallbackTier] - TIER_LATENCY_MS[chosenTier];
}
