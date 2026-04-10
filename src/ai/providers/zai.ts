import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

const DEFAULT_MODEL = "glm-4.5-flash";

export class ZAIProvider implements LLMProvider {
  readonly id = "zai";
  readonly name = "Z.AI";

  private readonly apiKey: string;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_ZAI_API_KEY ?? "";
    this.model = options?.model ?? process.env.MEDIAGECKUSSY_ZAI_MODEL ?? DEFAULT_MODEL;
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const response = await fetch("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
        stream: false,
        response_format: req.responseFormat === "json" ? { type: "json_object" } : { type: "text" },
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Z.AI request failed with status ${response.status}`);
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
    return Boolean(this.apiKey && this.model);
  }
}

export function getZAIModel() {
  return process.env.MEDIAGECKUSSY_ZAI_MODEL ?? DEFAULT_MODEL;
}
