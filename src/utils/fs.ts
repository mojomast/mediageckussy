import path from "node:path";
import fs from "fs-extra";

export async function ensureDirectories(baseDir: string, directories: string[]) {
  for (const directory of directories) {
    await fs.ensureDir(path.join(baseDir, directory));
  }
}

export async function writeTextFile(filePath: string, content: string) {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf8");
}
