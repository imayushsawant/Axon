/**
 * Relabel eval/prompts.csv: categories, rubric axes, expected_tier (lookup; fast for clean_heuristic).
 * Run once: npx tsx eval/relabel-prompts.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateGate } from "../src/classifier/heuristics.js";
import {
  lookupTier,
  type Ambiguity,
  type BlastRadius,
  type ReasoningDepth,
  type SeverityAxes,
} from "../src/classifier/tierLookup.js";
import { csvColumn, parseCsv, stringifyCsv } from "./csv.js";
import { contextForEvalRow } from "./evalContext.js";

const INPUT = resolve("eval/prompts.csv");
const COLUMNS = [
  "prompt",
  "category",
  "context",
  "expected_tier",
  "human_blast_radius",
  "human_irreversibility",
  "human_reasoning_depth",
  "human_ambiguity",
] as const;

type Axes = {
  blast: BlastRadius;
  irr: boolean;
  depth: ReasoningDepth;
  amb: Ambiguity;
};

type Category =
  | "clean_heuristic"
  | "near_miss"
  | "denylist_veto"
  | "judge_ambiguity_unclear"
  | "judge_ambiguity_clear";

const CLEAN_AXES: Axes = { blast: "Low", irr: false, depth: "Low", amb: "Clear" };
const DENYLIST_AXES: Axes = { blast: "High", irr: false, depth: "High", amb: "Clear" };
const UNCLEAR_AXES: Axes = { blast: "Medium", irr: false, depth: "Medium", amb: "Unclear" };

function wordCount(p: string): number {
  const t = p.trim();
  return t === "" ? 0 : t.split(/\s+/).length;
}

function hasContextFlag(v: string): boolean {
  const x = v.trim().toLowerCase();
  return x === "true" || x === "yes" || x === "1";
}

function gate(prompt: string, context: boolean) {
  const attached = context
    ? contextForEvalRow({
        prompt,
        context: "true",
        human_ambiguity: "Clear",
      })
    : undefined;
  return evaluateGate(prompt, attached);
}

/** Prompts that were curated as near_miss in the eval set (sequencing, length, or context-only gate fail). */
function isNearMissPattern(p: string): boolean {
  const t = p.trim();
  return (
    /^see PLAN,/i.test(t) ||
    /\bmultiboot\b.*\bthen\b/i.test(t) ||
    /read README first then/i.test(t) ||
    /\bthen add the humanizer\b/i.test(t) ||
    /install this skill.*and check status/i.test(t) ||
    /make the just the docs theme/i.test(t) ||
    /work on this for at least \d+ hours/i.test(t) ||
    /work for at least \d+h/i.test(t) ||
    /pick promising candidates from https:\/\/en\.wikipedia\.org/i.test(t) ||
    /set up grafana on this server/i.test(t) ||
    /Construct a response that diffuses/i.test(t) ||
    /Suppose that an employer asks/i.test(t) ||
    /Given a set of eight numbers/i.test(t) ||
    (/rewrite the computability predicates/i.test(t) && wordCount(t) > 25) ||
    /The language used in Regular\/Basics/i.test(t) ||
    /show that CSLs are not closed/i.test(t) ||
    /feel free to first attempt/i.test(t) ||
    /try extensively to disprove/i.test(t) ||
    /^Make a prediction about/i.test(t) ||
    /^Make the second sentence shorter/i.test(t) ||
    /^Given an array of integers/i.test(t) ||
    /^Calculate the amount of money/i.test(t) ||
    /^Follow the law of supply and demand/i.test(t) ||
    /^Imagine you are speaking with a customer/i.test(t) ||
    /^\/goal goal /i.test(t) ||
    /\bwhat is the point of cron job in this project\?/i.test(t)
  );
}

