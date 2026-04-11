import fs from "fs-extra";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fixturePath, generateFixture } from "./helpers.js";

describe("TV generator", () => {
  test("generates the expected TV package outputs", async () => {
    const canonPath = fixturePath("examples/sample-tv/canon.yaml");
    const { outputDir } = await generateFixture(canonPath, "mpg-tv");

    const expectedFiles = [
      "00_admin/canon_lock.yaml",
      "00_admin/package_manifest.json",
      "01_development/series_bible.md",
      "06_press_kit/press_kit.md",
      "16_ops/validation_report.json",
      "site/index.html",
      "site/press.html",
    ];

    for (const relativePath of expectedFiles) {
      await expect(fs.pathExists(path.join(outputDir, relativePath))).resolves.toBe(true);
    }

    const validation = await fs.readJson(path.join(outputDir, "16_ops/validation_report.json"));
    expect(validation.ok).toBe(true);

    const canonLock = await fs.readFile(path.join(outputDir, "00_admin/canon_lock.yaml"), "utf8");
    expect(canonLock).toContain("Neon Aftercare");

    const indexHtml = await fs.readFile(path.join(outputDir, "site/index.html"), "utf8");
    expect(indexHtml).toContain("Neon Aftercare");
  });

  test("renders enriched canon documents and website content from full fixture", async () => {
    const canonPath = fixturePath("fixtures/test-canon-full.json");
    const { outputDir } = await generateFixture(canonPath, "mpg-tv-full");

    const expectedFiles = [
      "creative/storyline_arc_document.md",
      "creative/world_guide.md",
      "01_development/character_bible.md",
      "07_website/website_content.md",
    ];

    for (const relativePath of expectedFiles) {
      await expect(fs.pathExists(path.join(outputDir, relativePath))).resolves.toBe(true);
    }

    const seriesBible = await fs.readFile(path.join(outputDir, "01_development/series_bible.md"), "utf8");
    expect(seriesBible).toContain("The Moonlight Economy");
    expect(seriesBible).toContain("Dock Nine Quarantine Slip");
    expect(seriesBible).toContain("Aftercare Crew");

    const storylineDoc = await fs.readFile(path.join(outputDir, "creative/storyline_arc_document.md"), "utf8");
    expect(storylineDoc).toContain("Arc 1: The Moonlight Economy");
    expect(storylineDoc).not.toContain("{{@index_plus_1}}");

    const websiteContent = await fs.readFile(path.join(outputDir, "07_website/website_content.md"), "utf8");
    expect(websiteContent).toContain("Storyline Hooks");
    expect(websiteContent).toContain("Dock Nine Quarantine Slip");
  });
});
