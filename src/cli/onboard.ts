import path from "node:path";
import fs from "fs-extra";

async function main() {
  const canon = process.argv[2];
  const out = process.argv[3];

  if (!canon || !out) {
    throw new Error("Usage: tsx src/cli/onboard.ts <canon-path> <output-dir>");
  }

  const absoluteCanon = path.resolve(canon);
  const absoluteOut = path.resolve(out);
  const targetSite = path.join(absoluteOut, "site");

  await fs.ensureDir(path.dirname(absoluteOut));

  console.log("1. npm install");
  console.log(`2. npx tsx src/cli/index.ts generate --canon \"${absoluteCanon}\" --out \"${absoluteOut}\"`);
  console.log(`3. python3 -m http.server 4173 --directory \"${targetSite}\"`);
  console.log("4. Open http://localhost:4173");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
