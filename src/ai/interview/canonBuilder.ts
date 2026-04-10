import crypto from "node:crypto";
import type { CanonProject, CanonField, CharacterEntity, EpisodeEntry } from "../../core/types.js";
import { canonProjectSchema } from "../../core/schema.js";
import type { InterviewState } from "./state.js";

export function buildCanonFromAnswers(state: InterviewState): CanonProject {
  const title = asString(state.answers["canon.title"]) || "Untitled Project";
  const slug = slugify(title) || state.sessionId;
  const now = new Date().toISOString();

  const buildField = <T,>(value: T, visibility: "internal" | "public" | "private" = "public", confidence = 0.7): CanonField<T> => ({
    value,
    status: "draft",
    owner: "agent",
    updated_at: now,
    confidence,
    downstream_dependencies: [],
    visibility,
  });

  const characters = asCharacters(state.answers["canon.characters"]);
  const episodes = asEpisodes(state.answers["canon.episodes"]);

  const project: CanonProject = {
    id: crypto.randomUUID(),
    slug,
    package_tier: "full",
    outputs: {
      website: { enabled: true },
      press_bundle: { enabled: true },
      partner_bundle: { enabled: true },
    },
    canon: {
      title: buildField(title),
      logline: buildField(asString(state.answers["canon.logline"]) || placeholderFor("canon.logline"), "public", asString(state.answers["canon.logline"]) ? 0.7 : 0),
      format: buildField(normalizeFormat(asString(state.answers["canon.format"]) || "tv_series"), "public", asString(state.answers["canon.format"]) ? 0.7 : 0),
      genre: buildField(asString(state.answers["canon.genre"]) || placeholderFor("canon.genre"), "public", asString(state.answers["canon.genre"]) ? 0.7 : 0),
      tone: buildField(asStringArray(state.answers["canon.tone"], [placeholderFor("canon.tone")]), "public", hasValue(state.answers["canon.tone"]) ? 0.7 : 0),
      audience: buildField(asStringArray(state.answers["canon.audience"], [placeholderFor("canon.audience")]), "internal", hasValue(state.answers["canon.audience"]) ? 0.7 : 0),
      comps: buildField(asStringArray(state.answers["canon.comps"], [placeholderFor("canon.comps")]), "public", hasValue(state.answers["canon.comps"]) ? 0.7 : 0),
      duration_count: buildField(asString(state.answers["canon.duration_count"]) || placeholderFor("canon.duration_count"), "public", asString(state.answers["canon.duration_count"]) ? 0.7 : 0),
      themes: buildField(asStringArray(state.answers["canon.themes"], [placeholderFor("canon.themes")]), "public", hasValue(state.answers["canon.themes"]) ? 0.7 : 0),
      world_setting: buildField(asString(state.answers["canon.world_setting"]) || placeholderFor("canon.world_setting"), "public", asString(state.answers["canon.world_setting"]) ? 0.7 : 0),
      production_assumptions: buildField(asStringArray(state.answers["canon.production_assumptions"], [placeholderFor("canon.production_assumptions")]), "internal", hasValue(state.answers["canon.production_assumptions"]) ? 0.7 : 0),
      business_assumptions: buildField([placeholderFor("canon.business_assumptions")], "internal", 0),
      legal_assumptions: buildField([placeholderFor("canon.legal_assumptions")], "internal", 0),
      publication_flags: buildField({ site_enabled: true, partner_bundle_enabled: true, press_bundle_enabled: true }, "internal", 0.7),
      characters: buildField(characters.length > 0 ? characters : [placeholderCharacter()], "public", characters.length > 0 ? 0.7 : 0),
      episodes: buildField(episodes.length > 0 ? episodes : [placeholderEpisode()], "internal", episodes.length > 0 ? 0.7 : 0),
      structure: buildField([{ id: "act-1", title: "Initial structure", summary: placeholderFor("canon.structure"), visibility: "internal" }], "internal", 0),
    },
  };

  return canonProjectSchema.parse(project);
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function asStringArray(value: unknown, fallback: string[]) {
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    const clean = value.map((item) => item.trim()).filter(Boolean);
    return clean.length > 0 ? clean : fallback;
  }
  return fallback;
}

function asCharacters(value: unknown): CharacterEntity[] {
  return Array.isArray(value) ? value as CharacterEntity[] : [];
}

function asEpisodes(value: unknown): EpisodeEntry[] {
  return Array.isArray(value) ? value as EpisodeEntry[] : [];
}

function hasValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value != null && value !== "";
}

function placeholderFor(fieldPath: string) {
  return `TODO: provide ${fieldPath.replace("canon.", "").replace(/_/g, " ")}`;
}

function placeholderCharacter(): CharacterEntity {
  return {
    id: "lead-character",
    name: "Lead Character",
    role: "lead",
    description: placeholderFor("canon.characters"),
    visibility: "internal",
  };
}

function placeholderEpisode(): EpisodeEntry {
  return {
    code: "S01E01",
    title: "Episode One",
    logline: placeholderFor("canon.episodes"),
    status: "planned",
    visibility: "internal",
  };
}

function normalizeFormat(value: string) {
  const normalized = value.toLowerCase().trim().replace(/\s+/g, "_");
  if (normalized === "tv" || normalized === "tv_series") return "tv_series";
  if (normalized === "film" || normalized === "feature_film") return "feature_film";
  if (normalized === "podcast") return "podcast";
  if (normalized === "web_series" || normalized === "web") return "web_series";
  return normalized || "tv_series";
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
