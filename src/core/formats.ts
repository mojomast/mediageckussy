import type { FormatPack } from "./types.js";
import { tvFormatPack } from "../formats/tv/pack.js";
import { featureFilmPack } from "../formats/film/pack.js";
import { podcastPack } from "../formats/podcast/pack.js";
import { webSeriesPack } from "../formats/web-series/pack.js";
import { placeholderPacks } from "../formats/shared/placeholder-packs.js";

const packs = [tvFormatPack, featureFilmPack, podcastPack, webSeriesPack, ...placeholderPacks];

export function getFormatPack(mediaType: string): FormatPack {
  const pack = packs.find((item) => item.mediaType === mediaType);

  if (!pack) {
    throw new Error(`Unsupported media type: ${mediaType}`);
  }

  return pack;
}

export function listFormats() {
  return packs.map((pack) => ({ mediaType: pack.mediaType, supported: pack.supported }));
}
