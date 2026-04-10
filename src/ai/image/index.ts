import fs from "fs-extra";
import path from "node:path";
import { DalleImageProvider } from "./dalle.js";
import { FluxImageProvider } from "./flux.js";
import { ReplicateImageProvider } from "./replicate.js";
import { StabilityImageProvider } from "./stability.js";
import type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export type { ImageProvider, ImageRequest, ImageResult } from "./types.js";

export class MockImageProvider implements ImageProvider {
  readonly id = "mock-image";

  constructor(private readonly fixturePath: string) {}

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    await fs.ensureDir(path.dirname(outputPath));
    await fs.copyFile(this.fixturePath, outputPath);
    return { localPath: outputPath, model: "mock-image", prompt: req.prompt, negativePrompt: req.negativePrompt, durationMs: 0 };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export function resolveImageProvider(providerId: string = process.env.MEDIAGECKUSSY_IMAGE_PROVIDER ?? "dalle"): ImageProvider {
  switch (providerId) {
    case "dalle":
      return new DalleImageProvider();
    case "stability":
      return new StabilityImageProvider();
    case "replicate":
      return new ReplicateImageProvider();
    case "flux":
      return new FluxImageProvider();
    default:
      throw new Error(`Unknown image provider "${providerId}". Expected one of: dalle, stability, replicate, flux`);
  }
}
