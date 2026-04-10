import fs from "fs-extra";
import type { CanonProject } from "../../core/types.js";
import { analyzeProtectedRegions } from "../../utils/protectedRegions.js";
import type { LLMProvider } from "../providers/types.js";
import { buildSystemPrompt, parseConfidence } from "../prompting.js";

const PLACEHOLDER_PATTERN = /\bTODO\b|\bTBD\b|\{\{[^}]+\}\}/g;

export async function hydrateDocument(
  canon: CanonProject,
  filePath: string,
  provider: LLMProvider,
  options: { dryRun?: boolean },
): Promise<{ replacements: number; skipped: string[] }> {
  const original = await fs.readFile(filePath, "utf8");
  const analysis = analyzeProtectedRegions(original);
  const protectedRanges = collectProtectedRanges(original);
  const matches = [...original.matchAll(PLACEHOLDER_PATTERN)].filter((match) => !isInsideProtected(match.index ?? 0, protectedRanges));
  const skipped = [...analysis.warnings];

  if (matches.length === 0) {
    return { replacements: 0, skipped };
  }

  const system = await buildSystemPrompt(canon);
  let result = original;

  for (const match of matches.reverse()) {
    const index = match.index ?? 0;
    const token = match[0];
    const context = original.slice(Math.max(0, index - 200), Math.min(original.length, index + token.length + 200));
    const response = await provider.complete({
      system,
      user: [
        `File placeholder token: ${token}`,
        "Surrounding content:",
        context,
        "Write replacement text only.",
      ].join("\n\n"),
    });
    const parsed = parseConfidence(response.content);
    const replacement = `<!-- AI_DRAFT_START -->${parsed.content}<!-- AI_DRAFT_END -->`;
    result = `${result.slice(0, index)}${replacement}${result.slice(index + token.length)}`;
  }

  if (!options.dryRun) {
    await fs.writeFile(filePath, result, "utf8");
  }

  return {
    replacements: matches.length,
    skipped,
  };
}

function collectProtectedRanges(content: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const pattern = /(?:<!--\s*MANUAL_EDIT_START:[\s\S]*?MANUAL_EDIT_END:[\s\S]*?-->|^\s*#\s*MANUAL_EDIT_START:[\s\S]*?^\s*#\s*MANUAL_EDIT_END:[^\n]*$)/gm;
  for (const match of content.matchAll(pattern)) {
    ranges.push({ start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  return ranges;
}

function isInsideProtected(index: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((range) => index >= range.start && index < range.end);
}
