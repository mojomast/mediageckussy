import type { FormatPack } from "../../core/types.js";

function placeholderFormatPack(mediaType: string): FormatPack {
  return {
    mediaType,
    supported: false,
    directories: ["00_admin", "01_development", "16_ops"],
    requiredFiles: ["README.md", "HANDOFF.md", "00_admin/canon_lock.yaml", "00_admin/package_manifest.json"],
    templates: [],
  };
}

export const placeholderPacks = [
  placeholderFormatPack("game"),
  placeholderFormatPack("book_comic"),
  placeholderFormatPack("album_music_project"),
];
