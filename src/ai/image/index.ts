import fs from "fs-extra";
import path from "node:path";
import crypto from "node:crypto";
import { buildImageProviderRegistry } from "./providers/index.js";
import type { ImageProvider, ImageProviderAdapter, ImageProviderAlias, ImageProviderId, ImageProviderResolution, ImageRequest, ImageResult } from "./types.js";

export type { ImageProvider, ImageProviderAdapter, ImageProviderAlias, ImageProviderId, ImageProviderResolution, ImageRequest, ImageResult } from "./types.js";
export { buildImageProviderRegistry, FalFluxAdapter, OpenAIDalle3Adapter, StabilitySd3Adapter, StubImageAdapter } from "./providers/index.js";

export class MockImageProvider implements ImageProvider {
  readonly id = "mock-image";
  readonly name = "Mock Image Provider";

  constructor(private readonly fixturePath: string) {}

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    await fs.ensureDir(path.dirname(outputPath));
    await fs.copyFile(this.fixturePath, outputPath);
    return {
      localPath: outputPath,
      model: "mock-image",
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      durationMs: 0,
      provider: this.id,
      mimeType: "image/png",
      width: req.width,
      height: req.height,
    };
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}

export async function resolveImageProviderWithMetadata(providerId: string = process.env.MEDIAGECKUSSY_IMAGE_PROVIDER ?? "openai-dalle3"): Promise<{ provider: ImageProvider; resolution: ImageProviderResolution }> {
  const registry = buildImageProviderRegistry();
  const requestedId = providerId || "openai-dalle3";
  const normalizedId = normalizeImageProviderId(requestedId);
  const requestedProvider = normalizedId ? registry[normalizedId] : undefined;
  if (!requestedProvider) {
    return {
      provider: new AdapterBackedImageProvider(registry.stub),
      resolution: {
        requestedId,
        resolvedId: "stub",
        fallbackUsed: true,
        reason: `Unknown image provider \"${requestedId}\". Falling back to stub.`,
      },
    };
  }

  if (await requestedProvider.isAvailable()) {
    return {
      provider: new AdapterBackedImageProvider(requestedProvider),
      resolution: {
        requestedId,
        resolvedId: requestedProvider.id,
        fallbackUsed: false,
      },
    };
  }

  return {
    provider: new AdapterBackedImageProvider(registry.stub),
    resolution: {
      requestedId,
      resolvedId: "stub",
      fallbackUsed: true,
      reason: `Image provider \"${requestedId}\" is unavailable. Falling back to stub.`,
    },
  };
}

export function resolveImageProvider(providerId: string = process.env.MEDIAGECKUSSY_IMAGE_PROVIDER ?? "openai-dalle3"): ImageProvider {
  return new DeferredImageProvider(providerId);
}

function normalizeImageProviderId(providerId: string): ImageProviderId | undefined {
  switch (providerId) {
    case "openai-dalle3":
    case "stability-sd3":
    case "fal-flux":
    case "stub":
      return providerId;
    case "dalle":
      return "openai-dalle3";
    case "stability":
      return "stability-sd3";
    case "flux":
    case "replicate":
      return "fal-flux";
    default:
      return undefined;
  }
}

class DeferredImageProvider implements ImageProvider {
  readonly id: string;
  readonly name: string;

  constructor(private readonly requestedId: string) {
    this.id = normalizeImageProviderId(requestedId) ?? requestedId;
    this.name = `Deferred image provider (${this.id})`;
  }

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const { provider } = await resolveImageProviderWithMetadata(this.requestedId);
    return provider.generate(req, outputPath);
  }

  async isAvailable(): Promise<boolean> {
    const { provider } = await resolveImageProviderWithMetadata(this.requestedId);
    return provider.isAvailable();
  }
}

class AdapterBackedImageProvider implements ImageProvider {
  readonly id: string;
  readonly name: string;

  constructor(private readonly adapter: ImageProviderAdapter) {
    this.id = adapter.id;
    this.name = adapter.name;
  }

  async generate(req: ImageRequest, outputPath: string): Promise<ImageResult> {
    const startedAt = Date.now();
    const result = await withRetries(() => this.adapter.generate(req));
    await saveImageOutput(outputPath, result.data);
    return {
      localPath: outputPath,
      model: result.model ?? this.adapter.defaultModel,
      prompt: req.prompt,
      negativePrompt: req.negativePrompt,
      durationMs: Date.now() - startedAt,
      provider: this.adapter.id,
      mimeType: result.mimeType,
      width: req.width,
      height: req.height,
      sourceUrl: result.sourceUrl,
    };
  }

  async isAvailable(): Promise<boolean> {
    return this.adapter.isAvailable();
  }
}

async function saveImageOutput(outputPath: string, data: Buffer) {
  await fs.ensureDir(path.dirname(outputPath));
  const tempPath = `${outputPath}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(tempPath, data);
    await fs.move(tempPath, outputPath, { overwrite: true });
  } catch (error) {
    await fs.remove(tempPath).catch(() => undefined);
    throw error;
  }
}

async function withRetries<T>(run: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetriableError(error)) {
        throw error;
      }
      await delay(attempt * 300);
    }
  }
  throw lastError;
}

function isRetriableError(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: unknown }).status) : undefined;
  if (typeof status === "number") {
    return status === 408 || status === 429 || status >= 500;
  }
  return error instanceof TypeError;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
