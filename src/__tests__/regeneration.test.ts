import fs from "fs-extra";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { generatePackage } from "../core/generator.js";
import { fixturePath, generateFixture } from "./helpers.js";

describe("regeneration", () => {
  test("preserves custom content inside protected regions", async () => {
    const canonPath = fixturePath("examples/sample-tv/canon.yaml");
    const { outputDir } = await generateFixture(canonPath, "mpg-regen");
    const seriesBiblePath = path.join(outputDir, "01_development/series_bible.md");
    const customString = "A custom logline written after generation.";

    const existingContent = await fs.readFile(seriesBiblePath, "utf8");
    const updatedContent = existingContent.replace(
      /(?<=<!-- MANUAL_EDIT_START: tv\.series-bible\.logline -->)([\s\S]*?)(?=<!-- MANUAL_EDIT_END: tv\.series-bible\.logline -->)/,
      `\n${customString}\n`,
    );

    await fs.writeFile(seriesBiblePath, updatedContent, "utf8");

    await generatePackage({ canonPath, outputDir, file: "01_development/series_bible.md" });

    const regeneratedContent = await fs.readFile(seriesBiblePath, "utf8");
    expect(regeneratedContent).toContain(customString);
  });
});
