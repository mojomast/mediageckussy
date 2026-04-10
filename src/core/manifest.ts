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
    generatedAssets: [],
    hydrationLog: [],
    requiredFiles: input.requiredFiles,
    departments: [...departmentMap.entries()].map(([name, fileCount]) => ({ name, fileCount })),
  };
}

export async function readManifest(outputDir: string): Promise<PackageManifest> {
  return fs.readJson(path.join(outputDir, "00_admin/package_manifest.json"));
}

export async function writeManifest(outputDir: string, manifest: PackageManifest) {
  await fs.ensureDir(path.join(outputDir, "00_admin"));
  await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), manifest, { spaces: 2 });
}

export async function appendHydrationLog(outputDir: string, entry: NonNullable<PackageManifest["hydrationLog"]>[number]) {
  const manifest = await readManifest(outputDir);
  manifest.hydrationLog = [...(manifest.hydrationLog ?? []), entry];
  await writeManifest(outputDir, manifest);
}

export async function updateHydrationLogStatus(
  outputDir: string,
  target: { field?: string; file?: string },
  status: "pending" | "accepted" | "rejected",
) {
  const manifest = await readManifest(outputDir);
  manifest.hydrationLog = (manifest.hydrationLog ?? []).map((entry) => {
    const matchesField = target.field && entry.field === target.field;
    const matchesFile = target.file && entry.file === target.file;
    return matchesField || matchesFile ? { ...entry, status } : entry;
  });
  await writeManifest(outputDir, manifest);
}

export async function registerAsset(
  outputDir: string,
  asset: NonNullable<PackageManifest["generatedAssets"]>[number],
) {
  const manifest = await readManifest(outputDir);
  manifest.generatedAssets = [...(manifest.generatedAssets ?? []), asset];
  await writeManifest(outputDir, manifest);
}
