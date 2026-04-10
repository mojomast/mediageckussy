import Anthropic from "@anthropic-ai/sdk";
import type { TextBlock } from "@anthropic-ai/sdk/resources/messages/messages";
import type { CompletionRequest, CompletionResponse, LLMProvider } from "./types.js";

const DEFAULT_MODEL = "claude-haiku-3-5";

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private readonly apiKey: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string; client?: Anthropic }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_ANTHROPIC_API_KEY ?? "";
    this.model = options?.model ?? process.env.MEDIAGECKUSSY_ANTHROPIC_MODEL ?? DEFAULT_MODEL;
    this.client = options?.client ?? new Anthropic({ apiKey: this.apiKey });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const startedAt = Date.now();
    const response = await this.client.messages.create({
      model: this.model,
      system: req.system,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 1024,
      messages: [
        {
          role: "user",
          content: req.user,
        },
      ],
    });

    const content = response.content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    return {
      content,
      model: response.model,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
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

export function getAnthropicModel() {
  return process.env.MEDIAGECKUSSY_ANTHROPIC_MODEL ?? DEFAULT_MODEL;
}
