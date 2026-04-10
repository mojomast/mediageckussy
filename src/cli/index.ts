import path from "node:path";
import fs from "fs-extra";
import { generatePackage } from "../core/generator.js";
import { listFormats } from "../core/formats.js";
import { hydrateDocument } from "../ai/hydrators/docHydrator.js";
import { hydrateField } from "../ai/hydrators/fieldHydrator.js";
import { hydratePackage } from "../ai/hydrators/bulkHydrator.js";
import { resolveProvider } from "../ai/providers/index.js";
import { acceptSuggestion, loadSuggestions, rejectSuggestion } from "../ai/suggestions.js";
import { loadCanon } from "../utils/canon.js";
import { generateAsset, type AssetType } from "../ai/assetGenerator.js";
import { resolveImageProvider } from "../ai/image/index.js";
import { generateMoodBoard } from "../ai/moodboard.js";
import { readManifest } from "../core/manifest.js";

function readArg(flag: string) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const subcommand = process.argv[3];

  if (!command || command === "help") {
    console.log("Usage: mpg <generate|regenerate|formats|hydrate|assets> [options]");
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

  if (command === "hydrate") {
    const canonPath = readArg("--canon");
    const outputDir = readArg("--out");
    const field = readArg("--field");
    const file = readArg("--file");
    const mode = readArg("--mode");
    const providerName = readArg("--provider");
    const dryRun = process.argv.includes("--dry-run");
    const force = process.argv.includes("--force");
    const all = process.argv.includes("--all");
    const minConfidence = Number(readArg("--min-confidence") ?? process.env.MEDIAGECKUSSY_HYDRATION_MIN_CONFIDENCE ?? "0.7");

    if (subcommand === "accept") {
      if (!outputDir) {
        throw new Error("--out is required for hydrate accept");
      }

      const canon = await loadCanon(path.join(path.resolve(outputDir), "00_admin/canon_lock.yaml"));
      if (all) {
        const suggestions = await loadSuggestions(path.resolve(outputDir));
        const accepted: string[] = [];
        for (const suggestion of suggestions) {
          if (suggestion.status === "pending" && suggestion.confidence >= minConfidence) {
            await acceptSuggestion(path.resolve(outputDir), suggestion.field, canon);
            accepted.push(suggestion.field);
          }
        }
        console.log(JSON.stringify({ ok: true, accepted }, null, 2));
        process.exit(0);
      }

      if (!field) {
        throw new Error("--field or --all is required for hydrate accept");
      }

      const updated = await acceptSuggestion(path.resolve(outputDir), field, canon);
      await fs.writeFile(path.join(path.resolve(outputDir), "00_admin/canon_lock.yaml"), JSON.stringify(updated, null, 2), "utf8");
      console.log(JSON.stringify({ ok: true, accepted: field }, null, 2));
      process.exit(0);
    }

    if (subcommand === "reject") {
      if (!outputDir || !field) {
        throw new Error("--out and --field are required for hydrate reject");
      }
      await rejectSuggestion(path.resolve(outputDir), field);
      console.log(JSON.stringify({ ok: true, rejected: field }, null, 2));
      process.exit(0);
    }

    if (subcommand === "status") {
      if (!outputDir) {
        throw new Error("--out is required for hydrate status");
      }
      const suggestions = await loadSuggestions(path.resolve(outputDir));
      console.log(JSON.stringify(suggestions.filter((item) => item.status === "pending"), null, 2));
      process.exit(0);
    }

    if (!canonPath || !outputDir) {
      throw new Error("Both --canon and --out are required.");
    }

    const provider = resolveProvider(providerName);
    const canon = await loadCanon(path.resolve(canonPath));

    if (mode === "bulk") {
      const report = await hydratePackage(path.resolve(canonPath), path.resolve(outputDir), provider, { dryRun, minConfidence });
      console.log(JSON.stringify(report, null, 2));
      process.exit(0);
    }

    if (field) {
      const result = await hydrateField(canon, field, path.resolve(outputDir), provider, { force, dryRun });
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    if (file) {
      const result = await hydrateDocument(canon, path.resolve(outputDir, file), provider, { dryRun });
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    }

    throw new Error("Provide one of --field, --file, or --mode bulk for hydrate");
  }

  if (command === "assets") {
    const canonPath = readArg("--canon");
    const outputDir = readArg("--out");
    const type = readArg("--type") as AssetType | undefined;
    const providerName = readArg("--provider");
    const promptOverride = readArg("--prompt-override");
    const character = readArg("--character");
    const all = process.argv.includes("--all");
    const dryRun = process.argv.includes("--dry-run");

    if (subcommand === "list") {
      if (!outputDir) {
        throw new Error("--out is required for assets list");
      }
      const manifest = await readManifest(path.resolve(outputDir));
      console.log(JSON.stringify(manifest.generatedAssets ?? [], null, 2));
      process.exit(0);
    }

    if (!canonPath || !outputDir) {
      throw new Error("Both --canon and --out are required.");
    }

    const canon = await loadCanon(path.resolve(canonPath));
    const provider = resolveImageProvider(providerName);

    if (subcommand === "moodboard") {
      const panels = Number(readArg("--panels") ?? "6") as 4 | 6 | 9;
      const moodboardPath = await generateMoodBoard(canon, path.resolve(outputDir), provider, panels);
      console.log(JSON.stringify({ ok: true, moodboardPath }, null, 2));
      process.exit(0);
    }

    if (subcommand === "generate") {
      const assetTypes: AssetType[] = all
        ? ["poster", "key-art", "character-portrait", "episode-card", "mood-board-panel", "social-banner", "podcast-cover"]
        : type ? [type] : [];

      if (assetTypes.length === 0) {
        throw new Error("Provide --type or --all for assets generate");
      }

      const results = [];
      for (const assetType of assetTypes) {
        results.push(await generateAsset(canon, path.resolve(outputDir), assetType, provider, {
          characterId: character ?? undefined,
          promptOverride: promptOverride ?? undefined,
          dryRun,
        }));
      }
      console.log(JSON.stringify(results, null, 2));
      process.exit(0);
    }

    throw new Error(`Unknown assets subcommand: ${subcommand ?? ""}`);
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
