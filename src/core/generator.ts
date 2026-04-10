import path from "node:path";
import YAML from "yaml";
import { getFormatPack } from "./formats.js";
import { buildManifest, writeManifest } from "./manifest.js";
import { TemplateRegistry } from "./template-registry.js";
import { validatePackage } from "./validators.js";
import type { CanonProject, GenerateOptions, GeneratedFileRecord } from "./types.js";
import { ensureDirectories, writeTextFile } from "../utils/fs.js";
import { fingerprintCanon, loadCanon, publicCanonSlice } from "../utils/canon.js";
import { analyzeProtectedRegions, reapplyProtectedRegions } from "../utils/protectedRegions.js";
import fs from "fs-extra";

function buildTemplateData(canon: CanonProject, fingerprint: string) {
  const publicCanon = publicCanonSlice(canon);
  const generatedAt = new Date().toISOString();
  return {
    project: canon,
    canon: canon.canon,
    publicCanon,
    meta: {
      generatedAt,
      canonFingerprint: fingerprint,
      templateVersion: "v1",
    },
  };
}

function withFrontmatter(body: string, params: { templateId: string; sources: string[]; regenPolicy: string; generatedAt: string; canonFingerprint: string; }) {
  return `---\nowner: system\nstatus: draft\ntemplate: ${params.templateId}\nsources:\n${params.sources.map((source) => `  - ${source}`).join("\n")}\ngenerated_at: ${params.generatedAt}\nregen: ${params.regenPolicy}\ncanon_fingerprint: ${params.canonFingerprint}\n---\n\n${body}`;
}

export async function generatePackage(options: GenerateOptions) {
  const canon = await loadCanon(options.canonPath);
  const mediaType = options.mediaType ?? canon.canon.format.value;
  const formatPack = getFormatPack(mediaType);

  if (formatPack.status === "stubbed" || !formatPack.supported) {
    throw new Error(
      `Format "${mediaType}" is not yet implemented.\nRun formats --all to see all available formats including stubs.`,
    );
  }

  const outputDir = options.outputDir;
  const repoRoot = path.resolve(path.join(import.meta.dirname, "../../"));
  const registry = new TemplateRegistry(formatPack.templates);
  const canonFingerprint = fingerprintCanon(canon);
  const templateData = buildTemplateData(canon, canonFingerprint);

  await ensureDirectories(outputDir, formatPack.directories);

  const records: GeneratedFileRecord[] = [];
  const protectedRegionWarnings: string[] = [];
  const selectedTemplates = registry.selectForDepartment(mediaType, canon.package_tier, options.department, options.file);

  for (const template of selectedTemplates) {
    if (template.kind === "site" && !canon.outputs.website.enabled) {
      continue;
    }

    const rendered = await registry.render(template, templateData, repoRoot);
    const generatedAt = new Date().toISOString();
    const finalContent = template.outputFormat === "md"
      ? withFrontmatter(rendered, {
          templateId: template.id,
          sources: template.sources,
          regenPolicy: template.regenPolicy,
          generatedAt,
          canonFingerprint,
        })
      : rendered;

    const targetPath = path.join(outputDir, template.path);
    let contentToWrite = finalContent;

    if (await fs.pathExists(targetPath)) {
      const existingContent = await fs.readFile(targetPath, "utf8");
      const analysis = analyzeProtectedRegions(existingContent);
      if (analysis.hasMarkers && analysis.regions.size === 0) {
        protectedRegionWarnings.push(`Protected region marker mismatch in ${template.path}`);
      }
      contentToWrite = reapplyProtectedRegions(finalContent, analysis.regions);
    }

    await writeTextFile(targetPath, contentToWrite);

    records.push({
      path: template.path,
      templateId: template.id,
      department: template.department,
      audience: template.audience,
      outputFormat: template.outputFormat,
      sources: template.sources,
      status: "generated",
      regenPolicy: template.regenPolicy,
      generatedAt,
      canonFingerprint,
    });
  }

  await writeTextFile(path.join(outputDir, "00_admin/canon_lock.yaml"), YAML.stringify(canon));
  records.push({
    path: "00_admin/canon_lock.yaml",
    templateId: "system-canon-lock",
    department: "admin",
    audience: ["internal", "ops"],
    outputFormat: "yaml",
    sources: ["canon.*"],
    status: "generated",
    regenPolicy: "manual_only",
    generatedAt: new Date().toISOString(),
    canonFingerprint,
  });

  const manifest = buildManifest({
    projectId: canon.id,
    mediaType,
    packageTier: canon.package_tier,
    requiredFiles: formatPack.requiredFiles,
    generatedFiles: records,
  });

  await writeManifest(outputDir, manifest);

  const validation = await validatePackage({ outputDir, canon, manifest, protectedRegionWarnings });
  await writeTextFile(
    path.join(outputDir, "16_ops/validation_report.json"),
    JSON.stringify(validation, null, 2),
  );

  return { canon, manifest, validation };
}