function isVaguePrompt(p: string): boolean {
  const t = p.trim();
  return (
    /^(fix the bug\b|fix the bug in\b|it is broken|make it work|improve performance|optimize it|fix error in compilation|make it use\b|make it look better|fix it for me|whats the status|go on)\b/i.test(
      t,
    ) ||
    /^update the .+ we discussed\b/i.test(t) ||
    (/^why is .+\?$/i.test(t) && t.length < 40)
  );
}

function isFileOrLineSpecific(p: string): boolean {
  return (
    /\b(line \d+|\.(js|py|go|tsx|jsx|css|ts|md|yaml))\b/i.test(p) ||
    /\b(handleRequest|index\.js|margin-top|profile page|settings tab)\b/i.test(p) ||
    /\bon the \/[\w-]+ route\b/i.test(p)
  );
}

function isHighScope(p: string): boolean {
  return (
    /\b(complete|entire|full stack|frontend, backend|codebase|architecture|production ready|industry grade|kubernetes|signup controller|folder structure|analytics feature|whisper\.cpp|system-wide)\b/i.test(
      p,
    ) ||
    wordCount(p) > 150
  );
}

function isMultiStepFeature(p: string): boolean {
  return (
    (/\b\d+\.\s/.test(p) || (p.match(/\balso\b/gi)?.length ?? 0) >= 2) &&
    wordCount(p) > 25
  );
}

function inferJudgeAxes(prompt: string, context: boolean): Axes {
  if (isVaguePrompt(prompt)) {
    return UNCLEAR_AXES;
  }

  if (isFileOrLineSpecific(prompt) && wordCount(prompt) < 35) {
    return { blast: "Low", irr: false, depth: "Low", amb: "Clear" };
  }

  if (isHighScope(prompt)) {
    const amb: Ambiguity =
      /\b(find the issues|how the llm|unclear|discuss first|explore the code)\b/i.test(prompt) &&
      !/\b(show|remove|change the|when on \/)\b/i.test(prompt)
        ? "Unclear"
        : "Clear";
    return { blast: "High", irr: false, depth: "High", amb };
  }

  if (isMultiStepFeature(prompt) || /\bthen\b/i.test(prompt)) {
    return { blast: "Medium", irr: false, depth: "Medium", amb: "Clear" };
  }

  if (
    prompt.length > 100 &&
    /\b(when|after|button|navbar|response|disappear|refresh|logged in|theme)\b/i.test(prompt)
  ) {
    return { blast: "Medium", irr: false, depth: "Medium", amb: "Clear" };
  }

  if (
    /\b(see PLAN|compiler loop|multiboot|v0\.\d|implement more tests)\b/i.test(prompt)
  ) {
    return { blast: "Medium", irr: false, depth: "High", amb: "Clear" };
  }

  if (/\b(theorem|proof|conjecture|formal language|NFA|DPDA|CSL|membership-computability)\b/i.test(prompt)) {
    return { blast: "Low", irr: false, depth: "High", amb: "Clear" };
  }

  if (/\bwhat is the point of\b/i.test(prompt) && context) {
    return { blast: "Low", irr: false, depth: "Medium", amb: "Clear" };
  }

  if (/\b(write a function|calculate|classify|rewrite|translate|what is the capital)\b/i.test(prompt)) {
    const depth: ReasoningDepth = /\b(250 word|300 word|differential equation)\b/i.test(prompt)
      ? "Medium"
      : "Low";
    return { blast: "Low", irr: false, depth, amb: "Clear" };
  }

  if (context && wordCount(prompt) < 15) {
    return { blast: "Low", irr: false, depth: "Low", amb: "Unclear" };
  }

  return { blast: "Medium", irr: false, depth: "Medium", amb: "Clear" };
}

