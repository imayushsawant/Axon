# Axon

SDK-based multi-tier LLM router. Developers send a prompt; Axon chooses **Frontier**, **Balanced**, or **Fast** via a Gate (heuristics) then Judge (LLM rubrics) pipeline.

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

const result = await axon.infer("fix the spelling in this title", {
  priorMessages: [{ role: "user", content: "earlier turn" }],
  codeContext: "const title = 'Helo'",
  metadata: { requestId: "abc" },
});

if ("needsConfirmation" in result) {
  // Irreversible Frontier live-fail: no silent downgrade.
} else {
  result.response;
  result.tier;
  result.costSaved;
  result.latencySaved;
}

await axon.health();
// { frontier, balanced, fast, fallback } — e.g. "ok" | "failed: invalid key"
```

`judge` is optional and defaults to the Fast tier model. Import only `axon-llmrouter` — heuristics, rubrics, tier lookup, the router, and providers are not part of the public package surface.
