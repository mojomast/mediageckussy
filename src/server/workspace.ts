import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "fs-extra";
import YAML from "yaml";
import type { CanonProject } from "../core/types.js";
import { getFormatPack, listFormats } from "../core/formats.js";
import { canonProjectSchema } from "../core/schema.js";

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
  await fs.ensureDir(archiveRoot);
}

export async function listHostedProjects() {
  await ensureWorkspaceRoot();
  const entries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const projects = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const metaPath = path.join(workspaceRoot, entry.name, ".studio-project.json");
    if (!(await fs.pathExists(metaPath))) {
      return undefined;
    }
    return fs.readJson(metaPath) as Promise<HostedProjectRecord>;
  }));
  return projects.filter(Boolean) as HostedProjectRecord[];
}

export async function readHostedProject(slug: string) {
  const metaPath = path.join(projectWorkspace(slug), ".studio-project.json");
  return fs.readJson(metaPath) as Promise<HostedProjectRecord>;
}

export async function writeHostedProject(record: HostedProjectRecord) {
  await fs.ensureDir(projectWorkspace(record.slug));
  await fs.writeJson(path.join(projectWorkspace(record.slug), ".studio-project.json"), record, { spaces: 2 });
}

export function projectWorkspace(slug: string) {
  return path.join(workspaceRoot, slug);
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

async function uniqueSlug(base: string) {
  const existing = new Set((await listHostedProjects()).map((project) => project.slug));
  if (!existing.has(base)) {
    return base;
  }
  let index = 2;
  while (existing.has(`${base}-${index}`)) {
    index += 1;
  }
  return `${base}-${index}`;
}

export function availableStableFormats() {
  return listFormats().map((item) => item.mediaType);
}
