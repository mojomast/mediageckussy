import crypto from "node:crypto";
import sharp from "sharp";
import type { ImageAdapterResult, ImageProviderAdapter, ImageRequest } from "../types.js";

export class StubImageAdapter implements ImageProviderAdapter {
  readonly id = "stub" as const;
  readonly name = "Stub Image Provider";
  readonly defaultModel = "stub-image";

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async generate(req: ImageRequest): Promise<ImageAdapterResult> {
    const hash = crypto.createHash("sha1").update(req.prompt).digest("hex");
    const background = `#${hash.slice(0, 6)}`;
    const overlay = `#${hash.slice(6, 12)}`;

    const data = await sharp({
      create: {
        width: req.width,
        height: req.height,
        channels: 4,
        background,
      },
    })
      .composite([
        {
          input: {
            create: {
              width: Math.max(1, Math.round(req.width * 0.22)),
              height: req.height,
              channels: 4,
              background: overlay,
            },
          },
          left: Math.max(0, Math.round(req.width * 0.08)),
          top: 0,
          blend: "overlay",
        },
      ])
      .png()
      .toBuffer();

    return {
      data,
      mimeType: "image/png",
      extension: "png",
      model: this.defaultModel,
    };
  }
}
