import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceDir = path.join(repoRoot, "src/ai/prompts");
const destinationDir = path.join(repoRoot, "dist/ai/prompts");

await fs.ensureDir(destinationDir);
await fs.copy(sourceDir, destinationDir);
