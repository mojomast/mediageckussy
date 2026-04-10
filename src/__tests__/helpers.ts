import fs from "fs-extra";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import { generatePackage } from "../core/generator.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.remove(dir)));
});

export async function createTempOutputDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

export async function generateFixture(canonPath: string, prefix: string) {
  const outputDir = await createTempOutputDir(prefix);
  const result = await generatePackage({ canonPath, outputDir });
  return { outputDir, result };
}

export function fixturePath(...segments: string[]) {
  return path.resolve(import.meta.dirname, "../../", ...segments);
}
