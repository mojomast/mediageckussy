export type ImageProviderId = "openai-dalle3" | "stability-sd3" | "fal-flux" | "stub";

export type ImageProviderAlias = "dalle" | "stability" | "flux" | "replicate";

export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;
  style?: string;
  seed?: number;
  outputFormat?: "png" | "jpg" | "webp";
}

export interface ImageAdapterResult {
  data: Buffer;
  mimeType: string;
  extension: "png" | "jpg" | "webp";
  model?: string;
  revisedPrompt?: string;
  sourceUrl?: string;
}

export interface ImageResult {
  localPath: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  durationMs: number;
  provider: string;
  mimeType: string;
  width: number;
  height: number;
  sourceUrl?: string;
}

export interface ImageProviderAdapter {
  id: ImageProviderId;
  name: string;
  defaultModel: string;
  isAvailable(): Promise<boolean>;
  generate(req: ImageRequest): Promise<ImageAdapterResult>;
}

export interface ImageProvider {
  id: string;
  name: string;
  generate(req: ImageRequest, outputPath: string): Promise<ImageResult>;
  isAvailable(): Promise<boolean>;
}

export interface ImageProviderResolution {
  requestedId: string;
  resolvedId: ImageProviderId;
  fallbackUsed: boolean;
  reason?: string;
}
