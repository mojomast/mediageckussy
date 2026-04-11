import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import YAML from "yaml";
import type { CanonProject } from "../core/types.js";
import { getFormatPack, listFormats } from "../core/formats.js";
import { canonProjectSchema } from "../core/schema.js";
import { loadCanon, saveCanon } from "../utils/canon.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function createCanonField<T>(value: T, options?: {
  status?: "draft" | "approved" | "locked";
  owner?: "user" | "editor" | "agent" | "system" | "producer" | "legal" | "marketing";
  confidence?: number;
  visibility?: "internal" | "public" | "private";
}) {
  return {
    value,
    status: options?.status ?? "draft",
    owner: options?.owner ?? (options?.status === "locked" ? "user" : "editor"),
    updated_at: new Date().toISOString(),
    confidence: options?.confidence ?? (options?.status === "locked" ? 1 : 0.6),
    downstream_dependencies: [] as string[],
    visibility: options?.visibility ?? "public",
  };
}

export const workspaceRoot = path.resolve(moduleDir, "../../output");
export const archivedWorkspaceRoot = path.resolve(moduleDir, "../../output/_archived");
export const archiveRoot = path.resolve(moduleDir, "../../.studio-exports");

export interface HostedProjectSettings {
  llmProvider: string;
  llmModel: string;
}

export interface HostedProjectRecord {
  id: string;
  slug: string;
  title: string;
  mediaType: string;
  packageTier: "light" | "standard" | "full";
  createdAt: string;
  updatedAt: string;
  settings: HostedProjectSettings;
  archived?: boolean;
}

export function defaultHostedSettings(): HostedProjectSettings {
  const llmProvider = process.env.MEDIAGECKUSSY_LLM_PROVIDER ?? "openrouter";
  const llmModel = llmProvider === "openrouter"
    ? process.env.MEDIAGECKUSSY_OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite"
    : llmProvider === "zai"
      ? process.env.MEDIAGECKUSSY_ZAI_MODEL ?? "glm-4.5-flash"
      : "";
  return { llmProvider, llmModel };
}

export async function ensureWorkspaceRoot() {
  await fs.ensureDir(workspaceRoot);
  await fs.ensureDir(archivedWorkspaceRoot);
  await fs.ensureDir(archiveRoot);
}

export async function listHostedProjects(options: { includeArchived?: boolean } = {}) {
  await ensureWorkspaceRoot();
  const [activeProjects, archivedProjects] = await Promise.all([
    listHostedProjectsInRoot(workspaceRoot, false),
    options.includeArchived ? listHostedProjectsInRoot(archivedWorkspaceRoot, true) : Promise.resolve([]),
  ]);
  return [...activeProjects, ...archivedProjects].sort((left, right) => {
    if (Boolean(left.archived) !== Boolean(right.archived)) {
      return Number(Boolean(left.archived)) - Number(Boolean(right.archived));
    }
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}

export async function readHostedProject(slug: string) {
  const metaPath = path.join(projectWorkspace(slug), ".studio-project.json");
  return fs.readJson(metaPath) as Promise<HostedProjectRecord>;
}

export async function writeHostedProject(record: HostedProjectRecord) {
  await fs.ensureDir(projectWorkspace(record.slug));
  const { archived: _archived, ...persisted } = record;
  await fs.writeJson(path.join(projectWorkspace(record.slug), ".studio-project.json"), persisted, { spaces: 2 });
}

export function projectWorkspace(slug: string) {
  return hostedProjectWorkspace(slug);
}

export function archivedProjectWorkspace(slug: string) {
  return hostedProjectWorkspace(slug, true);
}

export function resolveProjectPath(slug: string, relativePath: string) {
  const normalized = path.posix.normalize(relativePath.replace(/\\/g, "/"));
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("Invalid relative path");
  }
  const absolute = path.resolve(projectWorkspace(slug), normalized);
  const root = projectWorkspace(slug);
  if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
    throw new Error("Path escapes project workspace");
  }
  return absolute;
}

export async function createHostedProject(input: {
  title: string;
  mediaType: string;
  packageTier: "light" | "standard" | "full";
  canonYaml?: string;
  provider?: string;
  model?: string;
}) {
  await ensureWorkspaceRoot();
  const slugBase = slugify(input.title);
  const slug = await uniqueSlug(slugBase);
  const now = new Date().toISOString();
  const canon = input.canonYaml
    ? canonProjectSchema.parse(YAML.parse(input.canonYaml)) as CanonProject
    : buildStarterCanon({
        title: input.title,
        slug,
        mediaType: input.mediaType,
        packageTier: input.packageTier,
      });

  canon.id = slug;
  canon.slug = slug;
  canon.package_tier = input.packageTier;
  canon.canon.format.value = input.mediaType;
  canon.canon.title.value = input.title;

  const settings = {
    ...defaultHostedSettings(),
    llmProvider: input.provider ?? defaultHostedSettings().llmProvider,
    llmModel: input.model ?? defaultHostedSettings().llmModel,
  };

  const record: HostedProjectRecord = {
    id: crypto.randomUUID(),
    slug,
    title: input.title,
    mediaType: input.mediaType,
    packageTier: input.packageTier,
    createdAt: now,
    updatedAt: now,
    settings,
  };

  await fs.ensureDir(path.join(projectWorkspace(slug), "00_admin"));
  await fs.writeFile(path.join(projectWorkspace(slug), "00_admin/canon_lock.yaml"), YAML.stringify(canon), "utf8");
  await writeHostedProject(record);

  return record;
}

