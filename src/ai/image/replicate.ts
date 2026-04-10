import fs from "fs-extra";
import path from "node:path";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export class ReplicateImageProvider implements ImageProvider {
  readonly id = "replicate";

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const apiKey = process.env.MEDIAGECKUSSY_REPLICATE_API_KEY;
    if (!apiKey) {
      throw new Error("MEDIAGECKUSSY_REPLICATE_API_KEY is not set");
    }

    const startedAt = Date.now();
    const createResponse = await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST",
      headers: {
        Authorization: `Token ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        version: "black-forest-labs/flux-schnell",
        input: { prompt: req.prompt },
      }),
    });

    if (!createResponse.ok) {
      throw new Error(`Replicate request failed with status ${createResponse.status}`);
    }

    const prediction = await createResponse.json() as { urls?: { get?: string } };
    const pollResponse = await fetch(prediction.urls?.get ?? "", {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const payload = await pollResponse.json() as { output?: string | string[] };
    const url = Array.isArray(payload.output) ? payload.output[0] : payload.output;
    if (!url) {
      throw new Error("Replicate did not return an output URL");
    }

    const imageResponse = await fetch(url);
    const arrayBuffer = await imageResponse.arrayBuffer();
    await fs.ensureDir(path.dirname(outputPath));
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
    return { localPath: outputPath, model: "replicate", prompt: req.prompt, negativePrompt: req.negativePrompt, durationMs: Date.now() - startedAt };
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(process.env.MEDIAGECKUSSY_REPLICATE_API_KEY);
  }
}
