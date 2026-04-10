import path from "node:path";
import fs from "fs-extra";
import { c as tarCreate } from "tar";
import type { Express, Response } from "express";
import { generatePackage } from "../../core/generator.js";
import { readManifest } from "../../core/manifest.js";
import { generateAsset } from "../../ai/assetGenerator.js";
import { hydrateDocument } from "../../ai/hydrators/docHydrator.js";
import { hydrateField } from "../../ai/hydrators/fieldHydrator.js";
import { hydratePackage } from "../../ai/hydrators/bulkHydrator.js";
import { resolveImageProvider } from "../../ai/image/index.js";
import { resolveProvider } from "../../ai/providers/index.js";
import { acceptSuggestion, loadSuggestions, rejectSuggestion } from "../../ai/suggestions.js";
import { loadCanon, saveCanon, diffLockedFields } from "../../utils/canon.js";
import { analyzeProtectedRegions, reapplyProtectedRegions } from "../../utils/protectedRegions.js";
import {
  archiveRoot,
  availableDemoProviders,
  availableStableFormats,
  createHostedProject,
  projectWorkspace,
  readHostedProject,
  resolveProjectPath,
  listHostedProjects,
  updateHostedProjectSettings,
} from "../workspace.js";

export function registerProjectRoutes(app: Express) {
  app.get("/api/studio/options", (_req, res) => ok(res, {
    providers: availableDemoProviders(),
    formats: availableStableFormats(),
    packageTiers: ["light", "standard", "full"],
  }));

  app.get("/api/projects", async (_req, res) => {
    try {
      return ok(res, await listProjects());
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug", async (req, res) => {
    try {
      const outputDir = projectDir(req.params.slug);
      const meta = await readHostedProject(req.params.slug);
      return ok(res, {
        meta,
        manifest: await readManifest(outputDir),
        validation: await fs.readJson(path.join(outputDir, "16_ops/validation_report.json")),
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects", async (req, res) => {
    const { title, mediaType, packageTier, canonYaml, provider, model } = req.body as {
      title?: string;
      mediaType?: string;
      packageTier?: "light" | "standard" | "full";
      canonYaml?: string;
      provider?: string;
      model?: string;
    };
    if (!title || !mediaType || !packageTier) {
      return fail(res, new Error("title, mediaType, and packageTier are required"), 400);
    }

    const project = await createHostedProject({ title, mediaType, packageTier, canonYaml, provider, model });
    const outputDir = projectDir(project.slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");

    return streamJob(res, async (send) => {
      send("started", { step: "create-project", slug: project.slug });
      const result = await generatePackage({ canonPath, outputDir });
      send("done", { slug: project.slug, manifest: result.manifest, validation: result.validation, project });
    });
  });

  app.put("/api/projects/:slug/settings", async (req, res) => {
    try {
      return ok(res, await updateHostedProjectSettings(req.params.slug, {
        llmProvider: req.body?.llmProvider,
        llmModel: req.body?.llmModel,
      }));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/canon", async (req, res) => {
    try {
      return ok(res, await loadCanon(path.join(projectDir(req.params.slug), "00_admin/canon_lock.yaml")));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.put("/api/projects/:slug/canon", async (req, res) => {
    try {
      const canonPath = path.join(projectDir(req.params.slug), "00_admin/canon_lock.yaml");
      const previous = await loadCanon(canonPath);
      const next = req.body;
      const changedLocked = diffLockedFields(previous, next);
      if (changedLocked.length > 0) {
        return fail(res, new Error(`Locked fields cannot be modified: ${changedLocked.join(", ")}`), 400);
      }
      await saveCanon(canonPath, next);
      return ok(res, next);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/generate", async (req, res) => streamJob(res, async (send) => {
    const canonPath = path.join(projectDir(req.params.slug), "00_admin/canon_lock.yaml");
    send("started", { step: "generate" });
    const result = await generatePackage({ canonPath, outputDir: projectDir(req.params.slug), ...(req.body ?? {}) });
    send("done", { manifest: result.manifest, validation: result.validation });
  }));

  app.post("/api/projects/:slug/hydrate", async (req, res) => streamJob(res, async (send) => {
    const outputDir = projectDir(req.params.slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
    const canon = await loadCanon(canonPath);
    const project = await readHostedProject(req.params.slug);
    const provider = resolveProvider(req.body?.provider ?? project.settings.llmProvider, {
      model: req.body?.model ?? project.settings.llmModel,
    });
    send("started", { step: "hydrate" });
    if (req.body?.mode === "bulk") {
      send("done", await hydratePackage(canonPath, outputDir, provider, req.body ?? {}));
      return;
    }
    if (req.body?.field) {
      send("done", await hydrateField(canon, req.body.field, outputDir, provider, req.body ?? {}));
      return;
    }
    if (req.body?.file) {
      send("done", await hydrateDocument(canon, path.join(outputDir, req.body.file), provider, req.body ?? {}));
      return;
    }
    throw new Error("Provide mode, field, or file for hydration");
  }));

  app.get("/api/projects/:slug/suggestions", async (req, res) => {
    try {
      return ok(res, await loadSuggestions(projectDir(req.params.slug)));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/suggestions/accept", async (req, res) => {
    try {
      const field = String(req.body?.field ?? "");
      if (!field) {
        return fail(res, new Error("field is required"), 400);
      }
      const canonPath = path.join(projectDir(req.params.slug), "00_admin/canon_lock.yaml");
      const canon = await loadCanon(canonPath);
      const updated = await acceptSuggestion(projectDir(req.params.slug), field, canon);
      return ok(res, updated);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/suggestions/reject", async (req, res) => {
    try {
      const field = String(req.body?.field ?? "");
      if (!field) {
        return fail(res, new Error("field is required"), 400);
      }
      await rejectSuggestion(projectDir(req.params.slug), field);
      return ok(res, { rejected: field });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/files", async (req, res) => {
    try {
      return ok(res, await readFileTree(projectDir(req.params.slug)));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/files\/(.+)$/, async (req, res) => {
    try {
      const slug = req.params[0];
      const relativePath = req.params[1];
      const absolutePath = resolveProjectPath(slug, relativePath);
      return ok(res, { path: relativePath, content: await fs.readFile(absolutePath, "utf8") });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.put(/^\/api\/projects\/([^/]+)\/files\/(.+)$/, async (req, res) => {
    try {
      const slug = req.params[0];
      const relativePath = req.params[1];
      const absolutePath = resolveProjectPath(slug, relativePath);
      const nextContent = String(req.body?.content ?? "");
      let contentToWrite = nextContent;
      if (await fs.pathExists(absolutePath)) {
        const existing = await fs.readFile(absolutePath, "utf8");
        contentToWrite = reapplyProtectedRegions(nextContent, analyzeProtectedRegions(existing).regions);
      }
      await fs.writeFile(absolutePath, contentToWrite, "utf8");
      return ok(res, { path: relativePath });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/validation", async (req, res) => {
    try {
      return ok(res, await fs.readJson(path.join(projectDir(req.params.slug), "16_ops/validation_report.json")));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/assets", async (req, res) => {
    try {
      const manifest = await readManifest(projectDir(req.params.slug));
      return ok(res, manifest.generatedAssets ?? []);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/archive", async (req, res) => {
    try {
      const workspace = projectDir(req.params.slug);
      const archiveDir = archiveRoot;
      await fs.ensureDir(archiveDir);
      const archivePath = path.join(archiveDir, `${req.params.slug}.tar.gz`);
      await tarCreate({ gzip: true, cwd: workspace, file: archivePath, filter: (entryPath: string) => !entryPath.startsWith(".exports") }, ["."]);
      if (!(await fs.pathExists(archivePath))) {
        throw new Error("Archive was not created");
      }
      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", `attachment; filename="${req.params.slug}.tar.gz"`);
      return fs.createReadStream(archivePath).pipe(res);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/assets/generate", async (req, res) => streamJob(res, async (send) => {
    const outputDir = projectDir(req.params.slug);
    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    const provider = resolveImageProvider(req.body?.provider);
    send("started", { step: "asset" });
    send("done", await generateAsset(canon, outputDir, req.body.type, provider, req.body ?? {}));
  }));

  app.get(/^\/api\/projects\/([^/]+)\/assets-file\/(.+)$/, async (req, res) => {
    try {
      const slug = req.params[0];
      const relativePath = req.params[1];
      return res.sendFile(resolveProjectPath(slug, relativePath));
    } catch (error) {
      return fail(res, error, 404);
    }
  });

  app.get(/^\/api\/projects\/([^/]+)\/site\/(.+)$/, async (req, res) => {
    try {
      const slug = req.params[0];
      const relativePath = path.join("site", req.params[1]);
      return res.sendFile(resolveProjectPath(slug, relativePath));
    } catch (error) {
      return fail(res, error, 404);
    }
  });

}

async function listProjects() {
  const hosted = await listHostedProjects();
  const projects = await Promise.all(hosted.map(async (entry) => {
    const outputDir = path.join(projectWorkspace(entry.slug));
    const manifestPath = path.join(outputDir, "00_admin/package_manifest.json");
    const validationPath = path.join(outputDir, "16_ops/validation_report.json");
    if (!(await fs.pathExists(manifestPath)) || !(await fs.pathExists(validationPath))) {
      return undefined;
    }
    const manifest = await fs.readJson(manifestPath);
    const validation = await fs.readJson(validationPath);
    return {
      slug: entry.slug,
      title: entry.title,
      mediaType: manifest.mediaType,
      packageTier: manifest.packageTier,
      validation,
      generatedAt: manifest.generatedAt,
      settings: entry.settings,
    };
  }));
  return projects.filter(Boolean);
}

function projectDir(slug: string) {
  return projectWorkspace(slug);
}

async function readFileTree(rootDir: string, baseDir: string = rootDir): Promise<Array<{ path: string; type: "file" | "directory" }>> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const result = await Promise.all(entries.map(async (entry) => {
    const absolute = path.join(rootDir, entry.name);
    const relative = path.relative(baseDir, absolute);
    if (entry.isDirectory()) {
      const children = await readFileTree(absolute, baseDir);
      return [{ path: relative, type: "directory" as const }, ...children];
    }
    return [{ path: relative, type: "file" as const }];
  }));
  return result.flat();
}

function ok(res: Response, data: unknown) {
  return res.json({ ok: true, data });
}

function fail(res: Response, error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(status).json({ ok: false, error: message });
}

async function streamJob(res: Response, run: (send: (event: string, payload: unknown) => void) => Promise<void>) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await run(send);
  } catch (error) {
    send("error", { message: error instanceof Error ? error.message : String(error) });
  } finally {
    res.end();
  }
}
