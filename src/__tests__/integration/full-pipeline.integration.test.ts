import fs from "fs-extra";
import path from "node:path";
import request from "supertest";
import sharp from "sharp";
import { describe, expect, test } from "vitest";
import { generatePackage } from "../../core/generator.js";
import { fixturePath } from "../helpers.js";
import { loadCanon } from "../../utils/canon.js";
import { hydrateField } from "../../ai/hydrators/fieldHydrator.js";
import { MockLLMProvider } from "../../ai/providers/index.js";
import { acceptSuggestion } from "../../ai/suggestions.js";
import { MockImageProvider } from "../../ai/image/index.js";
import { generateAsset } from "../../ai/assetGenerator.js";
import { readManifest } from "../../core/manifest.js";
import { createApp } from "../../server/app.js";
import { archiveRoot, writeHostedProject } from "../../server/workspace.js";

describe("full pipeline integration", () => {
  test("generate, hydrate, accept, regenerate, asset, and server listing work together", async () => {
    const outputDir = path.resolve("output/integration-tv");
    await fs.remove(outputDir);
    await fs.remove(path.join(archiveRoot, "integration-tv.tar.gz"));
    const canonPath = fixturePath("examples/sample-tv/canon.yaml");

    await generatePackage({ canonPath, outputDir });

    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    await hydrateField(canon, "canon.logline", outputDir, new MockLLMProvider(["Integrated new logline\nCONFIDENCE: 0.9"]), { force: true });
    const accepted = await acceptSuggestion(outputDir, "canon.logline", canon);
    expect(accepted.canon.logline.value).toBe("Integrated new logline");

    await generatePackage({ canonPath: path.join(outputDir, "00_admin/canon_lock.yaml"), outputDir });

    const seriesBible = await fs.readFile(path.join(outputDir, "01_development/series_bible.md"), "utf8");
    expect(seriesBible).toContain("MANUAL_EDIT_START");

    const fixturePng = path.join(outputDir, "mock.png");
    await sharp({ create: { width: 16, height: 16, channels: 3, background: "#335577" } }).png().toFile(fixturePng);
    await generateAsset(accepted, outputDir, "poster", new MockImageProvider(fixturePng), {});

    const manifest = await readManifest(outputDir);
    expect((manifest.generatedAssets ?? []).length).toBeGreaterThan(0);

    await writeHostedProject({
      id: "integration-tv",
      slug: "integration-tv",
      title: accepted.canon.title.value,
      mediaType: accepted.canon.format.value,
      packageTier: accepted.package_tier,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      settings: {
        llmProvider: "openrouter",
        llmModel: "google/gemini-2.5-flash-lite",
      },
    });

    const app = createApp();
    const response = await request(app).get("/api/projects");
    expect(response.body.ok).toBe(true);
    expect(response.body.data.some((project: { slug: string }) => project.slug === "integration-tv")).toBe(true);
  });

  test("full enriched fixture generates helper-driven docs without raw placeholders", async () => {
    const outputDir = path.resolve("output/integration-tv-full");
    await fs.remove(outputDir);

    const canonPath = fixturePath("fixtures/test-canon-full.json");
    await generatePackage({ canonPath, outputDir });

    const handoff = await fs.readFile(path.join(outputDir, "HANDOFF.md"), "utf8");
    const worldGuide = await fs.readFile(path.join(outputDir, "creative/world_guide.md"), "utf8");
    const websiteContent = await fs.readFile(path.join(outputDir, "07_website/website_content.md"), "utf8");

    expect(handoff).toContain("Generated:");
    expect(handoff).not.toContain("{{date generatedAt}}");
    expect(worldGuide).toContain("Aftercare Crew");
    expect(websiteContent).toContain("The Moonlight Economy");
    expect(websiteContent).toContain("Dock Nine Quarantine Slip");
  });
});