export async function renameHostedProject(slug: string, title: string) {
  const normalizedTitle = title.trim();
  if (!normalizedTitle) {
    throw new Error("title is required");
  }

  const existing = await locateHostedProject(slug);
  if (existing.archived) {
    throw new Error("Archived projects must be unarchived before renaming");
  }

  const nextSlug = await uniqueSlug(slugify(normalizedTitle), { exclude: [slug] });
  const targetWorkspace = nextSlug === slug ? existing.workspacePath : projectWorkspace(nextSlug);
  if (nextSlug !== slug) {
    await fs.move(existing.workspacePath, targetWorkspace);
  }

  await updateProjectWorkspace(targetWorkspace, { slug: nextSlug, title: normalizedTitle });

  const updated: HostedProjectRecord = {
    ...existing.record,
    slug: nextSlug,
    title: normalizedTitle,
    updatedAt: new Date().toISOString(),
  };
  await writeHostedProject(updated);
  return updated;
}

export async function duplicateHostedProject(slug: string, title?: string) {
  const existing = await locateHostedProject(slug);
  const nextTitle = title?.trim() || `${existing.record.title} Copy`;
  const nextSlug = await uniqueSlug(slugify(nextTitle));
  const targetWorkspace = projectWorkspace(nextSlug);

  await fs.copy(existing.workspacePath, targetWorkspace, { errorOnExist: true });
  await fs.remove(path.join(targetWorkspace, "iterations"));
  await updateProjectWorkspace(targetWorkspace, { slug: nextSlug, title: nextTitle });

  const now = new Date().toISOString();
  const duplicated: HostedProjectRecord = {
    ...existing.record,
    id: crypto.randomUUID(),
    slug: nextSlug,
    title: nextTitle,
    createdAt: now,
    updatedAt: now,
  };
  await writeHostedProject(duplicated);
  return duplicated;
}

export async function archiveHostedProject(slug: string) {
  const existing = await locateHostedProject(slug);
  if (existing.archived) {
    return existing.record;
  }

  const targetWorkspace = archivedProjectWorkspace(slug);
  await fs.move(existing.workspacePath, targetWorkspace);

  const updated: HostedProjectRecord = {
    ...existing.record,
    archived: true,
    updatedAt: new Date().toISOString(),
  };
  await fs.ensureDir(targetWorkspace);
  const { archived: _archived, ...persisted } = updated;
  await fs.writeJson(path.join(targetWorkspace, ".studio-project.json"), persisted, { spaces: 2 });
  return updated;
}

export async function unarchiveHostedProject(slug: string) {
  const existing = await locateHostedProject(slug);
  if (!existing.archived) {
    return existing.record;
  }

  const nextSlug = await uniqueSlug(existing.record.slug, { exclude: [slug] });
  const targetWorkspace = projectWorkspace(nextSlug);
  await fs.move(existing.workspacePath, targetWorkspace);
  await updateProjectWorkspace(targetWorkspace, { slug: nextSlug, title: existing.record.title });

  const updated: HostedProjectRecord = {
    ...existing.record,
    slug: nextSlug,
    archived: false,
    updatedAt: new Date().toISOString(),
  };
  await writeHostedProject(updated);
  return updated;
}

export async function deleteHostedProject(slug: string) {
  const existing = await locateHostedProject(slug);
  await fs.remove(existing.workspacePath);
}

export async function updateHostedProjectSettings(slug: string, settings: Partial<HostedProjectSettings>) {
  const existing = await readHostedProject(slug);
  const next = {
    ...existing,
    updatedAt: new Date().toISOString(),
    settings: {
      ...existing.settings,
      ...settings,
    },
  };
  await writeHostedProject(next);
  return next;
}

export function availableDemoProviders() {
  return [
    {
      id: "openrouter",
      name: "OpenRouter",
      model: process.env.MEDIAGECKUSSY_OPENROUTER_MODEL ?? "google/gemini-2.5-flash-lite",
      available: Boolean(process.env.MEDIAGECKUSSY_OPENROUTER_API_KEY),
    },
    {
      id: "zai",
      name: "Z.AI",
      model: process.env.MEDIAGECKUSSY_ZAI_MODEL ?? "glm-4.5-flash",
      available: Boolean(process.env.MEDIAGECKUSSY_ZAI_API_KEY),
    },
  ];
}

