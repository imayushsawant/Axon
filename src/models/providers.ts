import { chat } from "@tanstack/ai";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import { createGeminiChat } from "@tanstack/ai-gemini";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { openaiCompatibleText } from "@tanstack/ai-openai/compatible";
import type { PriorMessage, TierConfig } from "../types.js";

export type ProviderId = string;

export type ProviderUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type ProviderSuccess = {
  ok: true;
  text: string;
  latencyMs: number;
  usage: ProviderUsage;
  provider: ProviderId;
  model: string;
};

export type ProviderFailure = {
  ok: false;
  status: string;
  reason: string;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

export type CompleteRequest = {
  prompt: string;
  priorMessages?: PriorMessage[];
  codeContext?: string;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatBindings = {
  adapter: unknown;
  messages: ChatMessage[];
};

export type StreamEvent = {
  type: string;
  delta?: string;
  message?: string;
  error?: { message?: string };
  usage?: unknown;
};

export type ProviderBindings = {
  chat: (options: ChatBindings) => AsyncIterable<StreamEvent>;
  createOpenaiChat: (model: string, apiKey: string) => unknown;
  createAnthropicChat: (model: string, apiKey: string) => unknown;
  createGeminiChat: (model: string, apiKey: string) => unknown;
  createOpenaiCompatible: (
    model: string,
    apiKey: string,
    baseURL: string,
  ) => unknown;
};

export type AdapterFactory = (
  model: string,
  apiKey: string,
  baseURL?: string,
) => unknown;

const NATIVE_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "gemini",
  "openai-compatible",
]);

const adapterFactories = new Map<ProviderId, AdapterFactory>();

function defaultCreateOpenaiChat(model: string, apiKey: string): unknown {
  return createOpenaiChat(
    model as Parameters<typeof createOpenaiChat>[0],
    apiKey,
  );
}

function defaultCreateAnthropicChat(model: string, apiKey: string): unknown {
  return createAnthropicChat(
    model as Parameters<typeof createAnthropicChat>[0],
    apiKey,
  );
}

function defaultCreateGeminiChat(model: string, apiKey: string): unknown {
  return createGeminiChat(
    model as Parameters<typeof createGeminiChat>[0],
    apiKey,
  );
}

function defaultCreateOpenaiCompatible(
  model: string,
  apiKey: string,
  baseURL: string,
): unknown {
  return openaiCompatibleText(model, { apiKey, baseURL });
}

const defaultBindings: ProviderBindings = {
  chat: (options) => {
    const systemPrompts = options.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content);
    const messages = options.messages.filter(
      (message) => message.role !== "system",
    );
    return chat({
      adapter: options.adapter as never,
      messages: messages as never,
      ...(systemPrompts.length > 0 ? { systemPrompts } : {}),
    }) as AsyncIterable<StreamEvent>;
  },
  createOpenaiChat: defaultCreateOpenaiChat,
  createAnthropicChat: defaultCreateAnthropicChat,
  createGeminiChat: defaultCreateGeminiChat,
  createOpenaiCompatible: defaultCreateOpenaiCompatible,
};

registerProviderAdapter("openai", defaultCreateOpenaiChat);
registerProviderAdapter("anthropic", defaultCreateAnthropicChat);
registerProviderAdapter("gemini", defaultCreateGeminiChat);
registerProviderAdapter(
  "openai-compatible",
  (model, apiKey, baseURL) => {
    if (baseURL === undefined || baseURL.trim() === "") {
      throw new Error("missing baseURL");
    }
    return defaultCreateOpenaiCompatible(model, apiKey, baseURL);
  },
);

export function registerProviderAdapter(
  providerId: ProviderId,
  factory: AdapterFactory,
): void {
  adapterFactories.set(providerId, factory);
}

function inferNativeProvider(model: string): ProviderId | undefined {
  const lower = model.toLowerCase();
  if (
    lower.startsWith("gpt-") ||
    lower.startsWith("o1") ||
    lower.startsWith("o3") ||
    lower.startsWith("o4") ||
    lower.startsWith("chatgpt-")
  ) {
    return "openai";
  }
  if (lower.startsWith("claude-")) {
    return "anthropic";
  }
  if (lower.startsWith("gemini-")) {
    return "gemini";
  }
  return undefined;
}

export function resolveProviderId(model: string): ProviderId {
  const trimmed = model.trim();
  const slash = trimmed.indexOf("/");
  if (slash > 0) {
    const prefix = trimmed.slice(0, slash).toLowerCase();
    if (NATIVE_PROVIDERS.has(prefix) || adapterFactories.has(prefix)) {
      return prefix;
    }
    return resolveProviderId(trimmed.slice(slash + 1));
  }

  return inferNativeProvider(trimmed) ?? "openai-compatible";
}

function resolveModelName(model: string, providerId: ProviderId): string {
  const prefix = `${providerId}/`;
  if (model.toLowerCase().startsWith(prefix)) {
    return model.slice(prefix.length);
  }
  return model;
}

function mapRole(role: string): ChatMessage["role"] {
  if (role === "system" || role === "assistant" || role === "user") {
    return role;
  }
  return "user";
}

