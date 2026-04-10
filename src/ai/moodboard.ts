import path from "node:path";
import fs from "fs-extra";
import sharp from "sharp";
import type { CanonProject } from "../core/types.js";
import type { ImageProvider } from "./image/types.js";
import { generateAsset } from "./assetGenerator.js";

export async function generateMoodBoard(
  canon: CanonProject,
  outputDir: string,
  provider: ImageProvider,
  panelCount: 4 | 6 | 9 = 6,
): Promise<string> {
  const panelDir = path.join(outputDir, "site/assets/generated/mood-board/panels");
  await fs.ensureDir(panelDir);

  const panels: string[] = [];
  for (let index = 0; index < panelCount; index += 1) {
    const result = await generateAsset(canon, outputDir, "mood-board-panel", provider, {
      promptOverride: `${canon.canon.title.value}; variation ${index + 1}; tones: ${canon.canon.tone.value.join(", ")}`,
    });
    panels.push(path.join(outputDir, result.path));
  }

  const columns = panelCount === 4 ? 2 : 3;
  const rows = panelCount === 4 ? 2 : panelCount === 6 ? 2 : 3;
  const cellSize = 512;
  const compositePath = path.join(outputDir, "site/assets/generated/mood-board/moodboard.jpg");
  const composite = sharp({
    create: {
      width: columns * cellSize,
      height: rows * cellSize,
      channels: 3,
      background: "#111111",
    },
  });

  const overlays = await Promise.all(panels.map(async (panelPath, index) => ({
    input: await sharp(panelPath).resize(cellSize, cellSize).jpeg().toBuffer(),
    left: (index % columns) * cellSize,
    top: Math.floor(index / columns) * cellSize,
  })));

  await fs.ensureDir(path.dirname(compositePath));
  await composite.composite(overlays).jpeg().toFile(compositePath);
  return compositePath;
}
