# Axon Documentation

Axon is a TypeScript SDK for in-process routing of LLM prompts. It categorizes prompts into three tiers (Frontier, Balanced, and Fast) and dynamically routes them to the appropriate model based on prompt complexity and configuration.

## Core Concepts

Axon uses a Gate and Judge system.
1. Gate: Uses cheap heuristics to check if a prompt is trivial. If it is, it routes it to the Fast tier.
2. Judge: If the Gate fails, the developer-selected LLM or Jev backend rates the prompt on four axes. Axon's lookup table routes it to Frontier, Balanced, or Fast.

## Installation

```bash
npm install axon-llmrouter
```

## Axon Class

The primary interface for the SDK is the `Axon` class. 

### Constructor

Creates a new Axon instance.

```typescript
import { Axon } from "axon-llmrouter";

const axon = new Axon(config);
```

**Parameters:**
* `config` (AxonConfig): Configuration object containing tier definitions.

**AxonConfig Structure:**
* `tiers`: Object containing configurations for `frontier`, `balanced`, and `fast` tiers. Each tier requires a `model` string, an `apiKey`, and an optional `baseURL`.
* `judge` (Optional): `JudgeConfig`, either `LLMJudgeConfig` (`provider: "llm"` or omitted) or `JevJudgeConfig` (`provider: "jev"`). Both require `model` and `apiKey`. Defaults to the Fast tier's LLM if omitted.
* `fallbackTier`: The tier to use when judging or the selected completion fails. Must be one of `frontier`, `balanced`, or `fast`. An irreversible Frontier completion failure stops inference.

### Methods

#### `infer(prompt, optionsOrContext?)`

Main method to execute a prompt through the router. It classifies the prompt and requests completion from the chosen tier.

**Parameters:**
* `prompt` (string): The prompt to send.
* `optionsOrContext` (Optional): Context object or options containing prior messages and code context.

**Returns:**
A Promise resolving to an `InferResult` which can be one of three states:
* `InferSuccess`: Contains the model `response`, chosen `tier`, `costSaved`, and `latencySaved`.
* `InferDegraded`: Contains a fallback `response`, the fallback `tier`, `costSaved`, `latencySaved`, `failedStage`, and `failedReason`.
* `InferStopped`: Occurs when inference completely fails or requires confirmation. Contains `needsConfirmation: true`, `allocatedTier`, `failedStage`, `failedReason`, and a developer-facing `response` note.

#### `classify(prompt, optionsOrContext?)`

Evaluates a prompt through the Gate and Judge without calling the chosen model for a completion. Useful for dry runs or testing routing behavior.

**Parameters:**
* `prompt` (string): The prompt to classify.
* `optionsOrContext` (Optional): Context object or options.

**Returns:**
A Promise resolving to a `RoutingDecision` indicating the `allocatedTier`, the `source` (gate, judge, or judge_failed), and the results of the evaluation.

#### `health(options?)`

Checks the configuration health or live network health of the configured tiers.

**Parameters:**
* `options` (Optional): HealthOptions object. If `{ live: true }` is passed, it sends actual API requests to test the connection.

**Returns:**
A Promise resolving to a `HealthStatus` object indicating the status of each tier (e.g., "ok", "failed: invalid key", "failed: missing baseURL").

## Providing Context

You can provide contextual information when calling `infer` or `classify`.

```typescript
await axon.infer("rewrite this function", {
  priorMessages: [{ role: "user", content: "earlier turn" }],
  codeContext: "function foo() {}",
  metadata: { requestId: "abc" },
});
```

Context items include:
* `priorMessages`: Array of previous conversation messages.
* `codeContext`: String containing relevant code blocks or files.
* `metadata`: Custom data sent to the selected Judge, but excluded from tier completions.

## Provider Support

Axon supports major LLM providers:
* OpenAI (`gpt-*`, `o1`, `o3`)
* Anthropic (`claude-*`)
* Gemini (`gemini-*`)
* Any OpenAI-compatible provider (requires setting `baseURL` in the tier configuration).

## Jev Judge

Set `judge: { provider: "jev", model: "jev-latest", apiKey: process.env.TYPESAFE_API_KEY! }`.
Jev and the LLM Judge are equal alternatives; the SDK does not rank their quality.
Jev evaluates four Choice questions in one request and returns the same categorical axes.
Valid selected labels are accepted regardless of confidence. Jev failure uses `fallbackTier`
for the final answer directly, without calling another Judge.

Jev's optional `baseURL` defaults to `https://api.typesafe.ai/v1`; Axon appends `/systemone`.
Its optional `timeoutMs` is a positive integer in milliseconds, defaults to 10,000,
and covers the request and response body. Requests are not retried automatically.
The adapter uses built-in fetch with no additional dependencies and supports Node 18+.
`health()` checks completion tiers; it does not probe either Judge backend.

Jev produces structured decisions without autoregressive text generation. Output is free,
although its API reports output token usage. See the [TypeSafe API](https://docs.typesafe.ai/introduction/quickstart)
and [pricing](https://help.typesafe.ai/articles/5187202169-how-much-does-jev-cost).
