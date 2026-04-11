import path from "node:path";
import fs from "fs-extra";
import type { CanonProject, PackageManifest, ValidationIssue, ValidationResult } from "./types.js";

function scoreFromIssues(issues: ValidationIssue[]) {
  const penalty = issues.reduce((sum, issue) => sum + (issue.level === "error" ? 15 : 5), 0);
  return Math.max(0, 100 - penalty);
}

export async function validatePackage(params: {
  outputDir: string;
  canon: CanonProject;
  manifest: PackageManifest;
  protectedRegionWarnings?: string[];
}): Promise<ValidationResult> {
  const issues: ValidationIssue[] = [];

  for (const file of params.manifest.requiredFiles) {
    const absolutePath = path.join(params.outputDir, file);
    if (!(await fs.pathExists(absolutePath))) {
      issues.push({ level: "error", code: "required_file_missing", message: `Required file missing: ${file}`, path: file });
    }
  }

  for (const fieldName of ["title", "logline", "format", "genre", "world_setting"] as const) {
    const field = params.canon.canon[fieldName];
    if (!field.value || (typeof field.value === "string" && !field.value.trim())) {
      issues.push({ level: "error", code: "canon_required_missing", message: `Missing required canon field: ${fieldName}` });
    }
  }

  if (
    params.canon.canon.characters.value.length >= 2
    && params.canon.canon.episodes.value.length >= 2
    && (!params.canon.canon.storylines || params.canon.canon.storylines.value.length === 0)
  ) {
    issues.push({
      level: "warning",
      code: "MISSING_STORYLINES",
      message: "No storyline arcs defined. Consider running a new_storyline iteration.",
      path: "canon.storylines",
    });
  }

  if (params.canon.canon.themes.value.some((theme) => typeof theme === "string")) {
    if (!params.canon.canon.themes_structured || params.canon.canon.themes_structured.value.length === 0) {
      issues.push({
        level: "warning",
        code: "UNSTRUCTURED_THEMES",
        message: "Themes are raw strings. Run develop_themes to add structure and motifs.",
        path: "canon.themes",
      });
    }
  }

  if (!params.canon.canon.locations || params.canon.canon.locations.value.length === 0) {
    issues.push({
      level: "warning",
      code: "MISSING_LOCATIONS",
      message: "No locations defined. Run world_expansion to ground the world.",
      path: "canon.locations",
    });
  }

  for (const record of params.manifest.generatedFiles) {
    const filePath = path.join(params.outputDir, record.path);
    if (!(await fs.pathExists(filePath))) {
      issues.push({ level: "error", code: "manifest_mismatch", message: `Manifest references missing file: ${record.path}`, path: record.path });
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");
    if (/\{\{.+\}\}|__TODO__|__TBD__|\[PLACEHOLDER\]/.test(content)) {
      issues.push({ level: "warning", code: "placeholder_detected", message: `Potential unresolved placeholder in ${record.path}`, path: record.path });
    }

    if (record.outputFormat === "md" && !content.includes(record.canonFingerprint)) {
      issues.push({ level: "warning", code: "stale_output", message: `File may be stale against canon fingerprint: ${record.path}`, path: record.path });
    }
  }

  for (const warning of params.protectedRegionWarnings ?? []) {
    issues.push({
      level: "warning",
      code: "protected_region_mismatch",
      message: warning,
    });
  }

  return {
    ok: issues.every((issue) => issue.level !== "error"),
    issues,
    completenessScore: scoreFromIssues(issues),
  };
}
