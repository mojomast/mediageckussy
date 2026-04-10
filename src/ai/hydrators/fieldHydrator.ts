import fs from "fs-extra";
import path from "node:path";
import type { CanonProject } from "../../core/types.js";
import type { LLMProvider } from "../providers/types.js";
import { addSuggestion, type AISuggestion } from "../suggestions.js";
import { buildSystemPrompt, fieldPromptFile, mediaPromptDir, parseConfidence, renderPromptTemplate } from "../prompting.js";

export async function hydrateField(
  canon: CanonProject,
  fieldPath: string,
  outputDir: string,
  provider: LLMProvider,
  options: { force?: boolean; dryRun?: boolean },
): Promise<{ suggestion: AISuggestion; skipped: boolean; reason?: string }> {
  const field = getCanonField(canon, fieldPath);
  if (!options.force && (field.status === "approved" || field.status === "locked")) {
    return {
      suggestion: emptySuggestion(fieldPath, provider.id),
      skipped: true,
      reason: `Field ${fieldPath} is ${field.status}`,
    };
  }

  const fieldName = fieldPath.split(".").at(-1) ?? "";
  const promptFile = fieldPromptFile(fieldName);
  if (!promptFile) {
    return {
      suggestion: emptySuggestion(fieldPath, provider.id),
      skipped: true,
      reason: `No hydration prompt exists for ${fieldPath}`,
    };
  }

  const system = await buildSystemPrompt(canon);
  const user = await renderPromptTemplate([
    mediaPromptDir(canon.canon.format.value),
    "fields",
    promptFile,
  ], canon, { fieldPath, currentValue: stringifyFieldValue(field.value) });

  const response = await provider.complete({ system, user });
  const parsed = parseConfidence(response.content);
  const suggestion: AISuggestion = {
    field: fieldPath,
    value: parsed.content,
    confidence: parsed.confidence,
    provider: provider.id,
    model: response.model,
    generatedAt: new Date().toISOString(),
    status: "pending",
    tokenUsage: {
      prompt: response.usage.promptTokens,
      completion: response.usage.completionTokens,
    },
  };

  if (!options.dryRun) {
    await addSuggestion(outputDir, suggestion);
  }

  if (!(await fs.pathExists(path.join(outputDir, "00_admin")))) {
    await fs.ensureDir(path.join(outputDir, "00_admin"));
  }

  return { suggestion, skipped: false };
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

  if (!cursor || typeof cursor !== "object" || !("status" in cursor) || !("value" in cursor)) {
    throw new Error(`Field path is not a canon field: ${fieldPath}`);
  }

  return cursor as { status: string; value: unknown };
}

function stringifyFieldValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function emptySuggestion(field: string, provider: string): AISuggestion {
  return {
    field,
    value: "",
    confidence: 0,
    provider,
    model: "",
    generatedAt: new Date(0).toISOString(),
    status: "pending",
    tokenUsage: { prompt: 0, completion: 0 },
  };
}
