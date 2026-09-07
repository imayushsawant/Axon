import type { ModelTier, TierConfig } from "../types.js";

export async function complete(
  _tier: ModelTier,
  _config: TierConfig,
  _prompt: string,
): Promise<string> {
  throw new Error("Model providers are not implemented yet");
}
