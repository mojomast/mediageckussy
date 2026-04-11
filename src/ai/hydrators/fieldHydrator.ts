import fs from "fs-extra";
import path from "node:path";
import type { CanonProject } from "../../core/types.js";
import type { LLMProvider } from "../providers/types.js";
import { addSuggestion, type AISuggestion } from "../suggestions.js";
import {
  buildFallbackFieldPrompt,
  buildFieldContextBundle,
  buildFieldOutputInstructions,
  buildSystemPrompt,
  fieldPromptFile,
  mediaPromptDir,
  parseConfidence,
  renderPromptTemplate,
} from "../prompting.js";

export async function hydrateField(
  canon: CanonProject,
  fieldPath: string,
  outputDir: string,
  provider: LLMProvider,
  options: { force?: boolean; dryRun?: boolean; promptHint?: string; iterations?: number; refinementGoals?: string[] },
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
  const system = await buildSystemPrompt(canon);
  const contextBundle = buildFieldContextBundle(canon, fieldPath);
  const outputInstructions = buildFieldOutputInstructions(fieldPath, field.value);
  const iterationCount = Math.max(1, Math.min(options.iterations ?? 1, 5));
  const refinementGoals = options.refinementGoals?.filter(Boolean) ?? [];
  const user = promptFile
    ? await renderPromptTemplate([
      mediaPromptDir(canon.canon.format.value),
      "fields",
      promptFile,
    ], canon, {
      fieldPath,
      currentValue: stringifyFieldValue(field.value),
      relatedContext: contextBundle,
      outputInstructions,
    })
    : [
      buildFallbackFieldPrompt(canon, fieldPath, field.value),
      contextBundle,
      outputInstructions,
    ].join("\n\n");

  const finalPrompt = options.promptHint ? `${user}\n\nAdditional user guidance:\n${options.promptHint}` : user;
  const result = await iterateFieldSuggestion(provider, {
    system,
    user: finalPrompt,
    fieldPath,
    iterations: iterationCount,
    refinementGoals,
  });

  const suggestion: AISuggestion = {
    field: fieldPath,
    value: result.content,
    confidence: result.confidence,
    provider: provider.id,
    model: result.model,
    generatedAt: new Date().toISOString(),
    status: "pending",
    tokenUsage: {
      prompt: result.promptTokens,
      completion: result.completionTokens,
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

async function iterateFieldSuggestion(
  provider: LLMProvider,
  options: {
    system: string;
    user: string;
    fieldPath: string;
    iterations: number;
    refinementGoals: string[];
  },
) {
  let currentPrompt = options.user;
  let latest = { content: "", confidence: 0.5, model: "", promptTokens: 0, completionTokens: 0 };

  for (let index = 0; index < options.iterations; index += 1) {
    const response = await provider.complete({ system: options.system, user: currentPrompt });
    const parsed = parseConfidence(response.content);
    latest = {
      content: parsed.content,
      confidence: parsed.confidence,
      model: response.model,
      promptTokens: latest.promptTokens + response.usage.promptTokens,
      completionTokens: latest.completionTokens + response.usage.completionTokens,
    };

    if (index === options.iterations - 1) {
      break;
    }

    currentPrompt = [
      options.user,
      "Previous draft:",
      latest.content,
      options.refinementGoals.length > 0
        ? `Refine only these areas: ${options.refinementGoals.join(", ")}`
        : `Refine ${options.fieldPath} for stronger specificity, canon consistency, and polish.`,
      "Return the full replacement value again, not notes about the revision.",
    ].join("\n\n");
  }

  return latest;
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
