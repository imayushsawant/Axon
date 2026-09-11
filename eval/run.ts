/**
 * Eval harness for Axon routing.
 *
 * Reads a labeled CSV and runs each prompt through dist/ classify() (not src/).
 * Writes results incrementally so a crash can be resumed.
 *
 * Usage:
 *   npx tsx eval/run.ts --input path/to/prompts.csv
 *   npx tsx eval/run.ts --input prompts.csv --output eval/results/run.csv
 *   npx tsx eval/run.ts --input prompts.csv --output eval/results/run.csv --fresh
 *
 * classify() only needs a live Judge (AXON_JUDGE_* or Fast-tier credentials).
 * Frontier/Balanced keys are unused unless you omit Judge and default to Fast.
 */
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadAxonEvalConfig, loadDotEnv, type JudgeRunConfig } from "./config.js";
import { csvHeaderLine, parseCsv, stringifyCsvRow, completedRowIndexes } from "./csv.js";
import { computeMetrics, formatMetricsReport, type EvalMetrics } from "./metrics.js";
import { boolToCsv, normalizeTier } from "./normalize.js";
import type { AxonConfig, ClassifyDecision } from "./types.js";

const REPO_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));

export const OUTPUT_COLUMNS = [
  "row_index",
  "prompt",
  "category",
  "expected_tier",
  "actual_tier",
  "decided_by",
  "pass",
  "audited",
  "human_blast_radius",
  "human_irreversibility",
  "human_reasoning_depth",
  "human_ambiguity",
  "judge_blast_radius",
  "judge_irreversibility",
  "judge_reasoning_depth",
  "judge_ambiguity",
  "gate_reasons",
  "elapsed_ms",
  "error",
] as const;

export type CliOptions = {
  input: string;
  output: string;
  fresh: boolean;
  limit?: number;
  delayMs: number;
};

function usage(): string {
  return `Axon eval harness

Required:
  --input <path>     Labeled CSV (prompt, category, expected_tier, audited, human_* axes)

Optional:
  --output <path>    Results CSV (default: eval/results/eval-<timestamp>.csv)
  --fresh            Overwrite output instead of resuming
  --limit <n>        Only run the first n input rows (after resume skip)
  --delay-ms <n>     Pause between Judge calls (default 0)

Environment (loaded from .env if present):
  AXON_JUDGE_MODEL, AXON_JUDGE_API_KEY, AXON_JUDGE_BASE_URL
  AXON_FAST_MODEL, AXON_FAST_API_KEY     (used if Judge is omitted)
  AXON_FRONTIER_*, AXON_BALANCED_*       (unused by classify(); placeholders ok)
  AXON_FALLBACK_TIER                     (default balanced)
`;
}

export function parseArgs(argv: string[]): CliOptions | { help: true } | { error: string } {
  if (argv.includes("--help") || argv.includes("-h")) {
    return { help: true };
  }

  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1) {
      return undefined;
    }
    return argv[i + 1];
  };

  const input = get("--input");
  if (input === undefined || input.startsWith("--")) {
    return { error: "--input <path> is required" };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputArg = get("--output");
  const output =
    outputArg !== undefined && !outputArg.startsWith("--")
      ? outputArg
      : resolve(REPO_ROOT, "eval", "results", `eval-${stamp}.csv`);

  const limitRaw = get("--limit");
  let limit: number | undefined;
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 0) {
      return { error: "--limit must be a non-negative integer" };
    }
    limit = n;
  }

  const delayRaw = get("--delay-ms");
  let delayMs = 0;
  if (delayRaw !== undefined) {
    const n = Number(delayRaw);
    if (!Number.isFinite(n) || n < 0) {
      return { error: "--delay-ms must be a non-negative number" };
    }
    delayMs = n;
  }

  const options: CliOptions = {
    input: resolve(process.cwd(), input),
    output: resolve(process.cwd(), output),
    fresh: argv.includes("--fresh"),
    delayMs,
  };
  if (limit !== undefined) {
    options.limit = limit;
  }
  return options;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function gateReasons(decision: ClassifyDecision): string {
  if (decision.gate.pass) {
    return "";
  }
  return decision.gate.reasons.join("|");
}

function rowFromDecision(
  input: Record<string, string>,
  rowIndex: number,
  decision: ClassifyDecision | undefined,
  elapsedMs: number,
  error: string,
): Record<string, string> {
  const expected = input.expected_tier ?? "";
  const actual = decision?.allocatedTier ?? "";
  const expectedTier = normalizeTier(expected);
  const actualTier = normalizeTier(actual);
  const pass =
    expectedTier !== undefined &&
    actualTier !== undefined &&
    expectedTier === actualTier;

  const row: Record<string, string> = {
    row_index: String(rowIndex),
    prompt: input.prompt ?? "",
    category: input.category ?? "",
    expected_tier: expected,
    actual_tier: actual,
    decided_by: decision?.source ?? "",
    pass: pass ? "true" : "false",
    audited: input.audited ?? "",
    human_blast_radius: input.human_blast_radius ?? "",
    human_irreversibility: input.human_irreversibility ?? "",
    human_reasoning_depth: input.human_reasoning_depth ?? "",
    human_ambiguity: input.human_ambiguity ?? "",
    judge_blast_radius: "",
    judge_irreversibility: "",
    judge_reasoning_depth: "",
    judge_ambiguity: "",
    gate_reasons: decision ? gateReasons(decision) : "",
    elapsed_ms: String(elapsedMs),
    error,
  };

  if (decision?.source === "judge") {
    row.judge_blast_radius = decision.axes.blastRadius;
    row.judge_irreversibility = boolToCsv(decision.axes.irreversible);
    row.judge_reasoning_depth = decision.axes.reasoningDepth;
    row.judge_ambiguity = decision.axes.ambiguity;
  }

  if (decision?.source === "judge_failed") {
    row.error = decision.judgeFailure.reason;
  }

  return row;
}

