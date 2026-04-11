import fs from "fs-extra";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { hydrateDocument } from "../../ai/hydrators/docHydrator.js";
import { hydrateField } from "../../ai/hydrators/fieldHydrator.js";
import { MockLLMProvider } from "../../ai/providers/index.js";
import { acceptSuggestion, addSuggestion, loadSuggestions, rejectSuggestion } from "../../ai/suggestions.js";
import { createTempOutputDir, fixturePath } from "../helpers.js";
import { loadCanon } from "../../utils/canon.js";

describe("AI hydrators", () => {
  test("hydrateField skips locked fields without force", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-field-skip");
    const provider = new MockLLMProvider(["ignored\nCONFIDENCE: 0.8"]);

    const result = await hydrateField(canon, "canon.title", outputDir, provider, {});

    expect(result.skipped).toBe(true);
    expect(result.reason).toMatch(/locked/);
  });

  test("hydrateField with dryRun does not write suggestion to disk", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-field-dry");
    const provider = new MockLLMProvider(["new logline\nCONFIDENCE: 0.85"]);

    const result = await hydrateField(canon, "canon.logline", outputDir, provider, { force: true, dryRun: true });

    expect(result.skipped).toBe(false);
    await expect(loadSuggestions(outputDir)).resolves.toEqual([]);
  });

  test("hydrateField parses confidence correctly", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-field-confidence");
    const provider = new MockLLMProvider(["new logline\nCONFIDENCE: 0.85"]);

    const result = await hydrateField(canon, "canon.logline", outputDir, provider, { force: true });

    expect(result.suggestion.confidence).toBe(0.85);
  });

  test("hydrateField appends prompt hint to the user prompt", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-field-hint");
    const seen: string[] = [];
    const provider = {
      id: "mock",
      name: "Mock",
      async complete(req: { user: string }) {
        seen.push(req.user);
        return {
          content: "hinted\nCONFIDENCE: 0.9",
          model: "mock-llm",
          usage: { promptTokens: 1, completionTokens: 1 },
          durationMs: 0,
        };
      },
      async isAvailable() {
        return true;
      },
    };

    await hydrateField(canon, "canon.logline", outputDir, provider, { force: true, promptHint: "Make it sharper." });

    expect(seen[0]).toContain("Make it sharper.");
  });

  test("hydrateDocument does not modify protected manual-edit regions", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-doc-protected");
    const filePath = path.join(outputDir, "doc.md");
    const original = [
      "before TODO",
      "<!-- MANUAL_EDIT_START: one -->",
      "TODO should stay here",
      "<!-- MANUAL_EDIT_END: one -->",
    ].join("\n");
    await fs.writeFile(filePath, original, "utf8");

    const provider = new MockLLMProvider(["replacement\nCONFIDENCE: 0.8"]);
    await hydrateDocument(canon, filePath, provider, {});

    const updated = await fs.readFile(filePath, "utf8");
    expect(updated).toContain("TODO should stay here");
    expect(updated).toContain("AI_DRAFT_START");
  });

  test("hydrateDocument wraps replacements in AI_DRAFT markers", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-doc-markers");
    const filePath = path.join(outputDir, "doc.md");
    await fs.writeFile(filePath, "Press intro TODO", "utf8");

    const provider = new MockLLMProvider(["filled text\nCONFIDENCE: 0.8"]);
    await hydrateDocument(canon, filePath, provider, {});

    const updated = await fs.readFile(filePath, "utf8");
    expect(updated).toContain("<!-- AI_DRAFT_START -->filled text<!-- AI_DRAFT_END -->");
  });

  test("acceptSuggestion merges value into canon and sets owner agent", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-accept");
    await fs.ensureDir(path.join(outputDir, "00_admin"));
    await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), {
      projectId: canon.id,
      generatedAt: new Date().toISOString(),
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      generatedFiles: [],
      requiredFiles: [],
      departments: [],
      hydrationLog: [],
    });

    await addSuggestion(outputDir, {
      field: "canon.logline",
      value: "Accepted value",
      confidence: 0.9,
      provider: "mock",
      model: "mock-llm",
      generatedAt: new Date().toISOString(),
      status: "pending",
      tokenUsage: { prompt: 1, completion: 2 },
    });

    const updated = await acceptSuggestion(outputDir, "canon.logline", canon);
    expect(updated.canon.logline.value).toBe("Accepted value");
    expect(updated.canon.logline.owner).toBe("agent");
  });

  test("acceptSuggestion coerces string-array fields instead of corrupting canon shape", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-accept-themes");
    await fs.ensureDir(path.join(outputDir, "00_admin"));
    await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), {
      projectId: canon.id,
      generatedAt: new Date().toISOString(),
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      generatedFiles: [],
      requiredFiles: [],
      departments: [],
      hydrationLog: [],
    });

    await addSuggestion(outputDir, {
      field: "canon.themes",
      value: [
        "Themes:",
        "- institutional decay",
        "- corrosive ambition",
        "- survival at any cost",
      ].join("\n"),
      confidence: 0.9,
      provider: "mock",
      model: "mock-llm",
      generatedAt: new Date().toISOString(),
      status: "pending",
      tokenUsage: { prompt: 1, completion: 2 },
    });

    const updated = await acceptSuggestion(outputDir, "canon.themes", canon);
    expect(updated.canon.themes.value).toEqual([
      "institutional decay",
      "corrosive ambition",
      "survival at any cost",
    ]);
  });

  test("acceptSuggestion rejects invalid structured-array suggestions instead of corrupting canon", async () => {
    const canon = await loadCanon(fixturePath("examples/sample-tv/canon.yaml"));
    const outputDir = await createTempOutputDir("hydrate-accept-episodes-invalid");
    await fs.ensureDir(path.join(outputDir, "00_admin"));
    await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), {
      projectId: canon.id,
      generatedAt: new Date().toISOString(),
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      generatedFiles: [],
      requiredFiles: [],
      departments: [],
      hydrationLog: [],
    });

    await addSuggestion(outputDir, {
      field: "canon.episodes",
      value: "Logline: this is not a structured episode array",
      confidence: 0.9,
      provider: "mock",
      model: "mock-llm",
      generatedAt: new Date().toISOString(),
      status: "pending",
      tokenUsage: { prompt: 1, completion: 2 },
    });

    await expect(acceptSuggestion(outputDir, "canon.episodes", canon)).rejects.toThrow(/structured array/);
  });

  test("rejectSuggestion removes suggestion from sidecar", async () => {
    const outputDir = await createTempOutputDir("hydrate-reject");
    await fs.ensureDir(path.join(outputDir, "00_admin"));
    await fs.writeJson(path.join(outputDir, "00_admin/package_manifest.json"), {
      projectId: "p",
      generatedAt: new Date().toISOString(),
      mediaType: "tv_series",
      packageTier: "full",
      generatedFiles: [],
      requiredFiles: [],
      departments: [],
      hydrationLog: [],
    });

    await addSuggestion(outputDir, {
      field: "canon.logline",
      value: "Rejected value",
      confidence: 0.5,
      provider: "mock",
      model: "mock-llm",
      generatedAt: new Date().toISOString(),
      status: "pending",
      tokenUsage: { prompt: 1, completion: 2 },
    });

    await rejectSuggestion(outputDir, "canon.logline");
    await expect(loadSuggestions(outputDir)).resolves.toEqual([]);
  });
});
