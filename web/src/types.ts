export type Kind = "movie" | "series" | "live";
export type Item = {
  id: string;
  name: string;
  type: Kind;
  source: "addon" | "xtream" | "playlist";
  provider?: string;
  poster?: string;
  background?: string;
  description?: string;
  year?: string;
  released?: string;
  rating?: string;
  genres?: string[];
  category?: string;
  epgId?: string;
  extension?: string;
  url?: string;
  runtime?: string;
  cast?: string[];
  directors?: string[];
  certification?: string;
};
export type Episode = {
  id: string;
  name: string;
  season: number;
  episode: number;
  extension?: string;
  released?: string;
  rating?: string;
};
export type Stream = {
  /** Privacy-safe display name of the add-on that returned this stream. */
  addonName?: string;
  /** Stable installed add-on identity used by mobile-style source rules. */
  addonId?: string;
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  seeders?: number;
  sources?: string[];
  externalUrl?: string;
  subtitles?: Subtitle[];
  behaviorHints?: {
    bingeGroup?: string;
    notWebReady?: boolean;
    proxyHeaders?: unknown;
    filename?: string;
    videoHash?: string;
    videoSize?: number;
    language?: string;
    audioLanguages?: string[];
  };
};
export type Subtitle = {
  id?: string;
  url: string;
  lang?: string;
  name?: string;
  headers?: Record<string, string>;
  source?: "stream" | "addon";
};
export type Provider = {
  server: string;
  username: string;
  password: string;
  scope: string;
  name: string;
};
export type Category = { id: string; name: string };
export type Addon = { base: string; manifest: Manifest; enabled?: boolean };
export type Manifest = {
  id: string;
  name: string;
  description?: string;
  version?: string;
  types?: string[];
  resources?: (
    string | { name: string; types?: string[]; idPrefixes?: string[] }
  )[];
  catalogs?: {
    id: string;
    type: string;
    name?: string;
    extra?: { name: string; isRequired?: boolean; options?: string[] }[];
  }[];
};
export type Progress = {
  item: Item;
  seconds: number;
  duration: number;
  at: number;
  episode?: Episode;
};
export type WatchedItem = {
  id: string;
  type: "movie" | "series";
  name: string;
  season?: number;
  episode?: number;
  watchedAt: number;
};
export type Programme = {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
};
export const itemKey = (item: Item) =>
  `${item.source}:${item.provider ?? ""}:${item.type}:${item.id}`;
