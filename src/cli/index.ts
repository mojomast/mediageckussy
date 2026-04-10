import path from "node:path";
import { generatePackage } from "../core/generator.js";
import { listFormats } from "../core/formats.js";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];

  if (!command || command === "help") {
    console.log("Usage: mpg <generate|regenerate|formats> [options]");
    process.exit(0);
  }

  if (command === "formats") {
    const showAll = process.argv.includes("--all");
    const formats = listFormats({ all: showAll }).map((item) => ({
      mediaType: item.status === "stubbed" ? `${item.mediaType} [STUBBED]` : item.mediaType,
      status: item.status,
    }));
    console.log(JSON.stringify(formats, null, 2));
    process.exit(0);
  }

  if (command === "generate" || command === "regenerate") {
    const canonPath = readArg("--canon");
    const outputDir = readArg("--out");
    const department = readArg("--department");
    const file = readArg("--file");
    const mediaType = readArg("--media-type");

    if (!canonPath || !outputDir) {
      throw new Error("Both --canon and --out are required.");
    }

    const result = await generatePackage({
      canonPath: path.resolve(canonPath),
      outputDir: path.resolve(outputDir),
      department,
      file,
      mediaType,
    });

    console.log(JSON.stringify({
      ok: result.validation.ok,
      completenessScore: result.validation.completenessScore,
      issueCount: result.validation.issues.length,
      manifestPath: path.join(path.resolve(outputDir), "00_admin/package_manifest.json"),
    }, null, 2));
    process.exit(0);
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
