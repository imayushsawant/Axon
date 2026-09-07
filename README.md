# Axon

SDK-based multi-tier LLM router. Developers send a prompt; Axon chooses **Frontier**, **Balanced**, or **Fast** via a Gate (heuristics) then Judge (LLM rubrics) pipeline.

This repo is in early construction. The public surface is sketched; routing and providers are not implemented yet.

```ts
import { Axon } from "axon-llmrouter";

const axon = new Axon({
  tiers: {
    frontier: { model: "gpt-5", apiKey: "sk-..." },
    balanced: { model: "claude-sonnet", apiKey: "sk-..." },
    fast: { model: "claude-haiku", apiKey: "sk-..." },
  },
  judge: { model: "gemini-3.5-flash", apiKey: "sk-..." },
  fallbackTier: "balanced",
});
```
