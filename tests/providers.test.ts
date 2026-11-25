import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildChatMessages,
  complete,
  normalizeProviderFailure,
  registerProviderAdapter,
  resolveProviderId,
  type ProviderBindings,
  type StreamEvent,
} from "../src/models/providers.js";

async function* successStream(
  text: string,
  usage?: StreamEvent["usage"],
): AsyncGenerator<StreamEvent> {
  yield { type: "RUN_STARTED" };
  yield { type: "TEXT_MESSAGE_CONTENT", delta: text };
  yield {
    type: "RUN_FINISHED",
    ...(usage !== undefined ? { usage } : {}),
  };
}

async function* errorStream(message: string): AsyncGenerator<StreamEvent> {
  yield { type: "RUN_ERROR", message };
}

function unusedNative(): never {
  throw new Error("native adapter should not be used");
}

function bindings(
  stream: AsyncIterable<StreamEvent>,
  overrides: Partial<ProviderBindings> = {},
): ProviderBindings {
  return {
    createOpenaiChat: (model, apiKey) => ({ provider: "openai", model, apiKey }),
    createAnthropicChat: (model, apiKey) => ({
      provider: "anthropic",
      model,
      apiKey,
    }),
    createGeminiChat: (model, apiKey) => ({
      provider: "gemini",
      model,
      apiKey,
    }),
    createOpenaiCompatible: (model, apiKey, baseURL) => ({
      provider: "openai-compatible",
      model,
      apiKey,
      baseURL,
    }),
    chat: () => stream,
    ...overrides,
  };
}

test("resolveProviderId maps native prefixes and falls back to openai-compatible", () => {
  assert.equal(resolveProviderId("gpt-4o"), "openai");
  assert.equal(resolveProviderId("gpt-5"), "openai");
  assert.equal(resolveProviderId("o3-mini"), "openai");
  assert.equal(resolveProviderId("openai/gpt-4o-mini"), "openai");
  assert.equal(resolveProviderId("claude-sonnet"), "anthropic");
  assert.equal(resolveProviderId("anthropic/claude-haiku-4-5"), "anthropic");
  assert.equal(resolveProviderId("gemini-2.5-flash"), "gemini");
  assert.equal(resolveProviderId("gemini/gemini-2.5-pro"), "gemini");
  assert.equal(resolveProviderId("google/gemini-2.5-flash"), "gemini");
  assert.equal(resolveProviderId("deepseek-chat"), "openai-compatible");
  assert.equal(resolveProviderId("kimi-k2"), "openai-compatible");
  assert.equal(
    resolveProviderId("openai-compatible/deepseek-chat"),
    "openai-compatible",
  );
});

test("buildChatMessages sends priorMessages, codeContext, then prompt", () => {
  assert.deepEqual(
    buildChatMessages({
      prompt: "fix this",
      priorMessages: [{ role: "user", content: "hi" }],
      codeContext: "const x = 1",
    }),
    [
      { role: "user", content: "hi" },
      { role: "user", content: "Code context:\nconst x = 1" },
      { role: "user", content: "fix this" },
    ],
  );
});

test("complete returns text, usage, latency, and provider from mocked chat()", async () => {
  let seenModel: string | undefined;
  let seenKey: string | undefined;
  let seenMessages: unknown;

  const result = await complete(
    { model: "gpt-4o", apiKey: "sk-test" },
    { prompt: "hello" },
    bindings(successStream("world", {
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
    }), {
      createOpenaiChat: (model, apiKey) => {
        seenModel = model;
        seenKey = apiKey;
        return { name: "openai-adapter" };
      },
      chat: (options) => {
        seenMessages = options.messages;
        return successStream("world", {
          promptTokens: 3,
          completionTokens: 1,
          totalTokens: 4,
        });
      },
    }),
  );

  assert.equal(seenModel, "gpt-4o");
  assert.equal(seenKey, "sk-test");
  assert.deepEqual(seenMessages, [{ role: "user", content: "hello" }]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.text, "world");
    assert.equal(result.provider, "openai");
    assert.equal(result.model, "gpt-4o");
    assert.deepEqual(result.usage, {
      promptTokens: 3,
      completionTokens: 1,
      totalTokens: 4,
    });
    assert.equal(typeof result.latencyMs, "number");
    assert.ok(result.latencyMs >= 0);
  }
});

