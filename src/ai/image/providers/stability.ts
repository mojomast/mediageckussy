import type { ImageAdapterResult, ImageProviderAdapter, ImageRequest } from "../types.js";

export class StabilitySd3Adapter implements ImageProviderAdapter {
  readonly id = "stability-sd3" as const;
  readonly name = "Stability SD3";
  readonly defaultModel: string;

  private readonly apiKey: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_STABILITY_API_KEY ?? "";
    this.defaultModel = options?.model ?? "sd3.5-large";
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(req: ImageRequest): Promise<ImageAdapterResult> {
    const formData = new FormData();
    formData.append("prompt", req.prompt);
    formData.append("output_format", req.outputFormat ?? "png");
    formData.append("aspect_ratio", toStabilityAspectRatio(req.width, req.height));
    formData.append("model", this.defaultModel);
    if (req.negativePrompt) {
      formData.append("negative_prompt", req.negativePrompt);
    }
    if (typeof req.seed === "number") {
      formData.append("seed", String(req.seed));
    }

    const response = await fetch("https://api.stability.ai/v2beta/stable-image/generate/sd3", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        Accept: "image/*",
      },
      body: formData,
    });

    if (!response.ok) {
      throw toHttpError("Stability SD3 request failed", response.status, await safeReadResponseText(response));
    }

    return {
      data: Buffer.from(await response.arrayBuffer()),
      mimeType: response.headers.get("content-type") ?? "image/png",
      extension: response.headers.get("content-type")?.includes("webp") ? "webp" : response.headers.get("content-type")?.includes("jpeg") ? "jpg" : "png",
      model: this.defaultModel,
    };
  }
}

function toStabilityAspectRatio(width: number, height: number) {
  if (width === height) {
    return "1:1";
  }
  if (width > height) {
    return width / height >= 1.7 ? "16:9" : "3:2";
  }
  return height / width >= 1.7 ? "9:16" : "2:3";
}

function toHttpError(message: string, status: number, details: string) {
  const error = new Error(`${message} (${status})${details ? `: ${details}` : ""}`) as Error & { status?: number };
  error.status = status;
  return error;
}

async function safeReadResponseText(response: Response) {
  try {
    return (await response.text()).slice(0, 400);
  } catch {
    return "";
  }
}
