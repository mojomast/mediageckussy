import { z } from "zod";

const canonFieldSchema = <T extends z.ZodTypeAny>(inner: T) =>
  z.object({
    value: inner,
    status: z.enum(["draft", "approved", "locked", "deprecated"]),
    owner: z.enum(["user", "editor", "agent", "system", "producer", "legal", "marketing"]),
    updated_at: z.string(),
    confidence: z.number().min(0).max(1),
    downstream_dependencies: z.array(z.string()),
    visibility: z.enum(["internal", "public", "private"]).optional(),
  });

export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  description: z.string(),
  visibility: z.enum(["public", "internal"]),
  kind: z.enum(["character", "host", "contributor"]).optional(),
  backstory: z.array(z.string()).optional(),
  initial_relationships: z.array(z.object({
    characterId: z.string(),
    dynamic: z.string(),
  })).optional(),
  episode_hooks: z.array(z.string()).optional(),
  arc_notes: z.string().optional(),
});

export const episodeSchema = z.object({
  code: z.string(),
  title: z.string(),
  logline: z.string(),
  status: z.enum(["planned", "draft", "approved"]),
  visibility: z.enum(["public", "internal"]),
  featured_characters: z.array(z.string()).optional(),
  story_function: z.string().optional(),
  scenes: z.array(z.object({
    scene_number: z.number(),
    location: z.string(),
    characters: z.array(z.string()),
    beat: z.string(),
  })).optional(),
  episode_end: z.string().optional(),
});

export const structureItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  visibility: z.enum(["public", "internal"]),
});

export const storylineSchema = z.object({
  id: z.string(),
  title: z.string(),
  logline: z.string(),
  episodes: z.array(z.string()),
  characters: z.array(z.string()),
  theme_connection: z.string(),
  arc_shape: z.array(z.string()),
  visibility: z.enum(["public", "internal"]),
});

export const locationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  atmosphere: z.string(),
  frequent_characters: z.array(z.string()).optional(),
  visibility: z.enum(["public", "internal"]),
});

export const worldLoreSchema = z.object({
  id: z.string(),
  fact: z.string(),
  narrative_implication: z.string(),
});

export const motifSchema = z.object({
  id: z.string(),
  description: z.string(),
  theme_connection: z.string().optional(),
});

export const themeEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  theme_expression: z.string().optional(),
  motif: z.string().optional(),
});

export const factionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  allegiance: z.string().optional(),
  members: z.array(z.string()).optional(),
  visibility: z.enum(["public", "internal"]),
});

export const canonProjectSchema = z.object({
  id: z.string(),
  slug: z.string(),
  package_tier: z.enum(["light", "standard", "full"]),
  outputs: z.object({
    website: z.object({ enabled: z.boolean() }),
    press_bundle: z.object({ enabled: z.boolean() }).optional(),
    partner_bundle: z.object({ enabled: z.boolean() }).optional(),
  }),
  canon: z.object({
    title: canonFieldSchema(z.string().min(1)),
    logline: canonFieldSchema(z.string().min(1)),
    format: canonFieldSchema(z.string().min(1)),
    genre: canonFieldSchema(z.string().min(1)),
    tone: canonFieldSchema(z.array(z.string()).min(1)),
    audience: canonFieldSchema(z.array(z.string()).min(1)),
    comps: canonFieldSchema(z.array(z.string())),
    duration_count: canonFieldSchema(z.string().min(1)),
    themes: canonFieldSchema(z.array(z.string()).min(1)),
    world_setting: canonFieldSchema(z.string().min(1)),
    production_assumptions: canonFieldSchema(z.array(z.string())),
    business_assumptions: canonFieldSchema(z.array(z.string())),
    legal_assumptions: canonFieldSchema(z.array(z.string())),
    publication_flags: canonFieldSchema(z.record(z.string(), z.boolean())),
    characters: canonFieldSchema(z.array(characterSchema).min(1)),
    episodes: canonFieldSchema(z.array(episodeSchema).min(1)),
    structure: canonFieldSchema(z.array(structureItemSchema)).optional(),
    storylines: canonFieldSchema(z.array(storylineSchema)).optional(),
    locations: canonFieldSchema(z.array(locationSchema)).optional(),
    world_lore: canonFieldSchema(z.array(worldLoreSchema)).optional(),
    motifs: canonFieldSchema(z.array(motifSchema)).optional(),
    themes_structured: canonFieldSchema(z.array(themeEntrySchema)).optional(),
    factions: canonFieldSchema(z.array(factionSchema)).optional(),
  }),
});
