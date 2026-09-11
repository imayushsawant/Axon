import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { AxonConfig, TierConfig } from "./types.js";
import { normalizeTier } from "./normalize.js";

export type JudgeRunConfig = {
  model: string;
  baseURL?: string;
  source: "judge" | "fast (default)";
};

function readOptional(name: string): string | undefined {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    return undefined;
  }
  return value;
}

function tierFromEnv(prefix: string, fallbackModel: string): TierConfig {
  const config: TierConfig = {
    model: readOptional(`${prefix}_MODEL`) ?? fallbackModel,
    apiKey: readOptional(`${prefix}_API_KEY`) ?? "eval-unused",
  };
  const baseURL = readOptional(`${prefix}_BASE_URL`);
  if (baseURL !== undefined) {
    config.baseURL = baseURL;
  }
  return config;
}

/** Load KEY=VALUE lines into process.env without overriding existing vars. */
export function loadDotEnv(cwd = process.cwd()): void {
  const path = resolve(cwd, ".env");
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadAxonEvalConfig(): { config: AxonConfig; judge: JudgeRunConfig } {
  const fallbackTier = normalizeTier(readOptional("AXON_FALLBACK_TIER") ?? "balanced");
  if (fallbackTier === undefined) {
    throw new Error("AXON_FALLBACK_TIER must be frontier, balanced, or fast");
  }

  const frontier = tierFromEnv("AXON_FRONTIER", "eval-unused-frontier");
  const balanced = tierFromEnv("AXON_BALANCED", "eval-unused-balanced");
  const fast = tierFromEnv("AXON_FAST", "eval-unused-fast");

  const judgeModel = readOptional("AXON_JUDGE_MODEL");
  const judgeKey = readOptional("AXON_JUDGE_API_KEY");
  const judgeBase = readOptional("AXON_JUDGE_BASE_URL");

  const axon: AxonConfig = {
    tiers: { frontier, balanced, fast },
    fallbackTier,
  };

  let judge: JudgeRunConfig;
  if (judgeModel !== undefined || judgeKey !== undefined || judgeBase !== undefined) {
    if (judgeKey === undefined) {
      throw new Error("AXON_JUDGE_API_KEY is required when configuring a Judge model");
    }
    const judgeConfig: TierConfig = {
      model: judgeModel ?? fast.model,
      apiKey: judgeKey,
    };
    if (judgeBase !== undefined) {
      judgeConfig.baseURL = judgeBase;
    }
    axon.judge = judgeConfig;
    judge = { model: judgeConfig.model, source: "judge" };
    if (judgeConfig.baseURL !== undefined) {
      judge.baseURL = judgeConfig.baseURL;
    }
  } else {
    if (fast.apiKey === "eval-unused") {
      throw new Error(
        "Set AXON_JUDGE_API_KEY (and AXON_JUDGE_MODEL) or AXON_FAST_API_KEY so classify() can call the Judge",
      );
    }
    judge = { model: fast.model, source: "fast (default)" };
    if (fast.baseURL !== undefined) {
      judge.baseURL = fast.baseURL;
    }
  }

  return { config: axon, judge };
}
