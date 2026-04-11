import OpenAI from "openai";
import type { ImageAdapterResult, ImageProviderAdapter, ImageRequest } from "../types.js";

export class OpenAIDalle3Adapter implements ImageProviderAdapter {
  readonly id = "openai-dalle3" as const;
  readonly name = "OpenAI DALL-E 3";
  readonly defaultModel: string;

  private readonly apiKey: string;
  private readonly client: OpenAI;

  constructor(options?: { apiKey?: string; model?: string; client?: OpenAI }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_OPENAI_API_KEY ?? "";
    this.defaultModel = options?.model ?? "dall-e-3";
    this.client = options?.client ?? new OpenAI({ apiKey: this.apiKey });
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(req: ImageRequest): Promise<ImageAdapterResult> {
    const response = await this.client.images.generate({
      model: this.defaultModel,
      prompt: req.prompt,
      size: normalizeOpenAIImageSize(req.width, req.height),
      quality: req.style === "hd" ? "hd" : "standard",
      response_format: "b64_json",
    });

    const item = response.data?.[0];
    if (!item?.b64_json) {
      throw new Error("OpenAI DALL-E 3 did not return image data");
    }

    return {
      data: Buffer.from(item.b64_json, "base64"),
      mimeType: "image/png",
      extension: "png",
      model: this.defaultModel,
      revisedPrompt: item.revised_prompt ?? undefined,
    };
  }
}

function normalizeOpenAIImageSize(width: number, height: number): "1024x1024" | "1024x1792" | "1792x1024" {
  if (width === height) {
    return "1024x1024";
  }
  return height > width ? "1024x1792" : "1792x1024";
}
