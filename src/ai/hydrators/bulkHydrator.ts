import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import type { CanonProject } from "../../core/types.js";
import { hydrateDocument } from "./docHydrator.js";
import { hydrateField } from "./fieldHydrator.js";
import type { LLMProvider } from "../providers/types.js";
import { loadCanon } from "../../utils/canon.js";
import { loadSuggestions } from "../suggestions.js";

export interface HydrationReport {
  provider: string;
  generatedAt: string;
  tokenTotals: { prompt: number; completion: number };
  fieldSuggestions: number;
  documentReplacements: number;
  skipped: string[];
}

export async function hydratePackage(
  canonPath: string,
  outputDir: string,
  provider: LLMProvider,
  options: {
    concurrency?: number;
    dryRun?: boolean;
    minConfidence?: number;
  },
): Promise<HydrationReport> {
  const canon = await loadCanon(canonPath);
  const fieldPaths = collectDraftFieldPaths(canon);
  const minConfidence = options.minConfidence ?? 0.7;
  const skipped: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let fieldSuggestions = 0;
  let documentReplacements = 0;

  for (const fieldPath of fieldPaths) {
    const result = await hydrateField(canon, fieldPath, outputDir, provider, { dryRun: options.dryRun });
    if (result.skipped) {
      skipped.push(result.reason ?? fieldPath);
      continue;
    }
    promptTokens += result.suggestion.tokenUsage.prompt;
    completionTokens += result.suggestion.tokenUsage.completion;
    if (result.suggestion.confidence >= minConfidence) {
      fieldSuggestions += 1;
    } else if (!options.dryRun) {
      skipped.push(`Low confidence suggestion skipped for ${fieldPath}`);
    }
  }

  const markdownFiles = await collectMarkdownFiles(outputDir);
  for (const absolutePath of markdownFiles) {
    const content = await fs.readFile(absolutePath, "utf8");
    if (!/\bTODO\b|\bTBD\b|\{\{[^}]+\}\}/.test(content)) {
      continue;
    }

    const result = await hydrateDocument(canon, absolutePath, provider, { dryRun: options.dryRun });
    documentReplacements += result.replacements;
    skipped.push(...result.skipped);
  }

  const report: HydrationReport = {
    provider: provider.id,
    generatedAt: new Date().toISOString(),
    tokenTotals: { prompt: promptTokens, completion: completionTokens },
    fieldSuggestions: options.dryRun ? fieldPaths.length : (await loadSuggestions(outputDir)).filter((item) => item.status === "pending" && item.confidence >= minConfidence).length,
    documentReplacements,
    skipped,
  };

  if (!options.dryRun) {
    await fs.ensureDir(path.join(outputDir, "00_admin"));
    await fs.writeFile(path.join(outputDir, "00_admin/hydration_report.yaml"), YAML.stringify(report), "utf8");
  }

  return report;
}

function collectDraftFieldPaths(canon: CanonProject) {
  return Object.entries(canon.canon)
    .filter(([, field]) => field?.status === "draft")
    .map(([key]) => `canon.${key}`);
}

async function collectMarkdownFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const results = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectMarkdownFiles(absolutePath);
    }
    return entry.name.endsWith(".md") ? [absolutePath] : [];
  }));
  return results.flat();
}
