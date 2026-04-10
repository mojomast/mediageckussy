export interface CompletionRequest {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json";
}

export interface CompletionResponse {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
  };
  durationMs: number;
}

export interface LLMProvider {
  id: string;
  name: string;
  complete(req: CompletionRequest): Promise<CompletionResponse>;
  isAvailable(): Promise<boolean>;
}
