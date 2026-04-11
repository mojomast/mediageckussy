import { FalFluxAdapter } from "./fal.js";
import { OpenAIDalle3Adapter } from "./openai.js";
import { StabilitySd3Adapter } from "./stability.js";
import { StubImageAdapter } from "./stub.js";
import type { ImageProviderAdapter, ImageProviderId } from "../types.js";

export { FalFluxAdapter } from "./fal.js";
export { OpenAIDalle3Adapter } from "./openai.js";
export { StabilitySd3Adapter } from "./stability.js";
export { StubImageAdapter } from "./stub.js";

export function buildImageProviderRegistry(): Record<ImageProviderId, ImageProviderAdapter> {
  return {
    "openai-dalle3": new OpenAIDalle3Adapter(),
    "stability-sd3": new StabilitySd3Adapter(),
    "fal-flux": new FalFluxAdapter(),
    stub: new StubImageAdapter(),
  };
}
