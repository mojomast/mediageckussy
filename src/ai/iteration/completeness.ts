import type {
  CanonProject,
  FactionEntry,
  LocationEntry,
  StorylineEntry,
  ThemeEntry,
} from "../../core/types.js";
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
  const characterEntries = canon.canon.characters.value;
  const episodeEntries = canon.canon.episodes.value;
  const themeEntries = canon.canon.themes.value as unknown[];
  const storylines = Array.isArray(canon.canon.storylines?.value)
    ? canon.canon.storylines.value
    : [];
  const locations = Array.isArray(canon.canon.locations?.value)
    ? canon.canon.locations.value
    : [];
  const worldLore = Array.isArray(canon.canon.world_lore?.value)
    ? canon.canon.world_lore.value
    : [];
  const motifs = Array.isArray(canon.canon.motifs?.value)
    ? canon.canon.motifs.value
    : [];
  const themesStructured = Array.isArray(canon.canon.themes_structured?.value)
    ? canon.canon.themes_structured.value
    : [];
  const factions = Array.isArray(canon.canon.factions?.value)
    ? canon.canon.factions.value
    : [];

  const characters = scoreCharacters(characterEntries);
  const episodes = scoreEpisodes(episodeEntries);
  const themes = scoreThemes(themeEntries, themesStructured, motifs.length);
  const world = scoreWorld(String(canon.canon.world_setting.value ?? ""), locations, worldLore);
  const storylinesDimension = scoreStorylines(storylines);

  const score = characters.score + episodes.score + themes.score + world.score + storylinesDimension.score;
  const suggestedDirectives = buildSuggestedDirectives({
      characterEntries,
      episodeEntries,
      rawThemes: themeEntries,
      themesStructured,
      locations,
      storylines,
      factions,
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

function scoreCharacters(characterEntries: CanonProject["canon"]["characters"]["value"]) {
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

function scoreEpisodes(episodeEntries: CanonProject["canon"]["episodes"]["value"]) {
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

function scoreThemes(
  rawThemes: unknown[],
  structured: ThemeEntry[],
  motifCount: number,
) {
  let score = 0;
  const gaps: string[] = [];
  const structuredLabels = new Set(structured.map((theme) => theme.label.toLowerCase()));

  for (const theme of rawThemes.slice(0, 5)) {
    const label = typeof theme === "string" ? theme : "";
    if (structuredLabels.has(label.toLowerCase())) {
      const entry = structured.find((item) => item.label.toLowerCase() === label.toLowerCase());
      if (entry?.theme_expression) {
        score += 4;
      } else {
        score += 2;
        gaps.push(`Theme "${label}" is structured but missing a theme_expression.`);
      }
    } else {
      score += 1;
      gaps.push(`Theme "${label}" is a raw string — develop it with develop_themes.`);
    }
  }

  if (motifCount > 0) {
    score += 2;
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

function scoreStorylines(storylines: StorylineEntry[]) {
  if (storylines.length === 0) {
    return { score: 0, gaps: ["No multi-episode storylines are defined yet."] };
  }

  let score = 5;
  const gaps: string[] = [];

  for (const storyline of storylines.slice(0, 2)) {
    if (storyline.episodes.length >= 2) {
      score += 3;
    } else {
      gaps.push(`Storyline "${storyline.title}" spans fewer than 2 episodes.`);
    }

    if (storyline.characters.length >= 2) {
      score += 2;
    } else {
      gaps.push(`Storyline "${storyline.title}" involves fewer than 2 characters.`);
    }

    if (storyline.arc_shape.length >= 3) {
      score += 2;
    } else {
      gaps.push(`Storyline "${storyline.title}" is missing a 3-point arc shape.`);
    }
  }

  return { score: Math.min(15, score), gaps };
}

function buildSuggestedDirectives(input: {
  characterEntries: CanonProject["canon"]["characters"]["value"];
  episodeEntries: CanonProject["canon"]["episodes"]["value"];
  rawThemes: unknown[];
  themesStructured: ThemeEntry[];
  locations: LocationEntry[];
  storylines: StorylineEntry[];
  factions: FactionEntry[];
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

  if (input.rawThemes.some((theme) => typeof theme === "string")) {
    directives.push({
      type: "develop_themes",
      instruction: "Convert the raw themes into structured theme expressions and add a motif.",
    });
  }

  const structuredMissingExpression = input.themesStructured.filter((theme) => !theme.theme_expression);
  if (structuredMissingExpression.length > 0) {
    directives.push({
      type: "develop_themes",
      instruction: `Add theme_expression entries for: ${structuredMissingExpression.map((theme) => theme.label).join(", ")}.`,
    });
  }

  if (input.storylines.length === 0) {
    directives.push({
      type: "new_storyline",
      instruction: "Add a new storyline arc that connects existing characters across multiple episodes.",
    });
  }

  for (const storyline of input.storylines) {
    if (storyline.arc_shape.length < 3) {
      directives.push({
        type: "new_storyline",
        instruction: `Deepen storyline "${storyline.title}" with a full 3-point arc shape and additional episode connections.`,
        targetId: storyline.id,
      });
    }
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

  if (input.characterEntries.length >= 2 && input.factions.length === 0) {
    directives.push({
      type: "custom",
      instruction: "Identify and define factions or allegiances among the existing characters. Propose canon.factions entries.",
    });
  }

  return directives.slice(0, 5);
}

function isPlaceholder(value: string) {
  return /placeholder|draft|tbd|todo|to be refined/i.test(value);
}
