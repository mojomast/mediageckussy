import path from "node:path";
import fs from "fs-extra";
import Handlebars from "handlebars";
import type { CanonProject } from "../core/types.js";

const CORE_CONTEXT_FIELDS = ["title", "format", "genre", "logline", "tone"];

const RELATED_FIELD_MAP: Record<string, string[]> = {
  logline: ["world_setting", "themes", "audience", "comps", "characters", "episodes"],
  world_setting: ["logline", "genre", "tone", "themes", "characters", "episodes"],
  themes: ["logline", "genre", "tone", "world_setting", "characters", "episodes"],
  audience: ["logline", "genre", "tone", "comps", "themes"],
  comps: ["logline", "genre", "tone", "audience", "themes"],
  duration_count: ["format", "audience", "production_assumptions"],
  characters: ["logline", "world_setting", "themes", "episodes", "tone"],
  episodes: ["logline", "world_setting", "themes", "characters", "structure", "tone"],
  structure: ["logline", "themes", "episodes", "characters"],
  production_assumptions: ["format", "audience", "business_assumptions", "legal_assumptions"],
  business_assumptions: ["format", "audience", "production_assumptions"],
  legal_assumptions: ["format", "publication_flags", "business_assumptions"],
  publication_flags: ["format", "business_assumptions", "legal_assumptions"],
};

export function promptRoot() {
  return path.resolve(import.meta.dirname, "prompts");
}

export async function loadPromptTemplate(...segments: string[]) {
  return fs.readFile(path.join(promptRoot(), ...segments), "utf8");
}

export async function renderPromptTemplate(templateSegments: string[], canon: CanonProject, extra: Record<string, unknown> = {}) {
  const template = await loadPromptTemplate(...templateSegments);
  const compiled = Handlebars.compile(template);
  return compiled(buildPromptContext(canon, extra));
}

export function buildPromptContext(canon: CanonProject, extra: Record<string, unknown> = {}) {
  return {
    canon: canon.canon,
    title: canon.canon.title.value,
    logline: canon.canon.logline.value,
    genre: canon.canon.genre.value,
    tone: canon.canon.tone.value.join(", "),
    tone_list: canon.canon.tone.value,
    audience: canon.canon.audience.value.join(", "),
    audience_list: canon.canon.audience.value,
    comps: canon.canon.comps.value.join(", "),
    comps_list: canon.canon.comps.value,
    world_setting: canon.canon.world_setting.value,
    themes: canon.canon.themes.value.join(", "),
    themes_list: canon.canon.themes.value,
    character_roster: canon.canon.characters.value,
    episode_roster: canon.canon.episodes.value,
    production_assumptions: canon.canon.production_assumptions.value,
    business_assumptions: canon.canon.business_assumptions.value,
    legal_assumptions: canon.canon.legal_assumptions.value,
    mediaType: canon.canon.format.value,
    ...extra,
  };
}

export function mediaPromptDir(mediaType: string) {
  return mediaType;
}

export function fieldPromptFile(fieldName: string) {
  switch (fieldName) {
    case "logline":
      return "logline.md";
    case "world_setting":
      return "world-setting.md";
    case "themes":
      return "themes.md";
    case "episodes":
      return "episode-entry.md";
    default:
      return undefined;
  }
}

export async function buildSystemPrompt(canon: CanonProject) {
  const mediaDir = mediaPromptDir(canon.canon.format.value);
  const [base, media] = await Promise.all([
    renderPromptTemplate(["base-system.md"], canon),
    renderPromptTemplate([mediaDir, "system.md"], canon),
  ]);
  return `${base}\n\n${media}`;
}

export function buildFieldContextBundle(canon: CanonProject, fieldPath: string) {
  const fieldName = fieldPath.replace(/^canon\./, "");
  const relatedFields = Array.from(new Set([
    ...CORE_CONTEXT_FIELDS,
    ...(RELATED_FIELD_MAP[fieldName] ?? Object.keys(canon.canon).slice(0, 8)),
  ].filter((entry) => entry !== fieldName && entry in canon.canon)));

  const lockedAnchors = Object.entries(canon.canon)
    .filter(([key, field]) => key !== fieldName && (field.status === "locked" || field.status === "approved"))
    .map(([key, field]) => `- canon.${key} [${field.status}]: ${formatPromptValue(field.value)}`);

  const relatedContext = relatedFields
    .map((key) => {
      const field = canon.canon[key as keyof CanonProject["canon"]];
      if (!field) {
        return undefined;
      }
      return `- canon.${key} [${field.status}]: ${formatPromptValue(field.value)}`;
    })
    .filter((entry): entry is string => Boolean(entry));

  return [
    lockedAnchors.length > 0
      ? ["Locked / approved canon anchors:", ...lockedAnchors].join("\n")
      : "Locked / approved canon anchors:\n- none",
    ["Related canon context:", ...relatedContext].join("\n"),
  ].join("\n\n");
}

export function buildDocumentContextBundle(canon: CanonProject, filePath: string) {
  return [
    `Target file: ${filePath}`,
    `Project title: ${canon.canon.title.value}`,
    `Format: ${canon.canon.format.value}`,
    `Logline: ${canon.canon.logline.value}`,
    `Genre: ${canon.canon.genre.value}`,
    `Tone: ${canon.canon.tone.value.join(", ")}`,
    `Themes: ${canon.canon.themes.value.join(" | ")}`,
    `World: ${canon.canon.world_setting.value}`,
    `Audience: ${canon.canon.audience.value.join(" | ")}`,
    `Characters: ${canon.canon.characters.value.map((entry) => `${entry.name} (${entry.role})`).join(" | ")}`,
    `Episodes: ${canon.canon.episodes.value.map((entry) => `${entry.code}: ${entry.title}`).join(" | ")}`,
  ].join("\n");
}

export function buildFieldOutputInstructions(fieldPath: string, currentValue: unknown) {
  if (fieldPath === "canon.characters") {
    return "Return YAML array only. Each item must contain: id, name, role, description, visibility.";
  }

  if (fieldPath === "canon.episodes") {
    return "Return YAML array only. Each item must contain: code, title, logline, status, visibility.";
  }

  if (fieldPath === "canon.structure") {
    return "Return YAML array only. Each item must contain: id, title, summary, visibility.";
  }

  if (Array.isArray(currentValue)) {
    return "Return YAML array only. Do not add headings, labels, or commentary.";
  }

  if (currentValue && typeof currentValue === "object") {
    return `Return YAML object only matching this shape: ${JSON.stringify(currentValue, null, 2)}`;
  }

  return "Return the replacement value only. No headings, labels, or commentary.";
}

export function buildFallbackFieldPrompt(canon: CanonProject, fieldPath: string, currentValue: unknown) {
  return [
    `Hydrate ${fieldPath} for ${canon.canon.title.value}.`,
    `Media format: ${canon.canon.format.value}`,
    `Current value:\n${formatPromptValue(currentValue)}`,
    "Use the related canon context to keep the field consistent, specific, and canon-locked.",
  ].join("\n\n");
}

export function parseConfidence(content: string) {
  const match = content.match(/CONFIDENCE:\s*([01](?:\.\d+)?)/);
  if (!match) {
    return { confidence: 0.5, content: content.trim() };
  }

  return {
    confidence: Number(match[1]),
    content: content.replace(/\n?CONFIDENCE:\s*[01](?:\.\d+)?\s*$/m, "").trim(),
  };
}

function formatPromptValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) {
      return value.join(" | ");
    }

    return JSON.stringify(value, null, 2);
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }

  return String(value ?? "");
}
