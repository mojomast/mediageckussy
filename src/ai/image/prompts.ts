import type { CanonProject, CharacterEntity, EpisodeEntry } from "../../core/types.js";

export type AssetKind = "poster" | "key-art" | "character-portrait" | "episode-card" | "mood-board-panel" | "social-banner" | "podcast-cover";

export const ALL_ASSET_KINDS: AssetKind[] = [
  "poster",
  "key-art",
  "character-portrait",
  "episode-card",
  "mood-board-panel",
  "social-banner",
  "podcast-cover",
];

export function buildAssetPrompt(
  canon: CanonProject,
  assetKind: AssetKind,
  options: {
    characterId?: string;
    variationIndex?: number;
    requestContext?: string;
  } = {},
) {
  const focusCharacter = pickCharacter(canon, options.characterId);
  const focusEpisode = pickEpisode(canon);
  const shared = buildSharedCanonContext(canon);
  const requestContext = options.requestContext?.trim()
    ? `Additional creative request: ${options.requestContext.trim()}.`
    : undefined;

  switch (assetKind) {
    case "poster":
      return [
        `Create theatrical poster art for ${canon.canon.title.value}.`,
        shared,
        `Visual priority: ${focusCharacter ? `${focusCharacter.name} in the foreground, with the world and stakes implied behind them.` : "A single iconic focal image that sells the premise at a glance."}`,
        "Composition: vertical one-sheet, cinematic depth, strong silhouette, premium studio finish, reserve clean space for title treatment.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "key-art":
      return [
        `Create premium widescreen key art for ${canon.canon.title.value}.`,
        shared,
        `Visual priority: ${ensembleLine(canon, focusCharacter)}.`,
        "Composition: widescreen hero image, layered foreground and background depth, premium streaming-platform polish, dramatic lighting, no visible text.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "character-portrait":
      return [
        `Create a character portrait for ${canon.canon.title.value}.`,
        shared,
        focusCharacter
          ? `Subject: ${focusCharacter.name}, ${focusCharacter.role}. Description: ${focusCharacter.description}.`
          : "Subject: a canon-grounded lead character with a specific, emotionally readable pose.",
        `Portrait goal: reveal personality, status, and tension through wardrobe, expression, and lighting.${focusCharacter?.backstory?.[0] ? ` Backstory cue: ${focusCharacter.backstory[0]}.` : ""}`,
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "episode-card":
      return [
        `Create episodic card art for ${canon.canon.title.value}.`,
        shared,
        focusEpisode
          ? `Episode focus: ${focusEpisode.code} ${focusEpisode.title}. Episode logline: ${focusEpisode.logline}.`
          : `Episode focus: imply the series' central conflict through a single clean moment.`,
        "Composition: wide episode card crop, bold central image, clear negative space, premium episodic branding feel, no visible text.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "mood-board-panel":
      return [
        `Create a cinematic mood board panel for ${canon.canon.title.value}.${typeof options.variationIndex === "number" ? ` Variation ${options.variationIndex}.` : ""}`,
        shared,
        `Visual priority: atmosphere, texture, setting detail, and theme resonance.${focusLocation(canon) ? ` Location cue: ${focusLocation(canon)}.` : ""}`,
        "Composition: concept-art reference panel, tactile production-design detail, evocative lighting, no visible text.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "social-banner":
      return [
        `Create a social promo banner for ${canon.canon.title.value}.`,
        shared,
        `Visual priority: an instantly readable hero image for feeds, anchored by ${focusCharacter ? focusCharacter.name : "a single central subject or motif"}.`,
        "Composition: horizontal social crop, high contrast focal image, clean edge-safe framing, premium marketing polish, no visible text.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
    case "podcast-cover":
      return [
        `Create premium podcast cover art for ${canon.canon.title.value}.`,
        shared,
        `Visual priority: ${canon.canon.format.value === "podcast" ? "an intimate audio-first identity with host or narrative voice implied through iconography and close framing" : "a bold, iconic square-mark treatment derived from the story world"}.`,
        "Composition: square cover image, central iconic motif, clean silhouette, strong color contrast, premium editorial finish, no visible text.",
        requestContext,
        baseImageRules(),
      ].filter(Boolean).join(" ");
  }
}

function buildSharedCanonContext(canon: CanonProject) {
  const themes = canon.canon.themes.value.slice(0, 4).join(", ");
  const comps = canon.canon.comps.value.slice(0, 3).join(", ");
  const characters = canon.canon.characters.value.slice(0, 3).map((entry) => `${entry.name} (${entry.role})`).join(", ");
  const episodes = canon.canon.episodes.value.slice(0, 2).map((entry) => `${entry.code} ${entry.title}`).join(", ");

  return [
    `Canon anchor: ${canon.canon.logline.value}.`,
    `Genre: ${canon.canon.genre.value}. Tone: ${canon.canon.tone.value.join(", ")}.`,
    `World: ${canon.canon.world_setting.value}.`,
    themes ? `Themes: ${themes}.` : undefined,
    comps ? `Comparable energy: ${comps}.` : undefined,
    characters ? `Key characters: ${characters}.` : undefined,
    episodes ? `Episode context: ${episodes}.` : undefined,
  ].filter(Boolean).join(" ");
}

function pickCharacter(canon: CanonProject, characterId?: string): CharacterEntity | undefined {
  if (characterId) {
    const exact = canon.canon.characters.value.find((entry) => entry.id === characterId);
    if (exact) {
      return exact;
    }
  }
  return canon.canon.characters.value[0];
}

function pickEpisode(canon: CanonProject): EpisodeEntry | undefined {
  return canon.canon.episodes.value.find((entry) => entry.status === "approved")
    ?? canon.canon.episodes.value.find((entry) => entry.status === "draft")
    ?? canon.canon.episodes.value[0];
}

function focusLocation(canon: CanonProject) {
  const location = canon.canon.locations?.value[0];
  return location ? `${location.name}, ${location.description}` : undefined;
}

function ensembleLine(canon: CanonProject, focusCharacter?: CharacterEntity) {
  const supporting = canon.canon.characters.value
    .filter((entry) => entry.id !== focusCharacter?.id)
    .slice(0, 2)
    .map((entry) => entry.name);

  if (!focusCharacter) {
    return "an ensemble-driven world image that conveys conflict and tone";
  }

  if (supporting.length === 0) {
    return `${focusCharacter.name} carrying the image with world-scale tension behind them`;
  }

  return `${focusCharacter.name} as the anchor with ${supporting.join(" and ")} implied in the surrounding world`;
}

function baseImageRules() {
  return "Use canon-grounded details only. Avoid text, logos, watermarks, UI, and generic stock-photo staging.";
}
