import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.2";

export class OllamaProvider implements LLMProvider {
  readonly id = "ollama";
  readonly name = "Ollama";

  private readonly baseUrl: string;
  private readonly model: string;

  constructor(options?: { baseUrl?: string; model?: string }) {
    this.baseUrl = options?.baseUrl ?? process.env.MEDIAGECKUSSY_OLLAMA_BASE_URL ?? DEFAULT_BASE_URL;
    this.model = options?.model ?? process.env.MEDIAGECKUSSY_OLLAMA_MODEL ?? DEFAULT_MODEL;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const response = await fetch(new URL("/api/generate", this.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        prompt: `${req.system}\n\n${req.user}`,
        stream: false,
        options: {
          temperature: req.temperature ?? 0.7,
          num_predict: req.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed with status ${response.status}`);
    }

    const payload = await response.json() as {
      response?: string;
      model?: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: payload.response ?? "",
      model: payload.model ?? this.model,
      usage: {
        promptTokens: payload.prompt_eval_count ?? 0,
        completionTokens: payload.eval_count ?? 0,
      },
      durationMs: Date.now() - startedAt,
    };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(new URL("/api/tags", this.baseUrl));
      if (!response.ok) {
        return false;
      }

      const payload = await response.json() as {
        models?: Array<{ name?: string; model?: string }>;
      };

      return payload.models?.some((entry) => (entry.name ?? entry.model ?? "").startsWith(this.model)) ?? false;
    } catch {
      return false;
    }
  }
}

export function getOllamaDefaults() {
  return {
    baseUrl: process.env.MEDIAGECKUSSY_OLLAMA_BASE_URL ?? DEFAULT_BASE_URL,
    model: process.env.MEDIAGECKUSSY_OLLAMA_MODEL ?? DEFAULT_MODEL,
  };
}
