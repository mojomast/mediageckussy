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
});
