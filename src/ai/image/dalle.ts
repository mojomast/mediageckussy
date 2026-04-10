import fs from "fs-extra";
import path from "node:path";
import OpenAI from "openai";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export class DalleImageProvider implements ImageProvider {
  readonly id = "dalle";

  private readonly apiKey: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(options?: { apiKey?: string; model?: string; client?: OpenAI }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_OPENAI_API_KEY ?? "";
    this.model = options?.model ?? "gpt-image-1";
    this.client = options?.client ?? new OpenAI({ apiKey: this.apiKey });
  }

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const startedAt = Date.now();
    const response = await this.client.images.generate({
      model: this.model,
      prompt: req.prompt,
      size: `${req.width}x${req.height}` as "1024x1024",
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("DALL-E did not return image data");
    }

    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, Buffer.from(b64, "base64"));
    return { localPath: outputPath, model: this.model, prompt: req.prompt, negativePrompt: req.negativePrompt, durationMs: Date.now() - startedAt };
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }
}
