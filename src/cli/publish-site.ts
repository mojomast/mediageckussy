import path from "node:path";
import fs from "fs-extra";

async function main() {
  const source = process.argv[2];
  const destination = process.argv[3];

  if (!source || !destination) {
    throw new Error("Usage: tsx src/cli/publish-site.ts <generated-package-dir> <deploy-dir>");
  }

  const siteDir = path.join(path.resolve(source), "site");
  const deployDir = path.resolve(destination);

  if (!(await fs.pathExists(siteDir))) {
    throw new Error(`Generated site directory not found: ${siteDir}`);
  }

  await fs.ensureDir(deployDir);
  await fs.copy(siteDir, deployDir, { overwrite: true });
  console.log(JSON.stringify({ publishedFrom: siteDir, publishedTo: deployDir }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
