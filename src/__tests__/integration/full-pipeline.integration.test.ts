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

describe("full pipeline integration", () => {
  test("generate, hydrate, accept, regenerate, asset, and server listing work together", async () => {
    const outputDir = path.resolve("output/integration-tv");
    await fs.remove(outputDir);
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

    const app = createApp();
    const response = await request(app).get("/api/projects");
    expect(response.body.ok).toBe(true);
    expect(response.body.data.some((project: { slug: string }) => project.slug === "integration-tv")).toBe(true);
  });
});