export function buildChatMessages(request: CompleteRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (request.priorMessages !== undefined) {
    for (const message of request.priorMessages) {
      messages.push({
        role: mapRole(message.role),
        content: message.content,
      });
    }
  }

  if (request.codeContext !== undefined && request.codeContext.trim() !== "") {
    messages.push({
      role: "user",
      content: `Code context:\n${request.codeContext}`,
    });
  }

  messages.push({
    role: "user",
    content: request.prompt,
  });

  return messages;
}

function extractUsage(usage: unknown): ProviderUsage {
  if (usage == null) {
    return {};
  }

  if (Array.isArray(usage)) {
    const first = usage[0] as
      | {
          inputTokens?: number;
          outputTokens?: number;
          totalTokens?: number;
          promptTokens?: number;
          completionTokens?: number;
        }
      | undefined;
    if (first === undefined) {
      return {};
    }
    return {
      ...(first.promptTokens !== undefined || first.inputTokens !== undefined
        ? { promptTokens: first.promptTokens ?? first.inputTokens }
        : {}),
      ...(first.completionTokens !== undefined ||
      first.outputTokens !== undefined
        ? {
            completionTokens: first.completionTokens ?? first.outputTokens,
          }
        : {}),
      ...(first.totalTokens !== undefined
        ? { totalTokens: first.totalTokens }
        : {}),
    };
  }

  if (typeof usage === "object") {
    const record = usage as {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    return {
      ...(record.promptTokens !== undefined
        ? { promptTokens: record.promptTokens }
        : {}),
      ...(record.completionTokens !== undefined
        ? { completionTokens: record.completionTokens }
        : {}),
      ...(record.totalTokens !== undefined
        ? { totalTokens: record.totalTokens }
        : {}),
    };
  }

  return {};
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  if (typeof error === "string" && error.trim() !== "") {
    return error;
  }
  return "unknown provider error";
}

export function normalizeProviderFailure(error: unknown): ProviderFailure {
  const reason = errorText(error);
  const lower = reason.toLowerCase();
  const invalidKey =
    lower.includes("invalid api key") ||
    lower.includes("incorrect api key") ||
    (lower.includes("invalid") && lower.includes("key")) ||
    lower.includes("unauthorized") ||
    lower.includes("authentication");

  return {
    ok: false,
    status: invalidKey ? "failed: invalid key" : `failed: ${reason}`,
    reason,
  };
}

async function consumeStream(
  stream: AsyncIterable<StreamEvent>,
): Promise<{ text: string; usage: ProviderUsage }> {
  let text = "";
  let usage: ProviderUsage = {};

  for await (const chunk of stream) {
    if (chunk.type === "RUN_ERROR") {
      throw new Error(chunk.message ?? chunk.error?.message ?? "RUN_ERROR");
    }
    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta !== undefined) {
      text += chunk.delta;
    }
    if (chunk.type === "RUN_FINISHED" && chunk.usage !== undefined) {
      usage = extractUsage(chunk.usage);
    }
  }

  return { text, usage };
}

function createAdapter(
  providerId: ProviderId,
  modelName: string,
  config: TierConfig,
  bindings: ProviderBindings,
): unknown {
  switch (providerId) {
    case "openai":
      return bindings.createOpenaiChat(modelName, config.apiKey);
    case "anthropic":
      return bindings.createAnthropicChat(modelName, config.apiKey);
    case "gemini":
      return bindings.createGeminiChat(modelName, config.apiKey);
    case "openai-compatible": {
      const baseURL = config.baseURL;
      if (baseURL === undefined || baseURL.trim() === "") {
        throw new Error("missing baseURL");
      }
      return bindings.createOpenaiCompatible(modelName, config.apiKey, baseURL);
    }
    default: {
      const factory = adapterFactories.get(providerId);
      if (factory === undefined) {
        throw new Error(
          `No TanStack adapter registered for provider "${providerId}"`,
        );
      }
      if (config.baseURL !== undefined) {
        return factory(modelName, config.apiKey, config.baseURL);
      }
      return factory(modelName, config.apiKey);
    }
  }
}

export async function complete(
  config: TierConfig,
  request: CompleteRequest,
  bindings: ProviderBindings = defaultBindings,
): Promise<ProviderResult> {
  const providerId = resolveProviderId(config.model);

  if (providerId === "openai-compatible") {
    if (config.baseURL === undefined || config.baseURL.trim() === "") {
      return {
        ok: false,
        status: "failed: missing baseURL",
        reason: `OpenAI-compatible model "${config.model}" requires baseURL`,
      };
    }
  }

  const modelName = resolveModelName(config.model, providerId);
  const started = Date.now();
  try {
    const adapter = createAdapter(providerId, modelName, config, bindings);
    const stream = bindings.chat({
      adapter,
      messages: buildChatMessages(request),
    });
    const { text, usage } = await consumeStream(stream);
    return {
      ok: true,
      text,
      latencyMs: Date.now() - started,
      usage,
      provider: providerId,
      model: modelName,
    };
  } catch (error) {
    const failure = normalizeProviderFailure(error);
    if (failure.reason.toLowerCase().includes("missing baseurl")) {
      return {
        ok: false,
        status: "failed: missing baseURL",
        reason: failure.reason,
      };
    }
    return failure;
  }
}
