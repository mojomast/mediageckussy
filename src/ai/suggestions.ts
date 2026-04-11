import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { appendHydrationLog, updateHydrationLogStatus } from "../core/manifest.js";
import type { CanonProject } from "../core/types.js";
import { canonProjectSchema } from "../core/schema.js";
import { saveCanon } from "../utils/canon.js";

export interface AISuggestion {
  field: string;
  value: string;
  confidence: number;
  provider: string;
  model: string;
  generatedAt: string;
  status: "pending" | "accepted" | "rejected";
  tokenUsage: { prompt: number; completion: number };
}

function suggestionPath(outputDir: string) {
  return path.join(outputDir, "00_admin/ai_suggestions.yaml");
}

export async function loadSuggestions(outputDir: string): Promise<AISuggestion[]> {
  const filePath = suggestionPath(outputDir);
  if (!(await fs.pathExists(filePath))) {
    return [];
  }

  const raw = await fs.readFile(filePath, "utf8");
  const parsed = YAML.parse(raw);
  return Array.isArray(parsed) ? parsed as AISuggestion[] : [];
}

export async function saveSuggestions(outputDir: string, suggestions: AISuggestion[]): Promise<void> {
  const filePath = suggestionPath(outputDir);
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, YAML.stringify(suggestions), "utf8");
}

export async function addSuggestion(outputDir: string, suggestion: AISuggestion): Promise<void> {
  const suggestions = await loadSuggestions(outputDir);
  const next = [...suggestions.filter((entry) => entry.field !== suggestion.field), suggestion];
  await saveSuggestions(outputDir, next);

  if (await fs.pathExists(path.join(outputDir, "00_admin/package_manifest.json"))) {
    await appendHydrationLog(outputDir, {
      field: suggestion.field,
      provider: suggestion.provider,
      model: suggestion.model,
      confidence: suggestion.confidence,
      status: suggestion.status,
      generatedAt: suggestion.generatedAt,
      tokenUsage: suggestion.tokenUsage,
    });
  }
}

export async function acceptSuggestion(outputDir: string, fieldPath: string, canon: CanonProject): Promise<CanonProject> {
  const suggestions = await loadSuggestions(outputDir);
  const suggestion = suggestions.find((entry) => entry.field === fieldPath && entry.status === "pending");

  if (!suggestion) {
    throw new Error(`No pending suggestion found for ${fieldPath}`);
  }

  const field = getCanonField(canon, fieldPath);
  field.value = coerceSuggestionValue(fieldPath, suggestion.value, field.value);
  field.status = "draft";
  field.owner = "agent";
  field.confidence = suggestion.confidence;
  field.updated_at = new Date().toISOString();

  canonProjectSchema.parse(canon);

  const updatedSuggestions = suggestions.map((entry) => entry.field === fieldPath ? { ...entry, status: "accepted" as const } : entry);
  await saveSuggestions(outputDir, updatedSuggestions);
  await saveCanon(path.join(outputDir, "00_admin/canon_lock.yaml"), canon);
  if (await fs.pathExists(path.join(outputDir, "00_admin/package_manifest.json"))) {
    await updateHydrationLogStatus(outputDir, { field: fieldPath }, "accepted");
  }

  return canon;
}

export async function rejectSuggestion(outputDir: string, fieldPath: string): Promise<void> {
  const suggestions = await loadSuggestions(outputDir);
  await saveSuggestions(outputDir, suggestions.filter((entry) => entry.field !== fieldPath));
  if (await fs.pathExists(path.join(outputDir, "00_admin/package_manifest.json"))) {
    await updateHydrationLogStatus(outputDir, { field: fieldPath }, "rejected");
  }
}

function getCanonField(canon: CanonProject, fieldPath: string) {
  const segments = fieldPath.split(".");
  let cursor: unknown = canon;

  for (const segment of segments) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) {
      throw new Error(`Unknown canon field path: ${fieldPath}`);
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }

  if (!cursor || typeof cursor !== "object" || !("value" in cursor)) {
    throw new Error(`Field path is not a canon field: ${fieldPath}`);
  }

  return cursor as {
    value: unknown;
    status: "draft" | "approved" | "locked" | "deprecated";
    owner: "user" | "editor" | "agent" | "system" | "producer" | "legal" | "marketing";
    confidence: number;
    updated_at: string;
  };
}

function coerceSuggestionValue(fieldPath: string, rawValue: string, currentValue: unknown) {
  if (Array.isArray(currentValue)) {
    return coerceArrayValue(fieldPath, rawValue, currentValue);
  }

  if (currentValue && typeof currentValue === "object") {
    return coerceObjectValue(rawValue, currentValue);
  }

  return rawValue;
}

function coerceArrayValue(fieldPath: string, rawValue: string, currentValue: unknown[]) {
  if (fieldPath === "canon.characters" || fieldPath === "canon.episodes" || fieldPath === "canon.structure") {
    return parseStructuredArray(fieldPath, rawValue, currentValue);
  }

  const parsedYaml = tryParseYaml(rawValue);
  if (Array.isArray(parsedYaml) && parsedYaml.every((item) => typeof item === "string")) {
    return parsedYaml.map((item) => item.trim()).filter(Boolean);
  }

  return rawValue
    .replace(/^[A-Za-z][A-Za-z\s_-]*:\s*$/m, "")
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
}

function coerceObjectValue(rawValue: string, currentValue: unknown) {
  const parsedYaml = tryParseYaml(rawValue);
  if (parsedYaml && typeof parsedYaml === "object" && !Array.isArray(parsedYaml)) {
    return parsedYaml;
  }

  return currentValue;
}

function parseStructuredArray(fieldPath: string, rawValue: string, currentValue: unknown[]) {
  const parsedYaml = tryParseYaml(rawValue);
  if (Array.isArray(parsedYaml)) {
    return parsedYaml;
  }

  throw new Error(`Suggestion for ${fieldPath} must be a structured array. Ask AI Fill to return valid list data before accepting.`);
}

function tryParseYaml(rawValue: string) {
  try {
    return YAML.parse(rawValue);
  } catch {
    return undefined;
  }
}
