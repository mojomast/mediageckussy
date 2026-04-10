import { AnthropicProvider, getAnthropicModel } from "./anthropic.js";
import { OllamaProvider, getOllamaDefaults } from "./ollama.js";
import { OpenAIProvider, getOpenAIModel } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import { ZAIProvider, getZAIModel } from "./zai.js";
import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

export { AnthropicProvider } from "./anthropic.js";
export { OllamaProvider } from "./ollama.js";
export { OpenAIProvider } from "./openai.js";
export { OpenRouterProvider } from "./openrouter.js";
export { ZAIProvider } from "./zai.js";
export type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

export class MockLLMProvider implements LLMProvider {
  readonly id = "mock";
  readonly name = "Mock LLM";

  private index = 0;

  constructor(private readonly responses: string[]) {}

  async complete(_: CompletionRequest): Promise<CompletionResponse> {
    if (this.responses.length === 0) {
      throw new Error("MockLLMProvider requires at least one response");
    }

    const content = this.responses[this.index % this.responses.length];
    this.index += 1;

    return {
      content,
      model: "mock-llm",
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
      durationMs: 0,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export function resolveProvider(providerId: string = process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? "", overrides?: { model?: string }): LLMProvider {
  switch (providerId) {
    case "openai": {
      if (!process.env.MEDIAGECKUSSY_OPENAI_API_KEY) {
        throw new Error(`Provider "openai" requires MEDIAGECKUSSY_OPENAI_API_KEY to be set`);
      }
        return new OpenAIProvider({ model: overrides?.model });
    }
    case "anthropic": {
      if (!process.env.MEDIAGECKUSSY_ANTHROPIC_API_KEY) {
        throw new Error(`Provider "anthropic" requires MEDIAGECKUSSY_ANTHROPIC_API_KEY to be set`);
      }
        return new AnthropicProvider({ model: overrides?.model });
    }
    case "openrouter": {
      if (!process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY) {
        throw new Error(`Provider "openrouter" requires MEDIAGECKUSSY_OPENROUTER_API_KEY to be set`);
      }
      if (!process.env.MEDIAGECKUSSY_OPENROUTER_MODEL) {
        throw new Error(`Provider "openrouter" requires MEDIAGECKUSSY_OPENROUTER_MODEL to be set`);
      }
        return new OpenRouterProvider({ model: overrides?.model });
      }
      case "zai": {
        if (!process.env.MEDIAGECKUSSY_ZAI_API_KEY) {
          throw new Error(`Provider "zai" requires MEDIAGECKUSSY_ZAI_API_KEY to be set`);
        }
        return new ZAIProvider({ model: overrides?.model });
      }
      case "ollama": {
        return new OllamaProvider({ model: overrides?.model });
      }
      case "": {
        throw new Error("MEDIAGECKUSSY_LLM_PROVIDER is not set. Expected one of: openai, anthropic, openrouter, zai, ollama");
      }
      default: {
        throw new Error(`Unknown LLM provider "${providerId}". Expected one of: openai, anthropic, openrouter, zai, ollama`);
      }
  }
}

export function describeProviderDefaults() {
  return {
    openai: getOpenAIModel(),
    anthropic: getAnthropicModel(),
    ollama: getOllamaDefaults(),
    openrouter: process.env.MEDIAGECKUSSY_OPENROUTER_MODEL ?? "",
    zai: getZAIModel(),
  };
}
