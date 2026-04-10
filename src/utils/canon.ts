import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import YAML from "yaml";
import { canonProjectSchema } from "../core/schema.js";
import type { CanonProject } from "../core/types.js";

export async function loadCanon(canonPath: string): Promise<CanonProject> {
  const raw = await fs.readFile(canonPath, "utf8");
  const parsed = path.extname(canonPath).toLowerCase().includes("json") ? JSON.parse(raw) : YAML.parse(raw);
  const normalized = {
    ...parsed,
    canon: {
      ...parsed.canon,
      structure: parsed.canon.structure ?? {
        value: [],
        status: "draft",
        owner: "system",
        updated_at: new Date().toISOString(),
        confidence: 1,
        downstream_dependencies: [],
        visibility: "internal",
      },
    },
  };
  return canonProjectSchema.parse(normalized);
}

export function fingerprintCanon(canon: CanonProject): string {
  return crypto.createHash("sha256").update(JSON.stringify(canon)).digest("hex").slice(0, 12);
}

export function publicCanonSlice(canon: CanonProject) {
  return {
    title: canon.canon.title.visibility === "public" ? canon.canon.title.value : undefined,
    logline: canon.canon.logline.visibility === "public" ? canon.canon.logline.value : undefined,
    genre: canon.canon.genre.visibility === "public" ? canon.canon.genre.value : undefined,
    tone: canon.canon.tone.visibility === "public" ? canon.canon.tone.value : [],
    world_setting: canon.canon.world_setting.visibility === "public" ? canon.canon.world_setting.value : undefined,
    characters: canon.canon.characters.value.filter((item) => item.visibility === "public"),
    episodes: canon.canon.episodes.value.filter((item) => item.visibility === "public" && item.status === "approved"),
    structure: (canon.canon.structure?.value ?? []).filter((item) => item.visibility === "public"),
  };
}
