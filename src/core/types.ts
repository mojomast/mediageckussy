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
  backstory?: string[];
  initial_relationships?: Array<{
    characterId: string;
    dynamic: string;
  }>;
  episode_hooks?: string[];
  arc_notes?: string;
}

export interface EpisodeEntry {
  code: string;
  title: string;
  logline: string;
  status: "planned" | "draft" | "approved";
  visibility: "public" | "internal";
  featured_characters?: string[];
  story_function?: string;
  scenes?: Array<{
    scene_number: number;
    location: string;
    characters: string[];
    beat: string;
  }>;
  episode_end?: string;
}

export interface StorylineEntry {
  id: string;
  title: string;
  logline: string;
  episodes: string[];
  characters: string[];
  theme_connection: string;
  arc_shape: string[];
  visibility: "public" | "internal";
}

export interface LocationEntry {
  id: string;
  name: string;
  description: string;
  atmosphere: string;
  frequent_characters?: string[];
  visibility: "public" | "internal";
}

export interface WorldLoreEntry {
  id: string;
  fact: string;
  narrative_implication: string;
}

export interface ThemeEntry {
  id: string;
  label: string;
  theme_expression?: string;
  motif?: string;
}

export interface MotifEntry {
  id: string;
  description: string;
  theme_connection?: string;
}

export interface FactionEntry {
  id: string;
  name: string;
  description: string;
  allegiance?: string;
  members?: string[];
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
    storylines?: CanonField<StorylineEntry[]>;
    locations?: CanonField<LocationEntry[]>;
    world_lore?: CanonField<WorldLoreEntry[]>;
    motifs?: CanonField<MotifEntry[]>;
    themes_structured?: CanonField<ThemeEntry[]>;
    factions?: CanonField<FactionEntry[]>;
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
