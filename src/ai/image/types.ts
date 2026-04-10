export interface ImageRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  steps?: number;
  style?: string;
}

export interface ImageResult {
  localPath: string;
  model: string;
  prompt: string;
  negativePrompt?: string;
  durationMs: number;
}

export interface ImageProvider {
  id: string;
  generate(req: ImageRequest, outputPath: string): Promise<ImageResult>;
  isAvailable(): Promise<boolean>;
}
