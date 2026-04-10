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
});

export const episodeSchema = z.object({
  code: z.string(),
  title: z.string(),
  logline: z.string(),
  status: z.enum(["planned", "draft", "approved"]),
  visibility: z.enum(["public", "internal"]),
});

export const structureItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
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
  }),
});