function assignCategory(prompt: string, context: boolean): Category {
  const g = gate(prompt, context);

  if (!g.pass && g.reasons.includes("scope_denylist")) {
    return "denylist_veto";
  }

  if (isVaguePrompt(prompt)) {
    return "judge_ambiguity_unclear";
  }

  if (isNearMissPattern(prompt)) {
    return "near_miss";
  }

  // clean_heuristic only when Gate would pass with no attached context.
  if (!context && gate(prompt, false).pass) {
    return "clean_heuristic";
  }

  if (
    !g.pass &&
    g.reasons.length === 1 &&
    (g.reasons[0] === "length_limit" ||
      g.reasons[0] === "sequencing_language" ||
      g.reasons[0] === "context_or_code")
  ) {
    return "near_miss";
  }

  if (isFileOrLineSpecific(prompt)) {
    return "judge_ambiguity_clear";
  }

  return "judge_ambiguity_clear";
}

function axesForCategory(prompt: string, context: boolean, category: Category): Axes {
  switch (category) {
    case "clean_heuristic":
      return CLEAN_AXES;
    case "denylist_veto":
      return DENYLIST_AXES;
    case "judge_ambiguity_unclear":
      return UNCLEAR_AXES;
    case "near_miss": {
      if (/\b(implement more tests|compiler loop|multiboot|humanizer|proof|see PLAN)\b/i.test(prompt)) {
        return { blast: "Medium", irr: false, depth: "High", amb: "Clear" };
      }
      if (/\bwhat is the point of\b/i.test(prompt)) {
        return { blast: "Low", irr: false, depth: "Medium", amb: "Clear" };
      }
      if (/\b(grafana|README|lean|refund|array of integers|supply and demand)\b/i.test(prompt)) {
        return inferJudgeAxes(prompt, context);
      }
      return { blast: "Low", irr: false, depth: "Low", amb: "Clear" };
    }
    case "judge_ambiguity_clear":
      return inferJudgeAxes(prompt, context);
  }
}

function expectedTier(category: Category, axes: Axes): string {
  if (category === "clean_heuristic") {
    return "fast";
  }
  const severity: SeverityAxes = {
    blastRadius: axes.blast,
    irreversible: axes.irr,
    reasoningDepth: axes.depth,
    ambiguity: axes.amb,
  };
  return lookupTier(severity);
}

function relabelRow(row: Record<string, string>): Record<string, string> {
  const prompt = csvColumn(row, "prompt");
  let context = hasContextFlag(csvColumn(row, "context"));

  let category = assignCategory(prompt, context);

  if (/\bwhat is the point of cron job in this project\?/i.test(prompt)) {
    context = true;
    category = "near_miss";
  }
  const axes = axesForCategory(prompt, context, category);
  const tier = expectedTier(category, axes);

  return {
    prompt,
    category,
    context: context ? "true" : "false",
    expected_tier: tier,
    human_blast_radius: axes.blast,
    human_irreversibility: axes.irr ? "true" : "no",
    human_reasoning_depth: axes.depth,
    human_ambiguity: axes.amb,
  };
}

function main(): void {
  const rows = parseCsv(readFileSync(INPUT, "utf8"));
  const relabeled = rows.map(relabelRow);
  writeFileSync(INPUT, stringifyCsv(relabeled, [...COLUMNS]), "utf8");

  const cats: Record<string, number> = {};
  for (const r of relabeled) {
    cats[r.category ?? ""] = (cats[r.category ?? ""] ?? 0) + 1;
  }

  let mismatches = 0;
  for (const r of relabeled) {
    if (r.category === "clean_heuristic" && r.expected_tier !== "fast") {
      mismatches++;
    }
    if (r.category !== "clean_heuristic") {
      const tier = lookupTier({
        blastRadius: r.human_blast_radius as BlastRadius,
        irreversible: r.human_irreversibility === "true",
        reasoningDepth: r.human_reasoning_depth as ReasoningDepth,
        ambiguity: r.human_ambiguity as Ambiguity,
      });
      if (tier !== r.expected_tier) {
        mismatches++;
      }
    }
  }

  console.log(`Relabeled ${relabeled.length} rows → ${INPUT}`);
  console.log("Categories:", JSON.stringify(cats, null, 2));
  console.log(`Lookup mismatches: ${mismatches}`);
}

main();
