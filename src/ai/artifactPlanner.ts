import type { CanonProject } from "../core/types.js";
import { ALL_ASSET_KINDS, buildAssetPrompt, type AssetKind } from "./image/prompts.js";
import type { LLMProvider } from "./providers/types.js";
import { buildFieldContextBundle, buildSystemPrompt } from "./prompting.js";

export type PlannedArtifactType = AssetKind;

export type ArtifactPlan = {
  assetType: PlannedArtifactType;
  promptOverride: string;
  rationale: string;
  characterId?: string;
};

const SUPPORTED_TYPES: PlannedArtifactType[] = ALL_ASSET_KINDS;

export async function planArtifactRequest(
  canon: CanonProject,
  provider: LLMProvider,
  request: string,
): Promise<ArtifactPlan> {
  const system = await buildSystemPrompt(canon);
  const response = await provider.complete({
    system,
    responseFormat: "json",
    user: [
      "Plan a single grounded artifact generation step.",
      `User request: ${request}`,
      `Supported artifact types: ${SUPPORTED_TYPES.join(", ")}`,
      buildFieldContextBundle(canon, "canon.logline"),
      "Return JSON only with keys: assetType, promptOverride, rationale, characterId.",
      "Choose exactly one supported assetType.",
      "promptOverride must be a production-ready image prompt grounded in canon facts.",
      "Use characterId only if assetType is character-portrait and the character exists.",
    ].join("\n\n"),
  });

  const parsed = JSON.parse(response.content) as Partial<ArtifactPlan>;
  const assetType = SUPPORTED_TYPES.includes(parsed.assetType as PlannedArtifactType)
    ? parsed.assetType as PlannedArtifactType
    : inferAssetType(request, canon.canon.format.value);
  const characterId = canon.canon.characters.value.some((entry) => entry.id === parsed.characterId)
    ? parsed.characterId
    : undefined;

  return {
    assetType,
    promptOverride: String(parsed.promptOverride ?? buildFallbackPrompt(canon, request, assetType, characterId)),
    rationale: String(parsed.rationale ?? `Planned ${assetType} from user request.`),
    characterId,
  };
}

function inferAssetType(request: string, mediaType: string): PlannedArtifactType {
  const normalized = request.toLowerCase();
  if (normalized.includes("podcast")) return "podcast-cover";
  if (normalized.includes("banner")) return "social-banner";
  if (normalized.includes("portrait") || normalized.includes("character")) return "character-portrait";
  if (normalized.includes("mood")) return "mood-board-panel";
  if (normalized.includes("episode")) return "episode-card";
  if (mediaType === "podcast") return "podcast-cover";
  return normalized.includes("poster") ? "poster" : "key-art";
}

function buildFallbackPrompt(
  canon: CanonProject,
  request: string,
  assetType: PlannedArtifactType,
  characterId?: string,
) {
  return buildAssetPrompt(canon, assetType, { characterId, requestContext: request });
}
