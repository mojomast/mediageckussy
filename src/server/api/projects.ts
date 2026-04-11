import path from "node:path";
import fs from "fs-extra";
import { c as tarCreate } from "tar";
import type { Express, Response } from "express";
import { generatePackage } from "../../core/generator.js";
import { readManifest } from "../../core/manifest.js";
import { generateAsset } from "../../ai/assetGenerator.js";
import { planArtifactRequest } from "../../ai/artifactPlanner.js";
import { hydrateDocument } from "../../ai/hydrators/docHydrator.js";
import { hydrateField } from "../../ai/hydrators/fieldHydrator.js";
import { hydratePackage } from "../../ai/hydrators/bulkHydrator.js";
import { buildCanonFromAnswers } from "../../ai/interview/canonBuilder.js";
import { getNextQuestion } from "../../ai/interview/questions.js";
import { runInterviewTurn } from "../../ai/interview/runner.js";
import { createSession } from "../../ai/interview/state.js";
import { resolveImageProvider } from "../../ai/image/index.js";
import { resolveProvider } from "../../ai/providers/index.js";
import { applyProposals, buildNextDirective, runIterationStep, shouldPauseForHITL } from "../../ai/iteration/runner.js";
import { createIterationSession, listIterationSessions, loadIterationSession, saveIterationSession } from "../../ai/iteration/session.js";
import type { IterationDirective, IterationMode, IterationProposal, IterationRun, IterationSession } from "../../ai/iteration/types.js";
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
  app.post("/api/interview/start", async (req, res) => {
    try {
      const state = createSession();
      state.provider = req.body?.provider ?? process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? "openrouter";
      state.model = req.body?.model;
      const firstQuestion = getNextQuestion(state);
      if (!firstQuestion) {
        throw new Error("Interview question list is empty");
      }
      state.messages.push({ role: "interviewer", content: firstQuestion.prompt, timestamp: new Date().toISOString() });
      state.questionIndex = firstQuestion.index;
      await saveInterviewState(state);
      return ok(res, {
        sessionId: state.sessionId,
        message: firstQuestion.prompt,
        phase: state.phase,
        questionIndex: firstQuestion.index,
        totalQuestions: 15,
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/interview/turn", async (req, res) => {
    try {
      const sessionId = String(req.body?.sessionId ?? "");
      const message = String(req.body?.message ?? "");
      if (!sessionId || !message) {
        return fail(res, new Error("sessionId and message are required"), 400);
      }

      const state = await loadInterviewState(sessionId);
      const provider = resolveProvider(state.provider ?? process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? "openrouter", { model: state.model });
      const result = await runInterviewTurn(state, message, provider);
      await saveInterviewState(result.updatedState);
      return ok(res, {
        message: result.response,
        phase: result.updatedState.phase,
        questionIndex: result.updatedState.questionIndex,
        complete: result.complete,
      });
    } catch (error) {
      if (error instanceof Error && /Interview session not found/.test(error.message)) {
        return fail(res, error, 404);
      }
      return fail(res, error);
    }
  });

  app.post("/api/interview/complete", async (req, res) => streamJob(res, async (send) => {
    const sessionId = String(req.body?.sessionId ?? "");
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    const state = await loadInterviewState(sessionId);
    send("started", { step: "build-canon" });
    const canon = buildCanonFromAnswers(state);

    const project = await createHostedProject({
      title: req.body?.title ?? canon.canon.title.value,
      mediaType: canon.canon.format.value,
      packageTier: canon.package_tier,
      canonYaml: JSON.stringify(canon, null, 2),
      provider: state.provider,
      model: state.model,
    });

    state.slug = project.slug;
    state.updatedAt = new Date().toISOString();
    send("progress", { step: "create-project", slug: project.slug });
    const outputDir = projectDir(project.slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");

    send("progress", { step: "generate", message: "Generating package..." });
    const generated = await generatePackage({ canonPath, outputDir, mediaType: canon.canon.format.value });

    send("progress", { step: "hydrate", message: "Hydrating with AI..." });
    const provider = resolveProvider(state.provider ?? process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? "openrouter", { model: state.model });
    await hydratePackage(canonPath, outputDir, provider, { minConfidence: 0.7 });

    const finalSuggestions = await loadSuggestions(outputDir);
    await fs.writeJson(path.join(outputDir, "interview_state.json"), state, { spaces: 2 });
    await fs.remove(interviewDir(sessionId));

    send("done", {
      slug: project.slug,
      suggestionCount: finalSuggestions.filter((item) => item.status === "pending").length,
      completenessScore: generated.validation.completenessScore,
    });
  }));

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

  app.post("/api/projects/:slug/iterations", async (req, res) => streamJob(res, async (send) => {
    const mode = req.body?.mode as IterationMode | undefined;
    const maxRuns = Number(req.body?.maxRuns ?? 0);
    const firstDirective = req.body?.firstDirective as IterationDirective | undefined;
    if (!mode || !["autonomous", "gated", "confidence"].includes(mode)) {
      throw new Error("mode must be one of: autonomous, gated, confidence");
    }
    if (!Number.isInteger(maxRuns) || maxRuns < 1 || maxRuns > 50) {
      throw new Error("maxRuns must be an integer between 1 and 50");
    }
    if (!firstDirective?.type || !firstDirective?.instruction) {
      throw new Error("firstDirective.type and firstDirective.instruction are required");
    }

    const slug = req.params.slug;
    const outputDir = projectDir(slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
    let canon = await loadCanon(canonPath);
    const project = await readHostedProject(slug);
    const provider = resolveProvider(req.body?.provider ?? project.settings.llmProvider, {
      model: req.body?.model ?? project.settings.llmModel,
    });
    const session = createIterationSession({
      projectSlug: slug,
      mode,
      maxRuns,
      confidenceThreshold: Number(req.body?.confidenceThreshold ?? 0.75),
      provider: req.body?.provider ?? project.settings.llmProvider,
      model: req.body?.model ?? project.settings.llmModel,
    });

    await saveIterationSession(slug, session);

    const result = await runIterationLoop({
      slug,
      session,
      canon,
      provider,
      currentDirective: firstDirective,
      send,
    });

    canon = result.canon;
    if (result.completed) {
      send("loop_complete", {
        sessionId: session.sessionId,
        totalRuns: session.completedRuns,
        acceptedProposals: countAcceptedProposals(session),
      });
    }
  }));

  app.get("/api/projects/:slug/iterations", async (req, res) => {
    try {
      return ok(res, await listIterationSessions(req.params.slug));
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/iterations/:sessionId", async (req, res) => {
    try {
      const session = await loadIterationSession(req.params.slug, req.params.sessionId);
      if (!session) {
        return fail(res, new Error(`Iteration session not found: ${req.params.sessionId}`), 404);
      }
      return ok(res, session);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.get("/api/projects/:slug/iterations/:sessionId/runs/:runId", async (req, res) => {
    try {
      const session = await loadIterationSession(req.params.slug, req.params.sessionId);
      if (!session) {
        return fail(res, new Error(`Iteration session not found: ${req.params.sessionId}`), 404);
      }
      const run = session.runs.find((entry) => entry.runId === req.params.runId);
      if (!run) {
        return fail(res, new Error(`Iteration run not found: ${req.params.runId}`), 404);
      }
      return ok(res, run);
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/iterations/:sessionId/continue", async (req, res) => streamJob(res, async (send) => {
    const slug = req.params.slug;
    const session = await loadIterationSession(slug, req.params.sessionId);
    if (!session || session.status !== "paused") {
      res.status(404);
      throw new Error(`Paused iteration session not found: ${req.params.sessionId}`);
    }

    const lastRun = session.runs.at(-1);
    if (!lastRun) {
      throw new Error("Paused session has no runs to continue from");
    }

    const outputDir = projectDir(slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
    let canon = await loadCanon(canonPath);
    const accepted = Array.isArray(req.body?.accepted) ? req.body.accepted.map(String) : [];
    canon = await applyProposals(session, lastRun, canon, accepted);
    updateRunStatus(lastRun);
    await saveCanon(canonPath, canon);

    session.status = "running";
    session.pendingSteeringNote = typeof req.body?.steeringNote === "string" && req.body.steeringNote.trim()
      ? req.body.steeringNote.trim()
      : undefined;
    await saveIterationSession(slug, session);

    const overrideDirective = normalizeDirective(req.body?.nextDirective);
    const currentDirective = overrideDirective
      ? {
          ...overrideDirective,
          steeringNote: session.pendingSteeringNote,
        }
      : buildNextDirective(session, lastRun, session.pendingSteeringNote);
    session.pendingSteeringNote = undefined;

    if (!currentDirective) {
      session.status = "complete";
      await saveIterationSession(slug, session);
      send("loop_complete", {
        sessionId: session.sessionId,
        totalRuns: session.completedRuns,
        acceptedProposals: countAcceptedProposals(session),
      });
      return;
    }

    const project = await readHostedProject(slug);
    const provider = resolveProvider(session.provider ?? project.settings.llmProvider, {
      model: session.model ?? project.settings.llmModel,
    });

    const result = await runIterationLoop({
      slug,
      session,
      canon,
      provider,
      currentDirective,
      send,
    });

    if (result.completed) {
      send("loop_complete", {
        sessionId: session.sessionId,
        totalRuns: session.completedRuns,
        acceptedProposals: countAcceptedProposals(session),
      });
    }
  }));

  app.post("/api/projects/:slug/iterations/:sessionId/stop", async (req, res) => {
    try {
      const session = await loadIterationSession(req.params.slug, req.params.sessionId);
      if (!session) {
        return fail(res, new Error(`Iteration session not found: ${req.params.sessionId}`), 404);
      }
      session.status = "stopped";
      await saveIterationSession(req.params.slug, session);
      return ok(res, {
        sessionId: session.sessionId,
        completedRuns: session.completedRuns,
        status: "stopped",
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/iterations/:sessionId/steer", async (req, res) => {
    try {
      const session = await loadIterationSession(req.params.slug, req.params.sessionId);
      if (!session) {
        return fail(res, new Error(`Iteration session not found: ${req.params.sessionId}`), 404);
      }

      const steeringNote = typeof req.body?.steeringNote === "string" ? req.body.steeringNote.trim() : "";
      session.pendingSteeringNote = steeringNote || undefined;
      await saveIterationSession(req.params.slug, session);
      return ok(res, {
        sessionId: session.sessionId,
        pendingSteeringNote: session.pendingSteeringNote,
      });
    } catch (error) {
      return fail(res, error);
    }
  });

  app.post("/api/projects/:slug/iterations/:sessionId/runs/:runId/accept-all", async (req, res) => streamJob(res, async (send) => {
    const slug = req.params.slug;
    const session = await loadIterationSession(slug, req.params.sessionId);
    if (!session) {
      res.status(404);
      throw new Error(`Iteration session not found: ${req.params.sessionId}`);
    }

    const run = session.runs.find((entry) => entry.runId === req.params.runId);
    if (!run) {
      res.status(404);
      throw new Error(`Iteration run not found: ${req.params.runId}`);
    }

    const minConfidence = Number(req.body?.minConfidence ?? 0);
    const accepted = run.proposals
      .filter((proposal) => proposal.status === "pending" && proposal.confidence >= minConfidence)
      .map((proposal) => proposal.proposalId);
    const outputDir = projectDir(slug);
    const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");
    const canon = await loadCanon(canonPath);
    const updatedCanon = await applyProposals(session, run, canon, accepted);
    updateRunStatus(run);
    await saveCanon(canonPath, updatedCanon);
    await saveIterationSession(slug, session);

    send("started", { step: "generate" });
    const result = await generatePackage({ canonPath, outputDir });
    send("done", { manifest: result.manifest, validation: result.validation });
  }));

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
      send("progress", { step: "context", message: "Collecting canon context bundle...", progress: 15 });
      send("progress", { step: "iterate", message: `Running ${Math.max(1, Math.min(Number(req.body?.iterations ?? 1), 5))} hydration pass(es)...`, progress: 45 });
      send("done", await hydratePackage(canonPath, outputDir, provider, req.body ?? {}));
      return;
    }
    if (req.body?.field) {
      send("progress", { step: "context", message: `Grounding ${req.body.field} against canon context...`, progress: 20 });
      send("progress", { step: "iterate", message: `Refining ${req.body.field} across ${Math.max(1, Math.min(Number(req.body?.iterations ?? 1), 5))} pass(es)...`, progress: 55 });
      send("done", await hydrateField(canon, req.body.field, outputDir, provider, req.body ?? {}));
      return;
    }
    if (req.body?.file) {
      send("progress", { step: "context", message: `Reading canon and file context for ${req.body.file}...`, progress: 20 });
      send("progress", { step: "iterate", message: `Refining ${req.body.file} across ${Math.max(1, Math.min(Number(req.body?.iterations ?? 1), 5))} pass(es)...`, progress: 55 });
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
    const project = await readHostedProject(req.params.slug);
    const provider = resolveImageProvider(req.body?.provider);
    send("started", { step: "asset" });
    let assetRequest = req.body ?? {};
    if (typeof req.body?.request === "string" && req.body.request.trim()) {
      send("progress", { step: "plan", message: "Planning requested artifact from canon...", progress: 20 });
      const llmProvider = resolveProvider(req.body?.llmProvider ?? project.settings.llmProvider, {
        model: req.body?.llmModel ?? project.settings.llmModel,
      });
      const plan = await planArtifactRequest(canon, llmProvider, req.body.request);
      assetRequest = {
        ...req.body,
        type: plan.assetType,
        promptOverride: plan.promptOverride,
        characterId: plan.characterId,
      };
      send("progress", { step: "plan", message: plan.rationale, progress: 45 });
    }
    send("progress", { step: "render", message: `Generating ${assetRequest.type}...`, progress: 75 });
    send("done", await generateAsset(canon, outputDir, assetRequest.type, provider, assetRequest));
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

function interviewDir(sessionId: string) {
  return path.join(projectWorkspace("_interviews"), sessionId);
}

async function saveInterviewState(state: Awaited<ReturnType<typeof loadInterviewState>> | ReturnType<typeof createSession>) {
  const dir = interviewDir(state.sessionId);
  await fs.ensureDir(dir);
  await fs.writeJson(path.join(dir, "state.json"), state, { spaces: 2 });
}

async function loadInterviewState(sessionId: string) {
  const statePath = path.join(interviewDir(sessionId), "state.json");
  if (!(await fs.pathExists(statePath))) {
    throw new Error(`Interview session not found: ${sessionId}`);
  }
  return fs.readJson(statePath) as Promise<ReturnType<typeof createSession>>;
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
    const suggestions = await loadSuggestions(outputDir);
    return {
      slug: entry.slug,
      title: entry.title,
      mediaType: manifest.mediaType,
      packageTier: manifest.packageTier,
      validation,
      pendingSuggestionCount: suggestions.filter((item) => item.status === "pending").length,
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

async function runIterationLoop(input: {
  slug: string;
  session: IterationSession;
  canon: Awaited<ReturnType<typeof loadCanon>>;
  provider: ReturnType<typeof resolveProvider>;
  currentDirective: IterationDirective;
  send: (event: string, payload: unknown) => void;
}) {
  const { slug, session, provider, send } = input;
  let canon = input.canon;
  let currentDirective: IterationDirective | null = input.currentDirective;
  const outputDir = projectDir(slug);
  const canonPath = path.join(outputDir, "00_admin/canon_lock.yaml");

  while (currentDirective && session.completedRuns < session.maxRuns) {
    const persistedSession = await loadIterationSession(slug, session.sessionId);
    if (persistedSession?.status === "stopped") {
      session.status = "stopped";
      await saveIterationSession(slug, session);
      return { canon, completed: false };
    }

    send("run_start", {
      sessionId: session.sessionId,
      runNumber: session.completedRuns + 1,
      directive: currentDirective,
    });

    const run = await runIterationStep(session, currentDirective, canon, provider);
    session.runs.push(run);
    session.completedRuns += 1;

    const pause = shouldPauseForHITL(session, run);
    if (pause) {
      run.status = run.status === "error" ? "error" : "awaiting_review";
      session.status = run.status === "error" ? "error" : "paused";
      await saveIterationSession(slug, session);
      send("run_complete", {
        sessionId: session.sessionId,
        runId: run.runId,
        runNumber: run.runNumber,
        summary: run.summary,
        confidence: run.confidence,
        proposalCount: run.proposals.length,
        status: run.status,
      });
      send("hitl_pause", {
        sessionId: session.sessionId,
        runId: run.runId,
        reason: pauseReason(session, run),
        proposals: run.proposals,
      });
      return { canon, completed: false };
    }

    const accepted = run.proposals
      .filter((proposal) => proposal.confidence >= 0.75)
      .map((proposal) => proposal.proposalId);
    canon = await applyProposals(session, run, canon, accepted);
    updateRunStatus(run);
    await saveCanon(canonPath, canon);
    session.status = "running";
    await saveIterationSession(slug, session);
    send("run_complete", {
      sessionId: session.sessionId,
      runId: run.runId,
      runNumber: run.runNumber,
      summary: run.summary,
      confidence: run.confidence,
      proposalCount: run.proposals.length,
      status: run.status,
    });

    const refreshedSession = await loadIterationSession(slug, session.sessionId);
    if (refreshedSession?.status === "stopped") {
      session.status = "stopped";
      await saveIterationSession(slug, session);
      return { canon, completed: false };
    }

    session.pendingSteeringNote = refreshedSession?.pendingSteeringNote;
    currentDirective = buildNextDirective(session, run, session.pendingSteeringNote);
    session.pendingSteeringNote = undefined;
  }

  session.status = "complete";
  await saveIterationSession(slug, session);
  return { canon, completed: true };
}

function countAcceptedProposals(session: IterationSession) {
  return session.runs.reduce((count, run) => count + run.proposals.filter((proposal) => proposal.status === "accepted").length, 0);
}

function pauseReason(session: IterationSession, run: IterationRun): "gated" | "confidence" | "error" {
  if (run.status === "error") {
    return "error";
  }
  if (session.mode === "gated") {
    return "gated";
  }
  return "confidence";
}

function updateRunStatus(run: IterationRun) {
  const accepted = run.proposals.filter((proposal) => proposal.status === "accepted").length;
  if (run.status === "error") {
    return;
  }
  if (accepted === 0) {
    run.status = "rejected";
    return;
  }
  run.status = accepted === run.proposals.length ? "accepted" : "partial";
}

function normalizeDirective(value: unknown): IterationDirective | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.type !== "string" || typeof candidate.instruction !== "string") {
    return undefined;
  }
  return {
    type: candidate.type as IterationDirective["type"],
    instruction: candidate.instruction,
    targetId: typeof candidate.targetId === "string" ? candidate.targetId : undefined,
    constraints: Array.isArray(candidate.constraints) ? candidate.constraints.map(String) : undefined,
    steeringNote: typeof candidate.steeringNote === "string" ? candidate.steeringNote : undefined,
  };
}
