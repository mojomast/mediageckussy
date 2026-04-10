import OpenAI from "openai";
import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private readonly apiKey: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string; client?: OpenAI }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_OPENAI_API_KEY ?? "";
    this.model = options?.model ?? process.env.MEDIAGECKUSSY_OPENAI_MODEL ?? DEFAULT_MODEL;
    this.client = options?.client ?? new OpenAI({ apiKey: this.apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1024,
      response_format: req.responseFormat === "json" ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    });

    return {
      content: response.choices[0]?.message?.content ?? "",
      model: response.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
      },
      durationMs: Date.now() - startedAt,
    };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.apiKey) {
      return false;
    }

    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export function getOpenAIModel() {
  return process.env.MEDIAGECKUSSY_OPENAI_MODEL ?? DEFAULT_MODEL;
}
