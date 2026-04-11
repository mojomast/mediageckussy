import type { CanonProject } from "../../core/types.js";
import type { IterationDirective, IterationSession } from "./types.js";

const MAX_APPROX_TOKENS = 2500;

export function buildIterationContext(
  canon: CanonProject,
  session: IterationSession,
  directive: IterationDirective,
): string {
  const runNumber = session.completedRuns + 1;
  const lockedFields = new Set(
    Object.entries(canon.canon)
      .filter(([, field]) => field?.status === "locked")
      .map(([key]) => key),
  );

  const characterLines = canon.canon.characters.value.map((character) => {
    const lockNote = lockedFields.has("characters") ? " [LOCKED: do not modify]" : "";
    return `- ${character.id}: ${character.name} — ${character.role} — ${truncate(character.description, 120)}${lockNote}`;
  });

  const episodeLines = canon.canon.episodes.value.map((episode) => {
    const lockNote = lockedFields.has("episodes") ? " [LOCKED: do not modify]" : "";
    return `- ${episode.code}: ${episode.title} — ${truncate(episode.logline, 100)}${lockNote}`;
  });

  const recentRuns = session.runs
    .filter((run) => run.summary)
    .slice(-3)
    .map((run) => `Run ${run.runNumber}: [${run.directive.type}] ${run.summary} (confidence: ${formatConfidence(run.confidence)})`);

  const themeValues = canon.canon.themes.value;
  let worldLimit = 200;
  let visibleThemeCount = themeValues.length;
  let context = "";

  while (visibleThemeCount > 0) {
    context = renderContext({
      canon,
      directive,
      runNumber,
      lockedFields,
      characterLines,
      episodeLines,
      recentRuns,
      themeValues: themeValues.slice(0, visibleThemeCount),
      worldLimit,
    });

    if (approximateTokenCount(context) <= MAX_APPROX_TOKENS) {
      return context;
    }

    if (worldLimit > 80) {
      worldLimit = Math.max(80, worldLimit - 40);
      continue;
    }

    visibleThemeCount -= 1;
  }

  return context;
}

export function buildIterationSnapshot(canon: CanonProject): Record<string, unknown> {
  return {
    title: canon.canon.title.value,
    format: canon.canon.format.value,
    tone: canon.canon.tone.value,
    logline: canon.canon.logline.value,
    themes: canon.canon.themes.value,
    world_setting: canon.canon.world_setting.value,
    characters: canon.canon.characters.value,
    episodes: canon.canon.episodes.value,
    lockedFields: Object.entries(canon.canon)
      .filter(([, field]) => field?.status === "locked")
      .map(([key]) => `canon.${key}`),
  };
}

function renderContext(input: {
  canon: CanonProject;
  directive: IterationDirective;
  runNumber: number;
  lockedFields: Set<string>;
  characterLines: string[];
  episodeLines: string[];
  recentRuns: string[];
  themeValues: string[];
  worldLimit: number;
}) {
  const { canon, directive, runNumber, lockedFields, characterLines, episodeLines, recentRuns, themeValues, worldLimit } = input;
  const titleLock = lockedFields.has("title") ? " [LOCKED: do not modify]" : "";
  const formatLock = lockedFields.has("format") ? " [LOCKED: do not modify]" : "";
  const toneLock = lockedFields.has("tone") ? " [LOCKED: do not modify]" : "";
  const loglineLock = lockedFields.has("logline") ? " [LOCKED: do not modify]" : "";
  const themesLock = lockedFields.has("themes") ? " [LOCKED: do not modify]" : "";
  const worldLock = lockedFields.has("world_setting") ? " [LOCKED: do not modify]" : "";
  const targetLine = directive.targetId ? `Target: ${directive.targetId}\n` : "";

  return [
    `=== CANON STATE (iteration #${runNumber}) ===`,
    `PROJECT: ${canon.canon.title.value}${titleLock} | FORMAT: ${canon.canon.format.value}${formatLock} | TONE: ${canon.canon.tone.value.join(", ")}${toneLock}`,
    `LOGLINE: ${canon.canon.logline.value}${loglineLock}`,
    "",
    `EXISTING CHARACTERS (${characterLines.length}):`,
    characterLines.length > 0 ? characterLines.join("\n") : "- None",
    "",
    `EXISTING EPISODES (${episodeLines.length}):`,
    episodeLines.length > 0 ? episodeLines.join("\n") : "- None",
    "",
    `THEMES: ${themeValues.join(" · ") || "None"}${themesLock}`,
    `WORLD: ${truncate(canon.canon.world_setting.value, worldLimit)}${worldLock}`,
    "",
    "=== RECENT ITERATION HISTORY (last 3 runs) ===",
    recentRuns.length > 0 ? recentRuns.join("\n") : "None",
    "",
    "=== STEERING NOTE ===",
    directive.steeringNote ?? "None",
    "",
    "=== CURRENT DIRECTIVE ===",
    `Type: ${directive.type}`,
    `Instruction: ${directive.instruction}`,
    targetLine.trimEnd(),
    `Constraints: ${directive.constraints?.join("; ") ?? "None"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function truncate(value: string, limit: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function approximateTokenCount(value: string) {
  return Math.ceil(value.length / 4);
}

function formatConfidence(value: number) {
  return value.toFixed(2);
}