test("strips openai/ prefix before creating the adapter", async () => {
  let seenModel: string | undefined;
  await complete(
    { model: "openai/gpt-4o-mini", apiKey: "sk-test" },
    { prompt: "hello" },
    bindings(successStream("ok"), {
      createOpenaiChat: (model) => {
        seenModel = model;
        return {};
      },
    }),
  );
  assert.equal(seenModel, "gpt-4o-mini");
});

test("Anthropic models use the Anthropic adapter", async () => {
  let seen: unknown;
  const result = await complete(
    { model: "claude-sonnet-4-5", apiKey: "sk-ant" },
    { prompt: "hello" },
    bindings(successStream("hi"), {
      createOpenaiChat: unusedNative,
      createGeminiChat: unusedNative,
      createOpenaiCompatible: unusedNative,
      createAnthropicChat: (model, apiKey) => {
        seen = { model, apiKey };
        return seen;
      },
    }),
  );
  assert.deepEqual(seen, { model: "claude-sonnet-4-5", apiKey: "sk-ant" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "anthropic");
  }
});

test("Gemini models use the Gemini adapter", async () => {
  let seen: unknown;
  const result = await complete(
    { model: "gemini-2.5-flash", apiKey: "gk" },
    { prompt: "hello" },
    bindings(successStream("hi"), {
      createOpenaiChat: unusedNative,
      createAnthropicChat: unusedNative,
      createOpenaiCompatible: unusedNative,
      createGeminiChat: (model, apiKey) => {
        seen = { model, apiKey };
        return seen;
      },
    }),
  );
  assert.deepEqual(seen, { model: "gemini-2.5-flash", apiKey: "gk" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "gemini");
  }
});

test("Kimi/DeepSeek use openaiCompatible with baseURL", async () => {
  let seen: unknown;
  const result = await complete(
    {
      model: "deepseek-chat",
      apiKey: "ds-key",
      baseURL: "https://api.deepseek.com/v1",
    },
    { prompt: "hello" },
    bindings(successStream("ok"), {
      createOpenaiChat: unusedNative,
      createAnthropicChat: unusedNative,
      createGeminiChat: unusedNative,
      createOpenaiCompatible: (model, apiKey, baseURL) => {
        seen = { model, apiKey, baseURL };
        return seen;
      },
    }),
  );
  assert.deepEqual(seen, {
    model: "deepseek-chat",
    apiKey: "ds-key",
    baseURL: "https://api.deepseek.com/v1",
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "openai-compatible");
  }
});

test("openai-compatible without baseURL fails", async () => {
  const result = await complete(
    { model: "kimi-k2", apiKey: "k" },
    { prompt: "hello" },
    bindings(successStream("should not run"), {
      createOpenaiCompatible: unusedNative,
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: missing baseURL");
  }
});

test("RUN_ERROR becomes a provider failure status", async () => {
  const result = await complete(
    { model: "gpt-4o", apiKey: "sk-bad" },
    { prompt: "hello" },
    bindings(errorStream("Incorrect API key provided")),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: invalid key");
    assert.equal(result.reason, "Incorrect API key provided");
  }
});

test("thrown chat() errors are normalized and not rethrown", async () => {
  const result = await complete(
    { model: "gpt-4o", apiKey: "sk-test" },
    { prompt: "hello" },
    bindings(successStream("x"), {
      chat: () => {
        throw new Error("network down");
      },
    }),
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "failed: network down");
  }
});

test("normalizeProviderFailure maps auth errors to failed: invalid key", () => {
  const result = normalizeProviderFailure(
    new Error("Unauthorized: invalid api key"),
  );
  assert.equal(result.status, "failed: invalid key");
});

test("registerProviderAdapter allows a later TanStack adapter without OpenAI", async () => {
  registerProviderAdapter("mock", (model, apiKey) => ({ model, apiKey }));

  const result = await complete(
    { model: "mock/demo-1", apiKey: "k" },
    { prompt: "hi" },
    bindings(successStream("from-mock"), {
      createOpenaiChat: unusedNative,
      chat: (options) => {
        assert.deepEqual(options.adapter, { model: "demo-1", apiKey: "k" });
        return successStream("from-mock");
      },
    }),
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.provider, "mock");
    assert.equal(result.text, "from-mock");
  }
});