async function ensureOutputFile(path: string, fresh: boolean): Promise<Set<number>> {
  await mkdir(dirname(path), { recursive: true });
  if (fresh || !existsSync(path)) {
    await writeFile(path, csvHeaderLine([...OUTPUT_COLUMNS]), "utf8");
    return new Set();
  }
  const existing = await readFile(path, "utf8");
  if (existing.trim() === "") {
    await writeFile(path, csvHeaderLine([...OUTPUT_COLUMNS]), "utf8");
    return new Set();
  }
  return completedRowIndexes(existing);
}

function metaPath(outputCsv: string): string {
  return outputCsv.replace(/\.csv$/i, "") + ".meta.json";
}

function writeMetaPayload(args: {
  startedAt: string;
  finishedAt?: string;
  input: string;
  output: string;
  judge: JudgeRunConfig;
  packageEntry: string;
  resumed: boolean;
  metrics?: EvalMetrics;
  rowsTotal: number;
  rowsCompletedBefore: number;
  rowsRun: number;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    startedAt: args.startedAt,
    input: args.input,
    output: args.output,
    packageEntry: args.packageEntry,
    resumed: args.resumed,
    judge: {
      model: args.judge.model,
      source: args.judge.source,
      ...(args.judge.baseURL !== undefined ? { baseURL: args.judge.baseURL } : {}),
    },
    rowsTotal: args.rowsTotal,
    rowsCompletedBefore: args.rowsCompletedBefore,
    rowsRun: args.rowsRun,
  };
  if (args.finishedAt !== undefined) {
    payload.finishedAt = args.finishedAt;
  }
  if (args.metrics !== undefined) {
    payload.metrics = args.metrics;
  }
  return payload;
}

export async function runEval(options: CliOptions): Promise<EvalMetrics> {
  const distPath = resolve(REPO_ROOT, "dist", "index.js");
  if (!existsSync(distPath)) {
    throw new Error("dist/ is missing. Run npm run build before the eval harness.");
  }

  const { Axon } = (await import(pathToFileURL(distPath).href)) as {
    Axon: new (config: AxonConfig) => {
      classify: (prompt: string) => Promise<ClassifyDecision>;
    };
  };
  const { config, judge } = loadAxonEvalConfig();
  const axon = new Axon(config);

  const inputText = await readFile(options.input, "utf8");
  const inputs = parseCsv(inputText);
  if (inputs.length === 0) {
    throw new Error(`No data rows in ${options.input}`);
  }
  for (const [i, row] of inputs.entries()) {
    if ((row.prompt ?? "").trim() === "") {
      throw new Error(`Row ${i + 1} is missing prompt`);
    }
    if (normalizeTier(row.expected_tier ?? "") === undefined) {
      throw new Error(
        `Row ${i + 1} has invalid expected_tier "${row.expected_tier ?? ""}" (use frontier|balanced|fast)`,
      );
    }
  }

  const startedAt = new Date().toISOString();
  const done = await ensureOutputFile(options.output, options.fresh);
  const resumed = done.size > 0 && !options.fresh;

  let runCount = 0;
  const pending: number[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const rowIndex = i + 1;
    if (done.has(rowIndex)) {
      continue;
    }
    pending.push(i);
  }

  const toRun = options.limit !== undefined ? pending.slice(0, options.limit) : pending;

  await writeFile(
    metaPath(options.output),
    JSON.stringify(
      writeMetaPayload({
        startedAt,
        input: options.input,
        output: options.output,
        judge,
        packageEntry: distPath,
        resumed,
        rowsTotal: inputs.length,
        rowsCompletedBefore: done.size,
        rowsRun: 0,
      }),
      null,
      2,
    ) + "\n",
    "utf8",
  );

  for (const i of toRun) {
    const input = inputs[i]!;
    const rowIndex = i + 1;
    const t0 = Date.now();
    let decision: ClassifyDecision | undefined;
    let error = "";
    try {
      decision = await axon.classify(input.prompt ?? "");
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const elapsedMs = Date.now() - t0;
    const outRow = rowFromDecision(input, rowIndex, decision, elapsedMs, error);
    await appendFile(options.output, stringifyCsvRow(outRow, [...OUTPUT_COLUMNS]), "utf8");
    runCount += 1;
    if (options.delayMs > 0 && i !== toRun[toRun.length - 1]) {
      await sleep(options.delayMs);
    }
  }

  const finalText = await readFile(options.output, "utf8");
  const resultRows = parseCsv(finalText);
  const metrics = computeMetrics(resultRows);
  const finishedAt = new Date().toISOString();

  await writeFile(
    metaPath(options.output),
    JSON.stringify(
      writeMetaPayload({
        startedAt,
        finishedAt,
        input: options.input,
        output: options.output,
        judge,
        packageEntry: distPath,
        resumed,
        metrics,
        rowsTotal: inputs.length,
        rowsCompletedBefore: done.size,
        rowsRun: runCount,
      }),
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return metrics;
}

async function main(): Promise<void> {
  loadDotEnv(REPO_ROOT);
  const parsed = parseArgs(process.argv.slice(2));
  if ("help" in parsed) {
    process.stdout.write(usage());
    return;
  }
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Eval input=${parsed.input}\nEval output=${parsed.output}\nUsing dist/ classify()\n`,
  );
  const metrics = await runEval(parsed);
  process.stdout.write(`\n${formatMetricsReport(metrics)}\n`);
  process.stdout.write(`Meta: ${metaPath(parsed.output)}\n`);
  if (!metrics.meets_overall_target) {
    process.exitCode = 2;
  }
}

const isDirect =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirect) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
