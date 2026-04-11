import fs from "fs-extra";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { generateAsset } from "../../ai/assetGenerator.js";
import { MockImageProvider, resolveImageProviderWithMetadata } from "../../ai/image/index.js";
import { generateMoodBoard } from "../../ai/moodboard.js";
import { registerAsset, readManifest } from "../../core/manifest.js";
import { buildManifest, writeManifest } from "../../core/manifest.js";
import { loadCanon } from "../../utils/canon.js";
import { createTempOutputDir, fixturePath } from "../helpers.js";

describe("image tools", () => {
  test("MockImageProvider copies fixture to outputPath and returns correct shape", async () => {
    const fixture = await createFixturePng();
    const provider = new MockImageProvider(fixture);
    const outputDir = await createTempOutputDir("mock-image");
    const outputPath = path.join(outputDir, "copied.png");

    const result = await provider.generate({ prompt: "poster", width: 10, height: 10 }, outputPath);

    await expect(fs.pathExists(outputPath)).resolves.toBe(true);
    expect(result).toMatchObject({ localPath: outputPath, model: "mock-image", prompt: "poster" });
  });

  test("generateAsset poster uses correct dimensions and writes sidecar", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const fixture = await createFixturePng();
    const provider = new MockImageProvider(fixture);
    const outputDir = await createTempOutputDir("asset-poster");
    await writeManifest(outputDir, buildManifest({
      projectId: canon.id,
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      requiredFiles: [],
      generatedFiles: [],
    }));

    const result = await generateAsset(canon, outputDir, "poster", provider, {});

    expect(result.width).toBe(1024);
    expect(result.height).toBe(1536);
    await expect(fs.pathExists(path.join(outputDir, result.path))).resolves.toBe(true);
    await expect(fs.pathExists(path.join(outputDir, `${result.path}.prompt.json`))).resolves.toBe(true);
  });

  test("generateAsset with dryRun does not call provider", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const provider = new MockImageProvider(await createFixturePng());
    const outputDir = await createTempOutputDir("asset-dry-run");

    const result = await generateAsset(canon, outputDir, "poster", provider, { dryRun: true });
    expect(result.model).toBe("dry-run");
    await expect(fs.pathExists(path.join(outputDir, result.path))).resolves.toBe(false);
  });

  test("registerAsset adds entry to manifest generatedAssets array", async () => {
    const outputDir = await createTempOutputDir("asset-register");
    await writeManifest(outputDir, buildManifest({
      projectId: "project",
      mediaType: "tv_series",
      packageTier: "full",
      requiredFiles: [],
      generatedFiles: [],
    }));

    await registerAsset(outputDir, {
      type: "poster",
      path: "site/assets/generated/poster/example.png",
      provider: "mock",
      model: "mock-image",
      prompt: "prompt",
      canonFingerprint: "fingerprint",
      generatedAt: new Date().toISOString(),
    });

    const manifest = await readManifest(outputDir);
    expect(manifest.generatedAssets).toHaveLength(1);
  });

  test("resolveImageProviderWithMetadata falls back to stub when provider is unavailable", async () => {
    delete process.env.MEDIAGECKUSSY_OPENAI_API_KEY;

    const { provider, resolution } = await resolveImageProviderWithMetadata("openai-dalle3");

    expect(provider.id).toBe("stub");
    expect(resolution.fallbackUsed).toBe(true);
    expect(resolution.resolvedId).toBe("stub");
  });

  test("resolveImageProviderWithMetadata maps legacy provider aliases", async () => {
    const { resolution } = await resolveImageProviderWithMetadata("flux");
    expect(resolution.requestedId).toBe("flux");
  });

  test("generateMoodBoard with panelCount=4 produces 4 panels and composite", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const fixture = await createFixturePng();
    const provider = new MockImageProvider(fixture);
    const outputDir = await createTempOutputDir("moodboard");
    await writeManifest(outputDir, buildManifest({
      projectId: canon.id,
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      requiredFiles: [],
      generatedFiles: [],
    }));

    const compositePath = await generateMoodBoard(canon, outputDir, provider, 4);

    await expect(fs.pathExists(compositePath)).resolves.toBe(true);
    const panelDir = path.join(outputDir, "site/assets/generated/mood-board-panel");
    const panelFiles = await collectPngFiles(panelDir);
    expect(panelFiles).toHaveLength(4);
  });
});

async function createFixturePng() {
  const fixtureDir = await createTempOutputDir("fixture-png");
  const fixturePath = path.join(fixtureDir, "sample.png");
  await sharp({
    create: { width: 16, height: 16, channels: 3, background: "#44aa88" },
  }).png().toFile(fixturePath);
  return fixturePath;
}

async function collectPngFiles(rootDir: string): Promise<string[]> {
  if (!(await fs.pathExists(rootDir))) {
    return [];
  }
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const absolutePath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      return collectPngFiles(absolutePath);
    }
    return absolutePath.endsWith(".png") ? [absolutePath] : [];
  }));
  return nested.flat();
}
