import type { CanonProject } from "../../core/types.js";
import type { IterationDirective } from "./types.js";

export interface CanonCompletenessReport {
  score: number;
  dimensions: {
    characters: { score: number; gaps: string[] };
    episodes: { score: number; gaps: string[] };
    themes: { score: number; gaps: string[] };
    world: { score: number; gaps: string[] };
    storylines: { score: number; gaps: string[] };
  };
  suggestedDirectives: IterationDirective[];
}

export function analyzeCanonCompleteness(
  canon: CanonProject,
): CanonCompletenessReport {
  const characterEntries = canon.canon.characters.value as unknown as Array<Record<string, unknown>>;
  const episodeEntries = canon.canon.episodes.value as unknown as Array<Record<string, unknown>>;
  const themeEntries = canon.canon.themes.value as unknown[];
  const extendedCanon = canon.canon as Record<string, { value?: unknown } | undefined>;
  const locations = Array.isArray(extendedCanon.locations?.value) ? extendedCanon.locations?.value as unknown[] : [];
  const worldLore = Array.isArray(extendedCanon.world_lore?.value) ? extendedCanon.world_lore?.value as unknown[] : [];
  const storylines = Array.isArray(extendedCanon.storylines?.value) ? extendedCanon.storylines?.value as unknown[] : [];

  const characters = scoreCharacters(characterEntries);
  const episodes = scoreEpisodes(episodeEntries);
  const themes = scoreThemes(themeEntries);
  const world = scoreWorld(String(canon.canon.world_setting.value ?? ""), locations, worldLore);
  const storylinesDimension = scoreStorylines(storylines);

  const score = characters.score + episodes.score + themes.score + world.score + storylinesDimension.score;
  const suggestedDirectives = buildSuggestedDirectives({
    characterEntries,
    episodeEntries,
    themeEntries,
    locations,
    storylines,
  });

  return {
    score,
    dimensions: {
      characters,
      episodes,
      themes,
      world,
      storylines: storylinesDimension,
    },
    suggestedDirectives,
  };
}

function scoreCharacters(characterEntries: Array<Record<string, unknown>>) {
  let score = 0;
  const gaps: string[] = [];
  for (const character of characterEntries.slice(0, 4)) {
    const description = String(character.description ?? "").trim();
    if (description && !isPlaceholder(description)) {
      score += 5;
    }
    if (!Array.isArray(character.initial_relationships) || character.initial_relationships.length === 0) {
      gaps.push(`${String(character.id ?? "character")} has no initial relationships.`);
    }
  }

  if (characterEntries.some((character) => Array.isArray(character.initial_relationships) && character.initial_relationships.length > 0)) {
    score += 5;
  } else {
    gaps.push("No character relationships are defined yet.");
  }

  return { score: Math.min(25, score), gaps };
}

function scoreEpisodes(episodeEntries: Array<Record<string, unknown>>) {
  let score = 0;
  const gaps: string[] = [];
  for (const episode of episodeEntries.slice(0, 6)) {
    const logline = String(episode.logline ?? "").trim();
    if (logline && !isPlaceholder(logline)) {
      score += 3;
    }
    if (!Array.isArray(episode.scenes) || episode.scenes.length === 0) {
      gaps.push(`${String(episode.code ?? "episode")} has no scene breakdown.`);
    }
  }

  if (episodeEntries.some((episode) => Array.isArray(episode.scenes) && episode.scenes.length > 0)) {
    score += 7;
  } else {
    gaps.push("No episode has a scene breakdown yet.");
  }

  return { score: Math.min(25, score), gaps };
}

function scoreThemes(themeEntries: unknown[]) {
  let score = 0;
  const gaps: string[] = [];
  for (const theme of themeEntries.slice(0, 5)) {
    if (theme && typeof theme === "object" && !Array.isArray(theme) && "theme_expression" in (theme as Record<string, unknown>)) {
      score += 4;
    } else {
      gaps.push(`Theme ${typeof theme === "string" ? theme : "entry"} is still a raw string.`);
    }
  }
  return { score: Math.min(20, score), gaps };
}

function scoreWorld(worldSetting: string, locations: unknown[], worldLore: unknown[]) {
  let score = 0;
  const gaps: string[] = [];
  if (worldSetting.trim().length > 100) {
    score += 5;
  } else {
    gaps.push("World setting is still brief.");
  }
  if (locations.length >= 1) {
    score += 5;
  } else {
    gaps.push("No locations have been defined yet.");
  }
  if (worldLore.length >= 1) {
    score += 5;
  } else {
    gaps.push("No world lore facts have been defined yet.");
  }
  return { score, gaps };
}

function scoreStorylines(storylines: unknown[]) {
  return {
    score: storylines.length >= 1 ? 15 : 0,
    gaps: storylines.length >= 1 ? [] : ["No multi-episode storylines are defined yet."],
  };
}

function buildSuggestedDirectives(input: {
  characterEntries: Array<Record<string, unknown>>;
  episodeEntries: Array<Record<string, unknown>>;
  themeEntries: unknown[];
  locations: unknown[];
  storylines: unknown[];
}) {
  const directives: IterationDirective[] = [];

  for (const character of input.characterEntries) {
    if (!Array.isArray(character.initial_relationships) || character.initial_relationships.length === 0) {
      directives.push({
        type: "develop_character",
        instruction: `Develop character ${String(character.id ?? "selected character")} and define meaningful relationships.`,
        targetId: typeof character.id === "string" ? character.id : undefined,
      });
    }
  }

  if (input.themeEntries.some((theme) => typeof theme === "string")) {
    directives.push({
      type: "develop_themes",
      instruction: "Convert the raw themes into structured theme expressions and add a motif.",
    });
  }

  if (input.storylines.length === 0) {
    directives.push({
      type: "new_storyline",
      instruction: "Add a new storyline arc that connects existing characters across multiple episodes.",
    });
  }

  const firstEpisodeWithoutScenes = input.episodeEntries.find((episode) => !Array.isArray(episode.scenes) || episode.scenes.length === 0);
  if (firstEpisodeWithoutScenes && typeof firstEpisodeWithoutScenes.code === "string") {
    directives.push({
      type: "develop_episode",
      instruction: `Develop episode ${firstEpisodeWithoutScenes.code} with a scene breakdown and cliffhanger.`,
      targetId: firstEpisodeWithoutScenes.code,
    });
  }

  if (input.locations.length === 0) {
    directives.push({
      type: "world_expansion",
      instruction: "Expand the world with locations and lore that support the current canon.",
    });
  }

  return directives.slice(0, 5);
}

function isPlaceholder(value: string) {
  return /placeholder|draft|tbd|todo|to be refined/i.test(value);
}
