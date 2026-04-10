import fs from "fs-extra";
import path from "node:path";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export class FluxImageProvider implements ImageProvider {
  readonly id = "flux";

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const apiKey = process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY;
    const model = process.env.MEDIAGECKUSSY_OPENROUTER_MODEL;
    if (!apiKey || !model) {
      throw new Error("Flux via OpenRouter requires MEDIAGECKUSSY_OPENROUTER_API_KEY and MEDIAGECKUSSY_OPENROUTER_MODEL");
    }

    const startedAt = Date.now();
    const response = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/mojomast/mediageckussy",
      },
      body: JSON.stringify({ model, prompt: req.prompt, size: `${req.width}x${req.height}` }),
    });

    if (!response.ok) {
      throw new Error(`Flux image request failed with status ${response.status}`);
    }

    const payload = await response.json() as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = payload.data?.[0];
    await fs.ensureDir(path.dirname(outputPath));
    if (item?.b64_json) {
      await fs.writeFile(outputPath, Buffer.from(item.b64_json, "base64"));
    } else if (item?.url) {
      const imageResponse = await fetch(item.url);
      await fs.writeFile(outputPath, Buffer.from(await imageResponse.arrayBuffer()));
    } else {
      throw new Error("Flux did not return image data");
    }

    return { localPath: outputPath, model, prompt: req.prompt, negativePrompt: req.negativePrompt, durationMs: Date.now() - startedAt };
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY && process.env.MEDIAGECKUSSY_OPENROUTER_MODEL);
  }
}