function buildStarterCanon(input: { title: string; slug: string; mediaType: string; packageTier: "light" | "standard" | "full" }): CanonProject {
  const stableMediaType = getFormatPack(input.mediaType).mediaType;

  const project: CanonProject = {
    id: input.slug,
    slug: input.slug,
    package_tier: input.packageTier,
    outputs: {
      website: { enabled: true },
      press_bundle: { enabled: true },
      partner_bundle: { enabled: true },
    },
    canon: {
      title: createCanonField(input.title, { status: "locked", owner: "user", confidence: 1 }),
      logline: createCanonField(`A ${stableMediaType.replace(/_/g, " ")} project about ${input.title}.`),
      format: createCanonField(stableMediaType, { status: "locked", owner: "user", confidence: 1 }),
      genre: createCanonField("genre to be refined"),
      tone: createCanonField(["aspirational", "grounded"]),
      audience: createCanonField(["early demo users"], { visibility: "internal" }),
      comps: createCanonField(["reference comp 1", "reference comp 2"]),
      duration_count: createCanonField(stableMediaType === "feature_film" ? "100 min" : "8 x 30 min"),
      themes: createCanonField(["core theme", "secondary theme"]),
      world_setting: createCanonField("Set the world and context here."),
      production_assumptions: createCanonField(["small team", "iterative draft workflow"], { visibility: "internal" }),
      business_assumptions: createCanonField(["demo-ready package export"], { visibility: "internal" }),
      legal_assumptions: createCanonField(["review before publication"], { visibility: "internal" }),
      publication_flags: createCanonField({ site_enabled: true, partner_bundle_enabled: true, press_bundle_enabled: true }, { status: "approved", owner: "producer", confidence: 0.9, visibility: "internal" }),
      characters: createCanonField([{ id: "lead", name: "Lead", role: "protagonist", description: "Primary character draft.", visibility: "public" }]),
      episodes: createCanonField([{ code: "E01", title: "Pilot", logline: "Opening installment draft.", status: "draft", visibility: "public" }]),
      structure: createCanonField([{ id: "act-1", title: "Opening movement", summary: "Initial structure draft.", visibility: "public" }]),
    },
  };

  return canonProjectSchema.parse(project);
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || `project-${Date.now()}`;
}

export function availableStableFormats() {
  return listFormats().map((item) => item.mediaType);
}

async function listHostedProjectsInRoot(root: string, archived: boolean) {
  if (!(await fs.pathExists(root))) {
    return [] as HostedProjectRecord[];
  }

  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && entry.name !== "_archived")
    .map(async (entry) => {
      const metaPath = path.join(root, entry.name, ".studio-project.json");
      if (!(await fs.pathExists(metaPath))) {
        return undefined;
      }
      const record = await fs.readJson(metaPath) as HostedProjectRecord;
      return archived ? { ...record, archived: true } : record;
    }));
  return projects.filter(Boolean) as HostedProjectRecord[];
}

function hostedProjectWorkspace(slug: string, archived = false) {
  return path.join(archived ? archivedWorkspaceRoot : workspaceRoot, slug);
}

async function locateHostedProject(slug: string) {
  const activeWorkspace = projectWorkspace(slug);
  if (await fs.pathExists(path.join(activeWorkspace, ".studio-project.json"))) {
    return {
      archived: false,
      workspacePath: activeWorkspace,
      record: await fs.readJson(path.join(activeWorkspace, ".studio-project.json")) as HostedProjectRecord,
    };
  }

  const archivedWorkspace = archivedProjectWorkspace(slug);
  if (await fs.pathExists(path.join(archivedWorkspace, ".studio-project.json"))) {
    return {
      archived: true,
      workspacePath: archivedWorkspace,
      record: {
        ...await fs.readJson(path.join(archivedWorkspace, ".studio-project.json")) as HostedProjectRecord,
        archived: true,
      },
    };
  }

  throw new Error(`Project not found: ${slug}`);
}

async function updateProjectWorkspace(workspacePath: string, next: { slug: string; title: string }) {
  const canonPath = path.join(workspacePath, "00_admin/canon_lock.yaml");
  if (await fs.pathExists(canonPath)) {
    const canon = await loadCanon(canonPath);
    canon.id = next.slug;
    canon.slug = next.slug;
    canon.canon.title.value = next.title;
    await saveCanon(canonPath, canon);
  }

  const manifestPath = path.join(workspacePath, "00_admin/package_manifest.json");
  if (await fs.pathExists(manifestPath)) {
    const manifest = await fs.readJson(manifestPath) as { projectId?: string };
    manifest.projectId = next.slug;
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
  }
}

async function uniqueSlug(base: string, options: { exclude?: string[] } = {}) {
  const excluded = new Set(options.exclude ?? []);
  const existing = new Set((await listHostedProjects({ includeArchived: true }))
    .map((project) => project.slug)
    .filter((slug) => !excluded.has(slug)));
  if (!existing.has(base)) {
    return base;
  }
  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}
