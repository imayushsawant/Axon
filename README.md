# Axon

npm: `[axon-llmrouter](https://www.npmjs.com/package/axon-llmrouter)`

Axon is a TypeScript SDK that runs in-process and **picks a model for each prompt**. Configuration defines three tiers: expensive/capable (**Frontier**), mid (**Balanced**), and cheap/fast (**Fast**). Call `infer()` and Axon routes simple work away from Frontier.

Axon does not host models. API keys are supplied by the integrating application (OpenAI, Anthropic, Gemini, or any OpenAI-compatible endpoint).

## How it decides

```
prompt
  → Gate (cheap heuristics)
      if it looks trivial → Fast, skip the Judge
      otherwise → Judge (a small LLM rates the prompt on four axes)
  → lookup table → Frontier | Balanced | Fast
  → call that tier’s model
```

If the chosen model fails, Axon tries the configured **fallback tier**, except when the Judge marked the work as **irreversible** and Frontier itself failed. Then inference stops and the integrating app decides what the end user sees.

Provider internals are not part of the public API. The surface is `new Axon(config)`, `infer()`, `classify()`, and `health()`.

## Install

```bash
npm install axon-llmrouter
```

Requires Node 18+.

```ts
import { Axon } from "axon-llmrouter";

const axon = new Axon({
  tiers: {
    frontier: { model: "gpt-5", apiKey: process.env.OPENAI_API_KEY! },
    balanced: { model: "claude-sonnet-4-5", apiKey: process.env.ANTHROPIC_API_KEY! },
    fast: { model: "claude-haiku-4-5", apiKey: process.env.ANTHROPIC_API_KEY! },
  },
  judge: { model: "gemini-2.5-flash", apiKey: process.env.GOOGLE_API_KEY! }, // optional; defaults to Fast
  fallbackTier: "balanced",
});

const result = await axon.infer("fix the spelling in this title");

if ("needsConfirmation" in result) {
  // No model answer. Use result.failedReason. result.response is not model text.
} else {
  result.response; // model text
  result.tier;     // "frontier" | "balanced" | "fast"
}
```

`judge` is optional. `fallbackTier` is one of the three tiers, not a fourth model.

`classify(prompt)` runs Gate + Judge only (no completion on the allocated tier). It returns `allocatedTier`, `source` (`gate` | `judge` | `judge_failed`), and Judge axes when the Judge succeeded.

## Eval

Measure routing quality with a labeled CSV you supply. Do not treat unaudited or AI-generated axis labels as ground truth for per-axis agreement.

1. Copy `eval/prompts.template.csv` and fill `prompt, category, expected_tier, audited, human_*`. Axis columns are optional; leave them blank on Gate-only rows.
2. `cp .env.example .env` and set `AXON_JUDGE_MODEL` / `AXON_JUDGE_API_KEY`.
3. `npm run build` then:

```bash
npm run eval -- --input eval/prompts.csv
```

The harness calls **`dist/` `classify()`**, appends each row to a results CSV (resume-safe; `--fresh` overwrites), writes a sidecar `.meta.json` with Judge model and timestamps, and prints:

- Overall tier-match rate (target ≥ 80%)
- Gate-decided vs Judge-decided tier-match
- Per-axis agreement only where `audited=yes` **and** the row produced live Judge axes

## Context

```ts
await axon.infer("rewrite this function", {
  priorMessages: [{ role: "user", content: "earlier turn" }],
  codeContext: "function foo() {}",
  metadata: { requestId: "abc" },
});
```

Chosen-tier (and fallback) completion gets **prompt + priorMessages + codeContext**. `metadata` is not sent to the model.

Pass context as a flat object (above) or as `{ context: { priorMessages, codeContext, metadata } }`.

## Providers (v1)


| Model string                                              | Adapter                                |
| --------------------------------------------------------- | -------------------------------------- |
| `gpt-*`, `o1` / `o3` / `o4`, `chatgpt-*`, or `openai/...` | OpenAI                                 |
| `claude-*` or `anthropic/...`                             | Anthropic                              |
| `gemini-*` or `gemini/...`                                | Gemini                                 |
| anything else                                             | OpenAI-compatible (`baseURL` required) |


OpenAI-compatible / unknown model IDs need baseURL:

```ts
frontier: {
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
}
```

Custom provider plugins are not supported in v1.

## What `infer()` returns



### Success

```ts
{
  response,      // model text
  tier,          // "frontier" | "balanced" | "fast"
  costSaved,     // experimental USD vs fallbackTier
  latencySaved,  // experimental ms vs fallbackTier
  usedFallback: false
}
```



### Degraded (Judge or allocated tier failed, fallback answered)

```ts
{
  response,      // fallback model text
  tier,          // the fallback tier that answered
  costSaved,
  latencySaved,
  usedFallback: true,
  failedStage,   // "judge" | "frontier" | "balanced" | "fast"
  failedReason
}
```



### Stopped (no model answer)

Axon did not produce a completion. Discriminant: `"needsConfirmation" in result`.

This happens when:

- Judge marked the prompt **irreversible** and **Frontier** live-failed (fallback is not used)
- The allocated tier **is** the fallback tier and that call failed
- Fallback was attempted and **also** failed

```ts
{
  needsConfirmation: true,
  allocatedTier,
  failedStage,
  failedReason,  // why the last model call failed
  usedFallback: false,
  response       // developer-facing note, not model output
}
```

The integrating app handles keys, outages, and end-user messaging. Do not show `response` as if it were the model's answer.

`costSaved` / `latencySaved` are **hardcoded experimental per-tier tables**, not live token usage.

## Health

```ts
await axon.health();
// { frontier, balanced, fast, fallback } → "ok" or "failed: invalid key" / "failed: missing baseURL"

await axon.health({ live: true }); // real API calls to the three tiers; costs money
```

Default health checks empty keys and missing `baseURL`, plus failures already seen during `infer()`. The constructor does not ping the network.

## Status

v0.1.1 on npm. Use the eval harness in `eval/` against a labeled CSV to measure routing quality.