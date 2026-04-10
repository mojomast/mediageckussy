import fs from "fs-extra";
import path from "node:path";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export class StabilityImageProvider implements ImageProvider {
  readonly id = "stability";

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const apiKey = process.env.MEDIAGECKUSSY_STABILITY_API_KEY;
    if (!apiKey) {
      throw new Error("MEDIAGECKUSSY_STABILITY_API_KEY is not set");
    }

    const startedAt = Date.now();
    const formData = new FormData();
    formData.append("prompt", req.prompt);
    formData.append("output_format", "png");

    const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/core", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "image/*",
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Stability request failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));

    return { localPath: outputPath, model: "stable-image-core", prompt: req.prompt, negativePrompt: req.negativePrompt, durationMs: Date.now() - startedAt };
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.MEDIAGECKUSSY_STABILITY_API_KEY);
  }
}
