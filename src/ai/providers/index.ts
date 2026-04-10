import { AnthropicProvider, getAnthropicModel } from "./anthropic.js";
import { OllamaProvider, getOllamaDefaults } from "./ollama.js";
import { OpenAIProvider, getOpenAIModel } from "./openai.js";
import { OpenRouterProvider } from "./openrouter.js";
import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

export { AnthropicProvider } from "./anthropic.js";
export { OllamaProvider } from "./ollama.js";
export { OpenAIProvider } from "./openai.js";
export { OpenRouterProvider } from "./openrouter.js";
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

export function resolveProvider(providerId: string = process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? ""): LLMProvider {
  switch (providerId) {
    case "openai": {
      if (!process.env.MEDIAGECKUSSY_OPENAI_API_KEY) {
        throw new Error(`Provider "openai" requires MEDIAGECKUSSY_OPENAI_API_KEY to be set`);
      }
      return new OpenAIProvider();
    }
    case "anthropic": {
      if (!process.env.MEDIAGECKUSSY_ANTHROPIC_API_KEY) {
        throw new Error(`Provider "anthropic" requires MEDIAGECKUSSY_ANTHROPIC_API_KEY to be set`);
      }
      return new AnthropicProvider();
    }
    case "openrouter": {
      if (!process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY) {
        throw new Error(`Provider "openrouter" requires MEDIAGECKUSSY_OPENROUTER_API_KEY to be set`);
      }
      if (!process.env.MEDIAGECKUSSY_OPENROUTER_MODEL) {
        throw new Error(`Provider "openrouter" requires MEDIAGECKUSSY_OPENROUTER_MODEL to be set`);
      }
      return new OpenRouterProvider();
    }
    case "ollama": {
      return new OllamaProvider();
    }
    case "": {
      throw new Error("MEDIAGECKUSSY_LLM_PROVIDER is not set. Expected one of: openai, anthropic, openrouter, ollama");
    }
    default: {
      throw new Error(`Unknown LLM provider "${providerId}". Expected one of: openai, anthropic, openrouter, ollama`);
    }
  }
}

export function describeProviderDefaults() {
  return {
    openai: getOpenAIModel(),
    anthropic: getAnthropicModel(),
    ollama: getOllamaDefaults(),
    openrouter: process.env.MEDIAGECKUSSY_OPENROUTER_MODEL ?? "",
  };
}
