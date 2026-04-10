export type FieldStatus = "draft" | "approved" | "locked" | "deprecated";

export type FieldOwner =
  | "user"
  | "editor"
  | "agent"
  | "system"
  | "producer"
  | "legal"
  | "marketing";

export interface CanonField<T> {
  value: T;
  status: FieldStatus;
  owner: FieldOwner;
  updated_at: string;
  confidence: number;
  downstream_dependencies: string[];
  visibility?: "internal" | "public" | "private";
}

export interface CharacterEntity {
  id: string;
  name: string;
  role: string;
  description: string;
  visibility: "public" | "internal";
  kind?: "character" | "host" | "contributor";
}

export interface EpisodeEntry {
  code: string;
  title: string;
  logline: string;
  status: "planned" | "draft" | "approved";
  visibility: "public" | "internal";
}

export interface CanonProject {
  id: string;
  slug: string;
  package_tier: "light" | "standard" | "full";
  outputs: {
    website: { enabled: boolean };
    press_bundle?: { enabled: boolean };
    partner_bundle?: { enabled: boolean };
  };
  canon: {
    title: CanonField<string>;
    logline: CanonField<string>;
    format: CanonField<string>;
    genre: CanonField<string>;
    tone: CanonField<string[]>;
    audience: CanonField<string[]>;
    comps: CanonField<string[]>;
    duration_count: CanonField<string>;
    themes: CanonField<string[]>;
    world_setting: CanonField<string>;
    production_assumptions: CanonField<string[]>;
    business_assumptions: CanonField<string[]>;
    legal_assumptions: CanonField<string[]>;
    publication_flags: CanonField<Record<string, boolean>>;
    characters: CanonField<CharacterEntity[]>;
    episodes: CanonField<EpisodeEntry[]>;
    structure?: CanonField<Array<{ id: string; title: string; summary: string; visibility: "public" | "internal" }>>;
  };
}

export interface GeneratedFileRecord {
  path: string;
  templateId: string;
  department: string;
  audience: string[];
  outputFormat: string;
  sources: string[];
  status: "generated" | "scaffolded";
  regenPolicy: "always" | "allowed_if_not_locked" | "manual_only";
  generatedAt: string;
  canonFingerprint: string;
}

export interface PackageManifest {
  projectId: string;
  generatedAt: string;
  mediaType: string;
  packageTier: string;
  generatedFiles: GeneratedFileRecord[];
  generatedAssets?: Array<{
    type: string;
    path: string;
    provider: string;
    model: string;
    prompt: string;
    canonFingerprint: string;
    generatedAt: string;
  }>;
  hydrationLog?: Array<{
    field?: string;
    file?: string;
    provider: string;
    model: string;
    confidence: number;
    status: "pending" | "accepted" | "rejected";
    generatedAt: string;
    tokenUsage: { prompt: number; completion: number };
  }>;
  requiredFiles: string[];
  departments: Array<{
    name: string;
    fileCount: number;
  }>;
}

export interface ValidationIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  completenessScore: number;
}

export interface TemplateDefinition {
  id: string;
  mediaType: string;
  department: string;
  audience: string[];
  packageTier: Array<"light" | "standard" | "full">;
  outputFormat: "md" | "html" | "json" | "yaml" | "css" | "js";
  path: string;
  templatePath: string;
  sources: string[];
  regenPolicy: "always" | "allowed_if_not_locked" | "manual_only";
  kind: "doc" | "site" | "data" | "asset";
}

export interface FormatPack {
  mediaType: string;
  supported: boolean;
  status: "stable" | "experimental" | "stubbed";
  directories: string[];
  requiredFiles: string[];
  templates: TemplateDefinition[];
}

export interface GenerateOptions {
  canonPath: string;
  outputDir: string;
  mediaType?: string;
  department?: string;
  file?: string;
}
