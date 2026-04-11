import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import type { CanonProject, GeneratedFileRecord } from "../core/types.js";
import { readManifest } from "../core/manifest.js";
import { loadCanon, publicCanonSlice, saveCanon } from "../utils/canon.js";
import { projectWorkspace, resolveProjectPath, workspaceRoot } from "./workspace.js";

export type ExportInclude = "docs" | "site" | "canon" | "assets";
export type ExportVisibility = "public" | "internal" | "all";

export type ProjectExportEntry = {
  path: string;
  kind: ExportInclude;
  visibility: ExportVisibility | "mixed";
  size: number;
  absolutePath?: string;
  content?: string;
  metadata: Record<string, unknown>;
};

export interface CanonSnapshot {
  snapshotId: string;
  projectSlug: string;
  createdAt: string;
  trigger: "iteration_accept" | "manual_edit" | "hydration" | "import";
  runId?: string;
  fieldChanges: Array<{ field: string; before: unknown; after: unknown }>;
  authorKind: "agent" | "user" | "system";
}

type ShareTokenRecord = {
  shareToken: string;
  projectSlug: string;
  createdAt: string;
  include: ExportInclude[];
  visibility: ExportVisibility;
};

export async function buildProjectExport(slug: string, include: ExportInclude[], visibility: ExportVisibility) {
  const outputDir = projectWorkspace(slug);
  const manifest = await readManifest(outputDir);
  const selected = new Set(include);
  const entries: ProjectExportEntry[] = [];

  for (const file of manifest.generatedFiles) {
    const kind = classifyGeneratedFile(file);
    if (!kind || !selected.has(kind) || !matchesVisibility(file.audience, visibility)) {
      continue;
    }

    const absolutePath = resolveProjectPath(slug, file.path);
    if (!(await fs.pathExists(absolutePath))) {
      continue;
    }

    const stats = await fs.stat(absolutePath);
    entries.push({
      path: file.path,
      kind,
      visibility: deriveEntryVisibility(file.audience),
      size: stats.size,
      absolutePath,
      metadata: {
        templateId: file.templateId,
        department: file.department,
        audience: file.audience,
        outputFormat: file.outputFormat,
        sources: file.sources,
        regenPolicy: file.regenPolicy,
        generatedAt: file.generatedAt,
      },
    });
  }

  if (selected.has("assets")) {
    for (const asset of manifest.generatedAssets ?? []) {
      const assetVisibility = matchesVisibility(["internal"], visibility) ? "internal" : null;
      if (!assetVisibility) {
        continue;
      }

      const absolutePath = resolveProjectPath(slug, asset.path);
      if (!(await fs.pathExists(absolutePath))) {
        continue;
      }

      const stats = await fs.stat(absolutePath);
      entries.push({
        path: asset.path,
        kind: "assets",
        visibility: assetVisibility,
        size: stats.size,
        absolutePath,
        metadata: {
          type: asset.type,
          provider: asset.provider,
          model: asset.model,
          generatedAt: asset.generatedAt,
          prompt: asset.prompt,
          canonFingerprint: asset.canonFingerprint,
        },
      });
    }
  }

  if (selected.has("canon")) {
    const canon = await loadCanon(path.join(outputDir, "00_admin/canon_lock.yaml"));
    const canonPayload = visibility === "public" ? publicCanonSlice(canon) : canon;
    const content = JSON.stringify(canonPayload, null, 2);
    entries.push({
      path: "canon.json",
      kind: "canon",
      visibility: visibility === "all" ? "mixed" : visibility,
      size: Buffer.byteLength(content),
      content,
      metadata: {
        source: "00_admin/canon_lock.yaml",
        filtered: visibility === "public",
      },
    });
  }

  entries.sort((left, right) => left.path.localeCompare(right.path));
  return { manifest, entries };
}

export function normalizeExportInclude(value: unknown): ExportInclude[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const allowed = new Set<ExportInclude>(["docs", "site", "canon", "assets"]);
  return [...new Set(value.map(String).filter((item): item is ExportInclude => allowed.has(item as ExportInclude)))];
}

export function normalizeExportVisibility(value: unknown): ExportVisibility {
  return value === "public" || value === "internal" || value === "all" ? value : "all";
}

