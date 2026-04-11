import type { ImageAdapterResult, ImageProviderAdapter, ImageRequest } from "../types.js";

type FalSubmitResponse = {
  images?: Array<{ url?: string }>;
  request_id?: string;
  response_url?: string;
  status_url?: string;
};

type FalStatusResponse = {
  status?: string;
  images?: Array<{ url?: string }>;
};

export class FalFluxAdapter implements ImageProviderAdapter {
  readonly id = "fal-flux" as const;
  readonly name = "FAL Flux";
  readonly defaultModel: string;

  private readonly apiKey: string;

  constructor(options?: { apiKey?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env.MEDIAGECKUSSY_FAL_API_KEY ?? process.env.FAL_KEY ?? "";
    this.defaultModel = options?.model ?? "fal-ai/flux/schnell";
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.apiKey);
  }

  async generate(req: ImageRequest): Promise<ImageAdapterResult> {
    const submitResponse = await fetch(`https://queue.fal.run/${this.defaultModel}`, {
      method: "POST",
      headers: {
        Authorization: `Key ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: req.prompt,
        image_size: toFalImageSize(req.width, req.height),
        num_images: 1,
        num_inference_steps: req.steps,
        seed: req.seed,
      }),
    });

    if (!submitResponse.ok) {
      throw toHttpError("FAL Flux submit failed", submitResponse.status, await safeReadResponseText(submitResponse));
    }

    const submitPayload = await submitResponse.json() as FalSubmitResponse;
    const directUrl = submitPayload.images?.[0]?.url;
    const resultUrl = directUrl ? undefined : submitPayload.response_url ?? submitPayload.status_url;
    const imageUrl = directUrl ?? await pollFalResult(resultUrl, this.apiKey);
    if (!imageUrl) {
      throw new Error("FAL Flux did not return an image URL");
    }

    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw toHttpError("FAL Flux image download failed", imageResponse.status, await safeReadResponseText(imageResponse));
    }

    return {
      data: Buffer.from(await imageResponse.arrayBuffer()),
      mimeType: imageResponse.headers.get("content-type") ?? "image/png",
      extension: imageResponse.headers.get("content-type")?.includes("webp") ? "webp" : imageResponse.headers.get("content-type")?.includes("jpeg") ? "jpg" : "png",
      model: this.defaultModel,
      sourceUrl: imageUrl,
    };
  }
}

async function pollFalResult(resultUrl: string | undefined, apiKey: string) {
  if (!resultUrl) {
    return undefined;
  }

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const response = await fetch(resultUrl, {
      headers: { Authorization: `Key ${apiKey}` },
    });
    if (!response.ok) {
      throw toHttpError("FAL Flux status check failed", response.status, await safeReadResponseText(response));
    }

    const payload = await response.json() as FalStatusResponse;
    const imageUrl = payload.images?.[0]?.url;
    if (imageUrl) {
      return imageUrl;
    }
    if (payload.status === "FAILED") {
      throw new Error("FAL Flux request failed");
    }

    await delay(1000);
  }

  throw new Error("FAL Flux request timed out while waiting for image output");
}

function toFalImageSize(width: number, height: number) {
  if (width === height) {
    return "square_hd";
  }
  return width > height ? "landscape_16_9" : "portrait_16_9";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
