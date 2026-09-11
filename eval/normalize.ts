import type { ModelTier } from "./types.js";

const TIERS = new Set<ModelTier>(["frontier", "balanced", "fast"]);

export function normalizeTier(value: string): ModelTier | undefined {
  const trimmed = value.trim().toLowerCase();
  if (TIERS.has(trimmed as ModelTier)) {
    return trimmed as ModelTier;
  }
  return undefined;
}

export function isAudited(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "yes" || v === "y" || v === "true" || v === "1";
}

export function normalizeAxisLabel(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return undefined;
  }
  const lower = trimmed.toLowerCase();
  if (lower === "low" || lower === "medium" || lower === "high") {
    return lower[0]!.toUpperCase() + lower.slice(1);
  }
  if (lower === "clear" || lower === "unclear") {
    return lower[0]!.toUpperCase() + lower.slice(1);
  }
  return trimmed;
}

export function normalizeIrreversibility(value: string): boolean | undefined {
  const v = value.trim().toLowerCase();
  if (v === "") {
    return undefined;
  }
  if (v === "true" || v === "yes" || v === "y" || v === "1" || v === "irreversible") {
    return true;
  }
  if (v === "false" || v === "no" || v === "n" || v === "0" || v === "reversible") {
    return false;
  }
  return undefined;
}

export function boolToCsv(value: boolean | undefined): string {
  if (value === undefined) {
    return "";
  }
  return value ? "true" : "false";
}
