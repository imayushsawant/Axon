# Axon Documentation

Axon is a TypeScript SDK for in-process routing of LLM prompts. It categorizes prompts into three tiers (Frontier, Balanced, and Fast) and dynamically routes them to the appropriate model based on prompt complexity and configuration.

## Core Concepts

Axon uses a Gate and Judge system.
1. Gate: Uses cheap heuristics to check if a prompt is trivial. If it is, it routes it to the Fast tier.
2. Judge: If the Gate fails, a small LLM rates the prompt on complexity axes and routes it to Frontier, Balanced, or Fast.

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
* `judge` (Optional): Configuration for the Judge model. Defaults to the Fast tier if omitted.
* `fallbackTier`: The tier to fall back to if the selected model fails. Must be one of `frontier`, `balanced`, or `fast`.

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
* `metadata`: Custom data not sent to the model but passed along the pipeline.

## Provider Support

Axon supports major LLM providers:
* OpenAI (`gpt-*`, `o1`, `o3`)
* Anthropic (`claude-*`)
* Gemini (`gemini-*`)
* Any OpenAI-compatible provider (requires setting `baseURL` in the tier configuration).
