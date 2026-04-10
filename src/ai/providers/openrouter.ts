import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

export class OpenRouterProvider implements LLMProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";

  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY ?? "";
    this.model = options?.model ?? process.env.MEDIAGECKUSSY_OPENROUTER_MODEL ?? "";
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mojomast/mediageckussy",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
        response_format: req.responseFormat === "json" ? { type: "json_object" } : undefined,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    const payload = await response.json() as {
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };

    return {
      content: payload.choices?.[0]?.message?.content ?? "",
      model: payload.model ?? this.model,
      usage: {
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
      },
      durationMs: Date.now() - startedAt,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey || !this.model) {
      return false;
    }

    try {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "HTTP-Referer": "https://github.com/mojomast/mediageckussy",
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