export async function appendCanonSnapshot(input: {
  projectSlug: string;
  trigger: CanonSnapshot["trigger"];
  before: unknown;
  after: unknown;
  authorKind: CanonSnapshot["authorKind"];
  runId?: string;
}) {
  const fieldChanges = diffFields(input.before, input.after);
  if (fieldChanges.length === 0) {
    return null;
  }

  const snapshot: CanonSnapshot = {
    snapshotId: crypto.randomUUID(),
    projectSlug: input.projectSlug,
    createdAt: new Date().toISOString(),
    trigger: input.trigger,
    runId: input.runId,
    fieldChanges,
    authorKind: input.authorKind,
  };

  const historyFile = canonHistoryPath(input.projectSlug);
  await fs.ensureDir(path.dirname(historyFile));
  const existing = await listCanonSnapshots(input.projectSlug);
  const nextSnapshots = [...existing, snapshot].slice(-50);
  await fs.writeFile(historyFile, `${nextSnapshots.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  return snapshot;
}

export async function listCanonSnapshots(projectSlug: string) {
  const historyFile = canonHistoryPath(projectSlug);
  if (!(await fs.pathExists(historyFile))) {
    return [] as CanonSnapshot[];
  }
  const raw = await fs.readFile(historyFile, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as CanonSnapshot)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function revertCanonSnapshot(projectSlug: string, snapshotId: string) {
  const snapshots = await listCanonSnapshots(projectSlug);
  const target = snapshots.find((entry) => entry.snapshotId === snapshotId);
  if (!target) {
    throw new Error(`Snapshot not found: ${snapshotId}`);
  }

  const canonPath = path.join(projectWorkspace(projectSlug), "00_admin/canon_lock.yaml");
  const canon = await loadCanon(canonPath);
  const reverted = structuredClone(canon) as unknown as Record<string, unknown>;
  for (const change of target.fieldChanges) {
    setAtPath(reverted, change.field, change.before);
  }
  await saveCanon(canonPath, reverted as unknown as CanonProject);
  await appendCanonSnapshot({
    projectSlug,
    trigger: "manual_edit",
    before: canon,
    after: reverted,
    authorKind: "user",
  });
  return reverted;
}

export async function createShareToken(projectSlug: string, include: ExportInclude[], visibility: ExportVisibility) {
  const record: ShareTokenRecord = {
    shareToken: crypto.randomBytes(16).toString("hex"),
    projectSlug,
    createdAt: new Date().toISOString(),
    include,
    visibility,
  };
  const tokens = await listShareTokens();
  const next = [...tokens.filter((entry) => !(entry.projectSlug === projectSlug && entry.visibility === visibility)), record];
  await fs.ensureDir(workspaceRoot);
  await fs.writeJson(shareTokenPath(), next, { spaces: 2 });
  return record;
}

export async function readShareToken(shareToken: string) {
  const tokens = await listShareTokens();
  return tokens.find((entry) => entry.shareToken === shareToken) ?? null;
}

function shareTokenPath() {
  return path.join(workspaceRoot, "share-tokens.json");
}

async function listShareTokens() {
  const filePath = shareTokenPath();
  if (!(await fs.pathExists(filePath))) {
    return [] as ShareTokenRecord[];
  }
  return fs.readJson(filePath) as Promise<ShareTokenRecord[]>;
}

function canonHistoryPath(projectSlug: string) {
  return path.join(projectWorkspace(projectSlug), "00_admin/canon-history.jsonl");
}

function classifyGeneratedFile(file: GeneratedFileRecord): ExportInclude | null {
  if (file.path === "00_admin/canon_lock.yaml" || file.path === "00_admin/package_manifest.json") {
    return null;
  }
  if (file.path.startsWith("site/")) {
    return "site";
  }
  if (file.department === "assets" || file.path.startsWith("assets/")) {
    return "assets";
  }
  return "docs";
}

function deriveEntryVisibility(audience: string[]): ExportVisibility | "mixed" {
  const hasPublic = audience.includes("public");
  const hasInternal = audience.some((item) => item !== "public");
  if (hasPublic && hasInternal) {
    return "mixed";
  }
  return hasPublic ? "public" : "internal";
}

function matchesVisibility(audience: string[], visibility: ExportVisibility) {
  if (visibility === "all") {
    return true;
  }
  const hasPublic = audience.includes("public");
  return visibility === "public" ? hasPublic : !hasPublic;
}

function diffFields(before: unknown, after: unknown, prefix = ""): Array<{ field: string; before: unknown; after: unknown }> {
  if (JSON.stringify(before) === JSON.stringify(after)) {
    return [];
  }
  if (!isPlainObject(before) || !isPlainObject(after)) {
    return [{ field: prefix || "canon", before, after }];
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const key of keys) {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    changes.push(...diffFields((before as Record<string, unknown>)[key], (after as Record<string, unknown>)[key], nextPrefix));
  }
  return changes;
}

function setAtPath(target: Record<string, unknown>, pathValue: string, nextValue: unknown) {
  const segments = pathValue.split(".");
  let cursor: Record<string, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const current = cursor[segment];
    if (!isPlainObject(current)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments.at(-1) ?? pathValue] = nextValue;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
