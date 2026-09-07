import type { ModelTier } from "../types.js";
import type { RubricRating } from "./rubric.js";

export function lookupTier(_rating: RubricRating): ModelTier {
  throw new Error("Severity-to-tier lookup is not implemented yet");
}
