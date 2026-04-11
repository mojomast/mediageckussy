import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { projectWorkspace } from "../../server/workspace.js";
import type { IterationMode, IterationPlannerConfig, IterationSession } from "./types.js";

export function createIterationSession(opts: {
  projectSlug: string;
  mode: IterationMode;
  maxRuns: number;
  confidenceThreshold?: number;
  planner?: Partial<IterationPlannerConfig>;
  provider?: string;
  model?: string;
}): IterationSession {
  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();
  return {
    sessionId,
    projectSlug: opts.projectSlug,
    mode: opts.mode,
    maxRuns: opts.maxRuns,
    confidenceThreshold: opts.confidenceThreshold ?? 0.75,
    planner: {
      strategy: opts.planner?.strategy ?? "coverage",
      avoidRecentWindow: Math.max(1, opts.planner?.avoidRecentWindow ?? 2),
      sectionTargets: opts.planner?.sectionTargets ?? {},
    },
    completedRuns: 0,
    status: "running",
    runs: [],
    startedAt: now,
    updatedAt: now,
    provider: opts.provider,
    model: opts.model,
  };
}

export async function loadIterationSession(
  projectSlug: string,
  sessionId: string,
): Promise<IterationSession | null> {
  const sessionPath = path.join(iterationSessionDir(projectSlug, sessionId), "session.json");
  if (!(await fs.pathExists(sessionPath))) {
    return null;
  }

  const session = await fs.readJson(sessionPath) as IterationSession;
  const runsDir = path.join(iterationSessionDir(projectSlug, sessionId), "runs");
  if (!(await fs.pathExists(runsDir))) {
    return session;
  }

  const runFiles = (await fs.readdir(runsDir)).filter((entry) => entry.endsWith(".json"));
  const runs = await Promise.all(runFiles.map(async (fileName) => fs.readJson(path.join(runsDir, fileName))));
  session.runs = runs.sort((left, right) => left.runNumber - right.runNumber);
  return session;
}

export async function saveIterationSession(
  projectSlug: string,
  session: IterationSession,
): Promise<void> {
  const dir = iterationSessionDir(projectSlug, session.sessionId);
  const runsDir = path.join(dir, "runs");
  session.updatedAt = new Date().toISOString();
  await fs.ensureDir(runsDir);
  await fs.writeJson(path.join(dir, "session.json"), session, { spaces: 2 });
  await Promise.all(session.runs.map((run) => fs.writeJson(path.join(runsDir, `${run.runId}.json`), run, { spaces: 2 })));
}

export async function listIterationSessions(
  projectSlug: string,
): Promise<IterationSession[]> {
  const baseDir = path.join(projectWorkspace(projectSlug), "iterations");
  if (!(await fs.pathExists(baseDir))) {
    return [];
  }

  const entries = await fs.readdir(baseDir, { withFileTypes: true });
  const sessions = await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadIterationSession(projectSlug, entry.name)));
  return sessions
    .filter(Boolean)
    .sort((left, right) => right!.startedAt.localeCompare(left!.startedAt)) as IterationSession[];
}

function iterationSessionDir(projectSlug: string, sessionId: string) {
  return path.join(projectWorkspace(projectSlug), "iterations", sessionId);
}
