import fs from "fs-extra";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { fixturePath, generateFixture } from "./helpers.js";

describe("web series generator", () => {
  test("generates the expected web series package outputs", async () => {
    const canonPath = fixturePath("examples/sample-web-series/canon.yaml");
    const { outputDir } = await generateFixture(canonPath, "mpg-web");

    await expect(fs.pathExists(path.join(outputDir, "02_episode_guides/episode_guide.md"))).resolves.toBe(true);
    await expect(fs.pathExists(path.join(outputDir, "site/index.html"))).resolves.toBe(true);

    const validation = await fs.readJson(path.join(outputDir, "16_ops/validation_report.json"));
    expect(validation.ok).toBe(true);

    const canonLock = await fs.readFile(path.join(outputDir, "00_admin/canon_lock.yaml"), "utf8");
    expect(canonLock).toContain("Soft Launch");

    const indexHtml = await fs.readFile(path.join(outputDir, "site/index.html"), "utf8");
    expect(indexHtml).toContain("Soft Launch");
  });
});
