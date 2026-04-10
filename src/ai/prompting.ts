import path from "node:path";
import fs from "fs-extra";
import Handlebars from "handlebars";
import type { CanonProject } from "../core/types.js";

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
    comps: canon.canon.comps.value.join(", "),
    world_setting: canon.canon.world_setting.value,
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
