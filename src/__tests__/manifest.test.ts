import fs from "fs-extra";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fixturePath, generateFixture } from "./helpers.js";

describe("manifest fidelity", () => {
  test("matches generated files on disk", async () => {
    const canonPath = fixturePath("examples/sample-tv/canon.yaml");
    const { outputDir } = await generateFixture(canonPath, "mpg-manifest");
    const manifest = await fs.readJson(path.join(outputDir, "00_admin/package_manifest.json"));

    const manifestPaths = new Set<string>(manifest.generatedFiles.map((file: { path: string; }) => file.path));

    for (const relativePath of manifestPaths) {
      await expect(fs.pathExists(path.join(outputDir, relativePath))).resolves.toBe(true);
    }

    const diskFiles = await collectFiles(outputDir);
    expect(new Set(diskFiles)).toEqual(manifestPaths);
  });
});

async function collectFiles(rootDir: string, currentDir: string = rootDir): Promise<string[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const files: string[][] = await Promise.all(entries.map(async (entry): Promise<string[]> => {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      return collectFiles(rootDir, absolutePath);
    }
    return [path.relative(rootDir, absolutePath)];
  }));

  return files.flat().sort();
}
