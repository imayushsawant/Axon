# Axon

In-process TypeScript SDK that routes a prompt to **Frontier**, **Balanced**, or **Fast**. A Gate (heuristics) may send trivial work to Fast; otherwise a Judge model rates axes and a lookup table picks the tier.

## Install

```bash
npm install axon-llmrouter
```

## Configure

```ts
import { Axon } from "axon-llmrouter";

const axon = new Axon({
  tiers: {
    frontier: { model: "gpt-5", apiKey: process.env.OPENAI_API_KEY! },
    balanced: { model: "claude-sonnet-4-5", apiKey: process.env.ANTHROPIC_API_KEY! },
    fast: { model: "claude-haiku-4-5", apiKey: process.env.ANTHROPIC_API_KEY! },
  },
  // Optional. Defaults to the Fast tier model.
  judge: { model: "gemini-2.5-flash", apiKey: process.env.GOOGLE_API_KEY! },
  fallbackTier: "balanced",
});
```

OpenAI-compatible / unknown model IDs need `baseURL`:

```ts
frontier: {
  model: "deepseek-chat",
  apiKey: process.env.DEEPSEEK_API_KEY!,
  baseURL: "https://api.deepseek.com",
}
```

`fallbackTier` is one of the three tiers, not a fourth model.

## Supported providers (v1)

- **OpenAI** — `gpt-*`, `o1` / `o3` / `o4`, `chatgpt-*`, or `openai/...`
- **Anthropic** — `claude-*` or `anthropic/...`
- **Gemini** — `gemini-*` or `gemini/...`
- **OpenAI-compatible** — any other model id, **requires** `baseURL`

Custom provider adapters are not part of v1.

## `infer()`

```ts
const result = await axon.infer("fix the spelling in this title", {
  priorMessages: [{ role: "user", content: "earlier turn" }],
  codeContext: "const title = 'Helo'",
  metadata: { requestId: "abc" },
});
```

You can also pass `{ context: { priorMessages, codeContext, metadata } }`.

Chosen-tier (and fallback) completion gets **prompt + priorMessages + codeContext**. `metadata` is not sent to the model.

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
  failedReason,  // why the last model call failed — use this
  usedFallback: false,
  response       // developer-facing note, not model output
}
```

Handle keys, outages, and end-user messaging yourself. Do not show `response` as if it were the model’s answer.

`costSaved` / `latencySaved` are **hardcoded experimental per-tier tables**, not live token usage.

## `health()`

Structural by default (empty `apiKey`, missing `baseURL` for openai-compatible). Also includes status cached from a prior `infer()` live failure.

```ts
await axon.health();
// { frontier, balanced, fast, fallback } e.g. "ok" | "failed: invalid key"
```

`health({ live: true })` sends a tiny completion to frontier, balanced, and fast (real API calls and cost). Tiers that already fail structurally are not probed. `fallback` copies the fallback tier’s result. Judge is not a separate health field.

The constructor does not ping the network.
