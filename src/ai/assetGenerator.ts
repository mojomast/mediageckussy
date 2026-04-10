import path from "node:path";
import crypto from "node:crypto";
import fs from "fs-extra";
import Handlebars from "handlebars";
import { registerAsset } from "../core/manifest.js";
import type { CanonProject } from "../core/types.js";
import { fingerprintCanon } from "../utils/canon.js";
import type { ImageProvider } from "./image/types.js";
import { promptRoot } from "./prompting.js";

export type AssetType = "poster" | "key-art" | "character-portrait" | "episode-card" | "mood-board-panel" | "social-banner" | "podcast-cover";

export interface AssetGenerationResult {
  path: string;
  prompt: string;
  model: string;
  durationMs: number;
  width: number;
  height: number;
}

const ASSET_SPECS: Record<AssetType, { width: number; height: number; template: string }> = {
  poster: { width: 1024, height: 1536, template: "poster.md" },
  "key-art": { width: 1792, height: 1024, template: "key-art.md" },
  "character-portrait": { width: 1024, height: 1024, template: "character-portrait.md" },
  "episode-card": { width: 1280, height: 720, template: "episode-card.md" },
  "mood-board-panel": { width: 1024, height: 1024, template: "mood-board-panel.md" },
  "social-banner": { width: 1200, height: 630, template: "social-banner.md" },
  "podcast-cover": { width: 3000, height: 3000, template: "podcast-cover.md" },
};

export async function generateAsset(
  canon: CanonProject,
  outputDir: string,
  assetType: AssetType,
  provider: ImageProvider,
  options: {
    characterId?: string;
    promptOverride?: string;
    dryRun?: boolean;
  },
): Promise<AssetGenerationResult> {
  const spec = ASSET_SPECS[assetType];
  const prompt = options.promptOverride ?? await buildAssetPrompt(canon, assetType, options.characterId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${canon.slug}-${assetType}-${timestamp}-${crypto.randomUUID().slice(0, 8)}.png`;
  const relativeAssetPath = path.join("site", "assets", "generated", assetType, fileName);
  const absoluteAssetPath = path.join(outputDir, relativeAssetPath);

  if (options.dryRun) {
    return { path: relativeAssetPath, prompt, model: "dry-run", durationMs: 0, width: spec.width, height: spec.height };
  }

  const result = await provider.generate({ prompt, width: spec.width, height: spec.height }, absoluteAssetPath);
  const sidecarPath = `${absoluteAssetPath}.prompt.json`;
  await fs.writeJson(sidecarPath, {
    assetType,
    prompt,
    model: result.model,
    provider: provider.id,
    generatedAt: new Date().toISOString(),
    canonFingerprint: fingerprintCanon(canon),
  }, { spaces: 2 });

  await registerAsset(outputDir, {
    type: assetType,
    path: relativeAssetPath,
    provider: provider.id,
    model: result.model,
    prompt,
    canonFingerprint: fingerprintCanon(canon),
    generatedAt: new Date().toISOString(),
  });

  return { path: relativeAssetPath, prompt, model: result.model, durationMs: result.durationMs, width: spec.width, height: spec.height };
}

async function buildAssetPrompt(canon: CanonProject, assetType: AssetType, characterId?: string) {
  const template = await fs.readFile(path.join(promptRoot(), "assets", ASSET_SPECS[assetType].template), "utf8");
  const character = characterId ? canon.canon.characters.value.find((entry) => entry.id === characterId) : undefined;
  const compiled = Handlebars.compile(template);
  return compiled({
    title: canon.canon.title.value,
    logline: canon.canon.logline.value,
    genre: canon.canon.genre.value,
    tone: canon.canon.tone.value.join(", "),
    comps: canon.canon.comps.value.join(", "),
    world_setting: canon.canon.world_setting.value,
    character_description: character?.description ?? "",
  });
}
