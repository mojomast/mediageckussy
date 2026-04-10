import path from "node:path";
import fs from "fs-extra";
import type { GeneratedFileRecord, PackageManifest } from "./types.js";

export function buildManifest(input: {
  projectId: string;
  mediaType: string;
  packageTier: string;
  requiredFiles: string[];
  generatedFiles: GeneratedFileRecord[];
}): PackageManifest {
  const departmentMap = new Map<string, number>();

  for (const file of input.generatedFiles) {
    departmentMap.set(file.department, (departmentMap.get(file.department) ?? 0) + 1);
  }

  return {
    projectId: input.projectId,
    generatedAt: new Date().toISOString(),
    mediaType: input.mediaType,
    packageTier: input.packageTier,
    generatedFiles: input.generatedFiles,
    requiredFiles: input.requiredFiles,
    departments: [...departmentMap.entries()].map(([name, fileCount]) => ({ name, fileCount })),
  };
}

export async function writeManifest(outputDir: string, manifest: PackageManifest) {
  await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), manifest, { spaces: 2 });
}
