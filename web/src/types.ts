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
};
export type Episode = {
  id: string;
  name: string;
  season: number;
  episode: number;
  extension?: string;
  released?: string;
};
export type Stream = {
  name?: string;
  title?: string;
  url?: string;
  infoHash?: string;
  fileIdx?: number;
  seeders?: number;
  sources?: string[];
  externalUrl?: string;
  behaviorHints?: {
    notWebReady?: boolean;
    proxyHeaders?: unknown;
    filename?: string;
  };
};
export type Subtitle = {
  id?: string;
  url: string;
  lang?: string;
  name?: string;
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
    extra?: { name: string; isRequired?: boolean }[];
  }[];
};
export type Progress = {
  item: Item;
  seconds: number;
  duration: number;
  at: number;
  episode?: Episode;
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
