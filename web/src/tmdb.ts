import { json, defaultAddon, safeUrl } from "./api";
import type { CollectionSource } from "./collections";
import type { Item } from "./types";
const base = "https://api.themoviedb.org/3";
function key() {
  return localStorage.getItem("nuvio:tmdb-key") ?? "";
}
async function get<T>(
  path: string,
  query: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!key())
    throw new Error(
      "This collection uses TMDB. Add your TMDB API key in Settings or sync it from your Nuvio profile.",
    );
  return json<T>(
    `${base}/${path}?${new URLSearchParams({ api_key: key(), ...query })}`,
    signal,
  );
}
export async function tmdbCollection(
  source: CollectionSource,
  signal?: AbortSignal,
): Promise<Item[]> {
  const media = ["tv", "series"].includes(
    String(source.mediaType ?? source.type).toLowerCase(),
  )
    ? "tv"
    : "movie";
  const kind = String(source.tmdbSourceType ?? "DISCOVER").toUpperCase();
  const id = Number(source.tmdbId);
  const filters = (source.filters ?? {}) as Record<string, unknown>;
  let path = `discover/${media}`;
  const query: Record<string, string> = { language: "en-US", page: "1" };
  const mappings: Record<string, string> = {
    withCompanies: "with_companies",
    withoutCompanies: "without_companies",
    withNetworks: "with_networks",
    withGenres: "with_genres",
    withoutGenres: "without_genres",
    withWatchProviders: "with_watch_providers",
    withoutWatchProviders: "without_watch_providers",
    watchRegion: "watch_region",
    voteCountGte: "vote_count.gte",
    voteAverageGte: "vote_average.gte",
    voteAverageLte: "vote_average.lte",
    withOriginalLanguage: "with_original_language",
    withOriginCountry: "with_origin_country",
    withKeywords: "with_keywords",
    withoutKeywords: "without_keywords",
    year: media === "tv" ? "first_air_date_year" : "year",
    releaseDateGte:
      media === "tv" ? "first_air_date.gte" : "primary_release_date.gte",
    releaseDateLte:
      media === "tv" ? "first_air_date.lte" : "primary_release_date.lte",
  };
  for (const [name, parameter] of Object.entries(mappings))
    if (filters[name] != null && filters[name] !== "")
      query[parameter] = String(filters[name]);
  if (query.with_watch_providers || query.without_watch_providers)
    query.watch_region ||= "US";
  if (source.sortBy && source.sortBy !== "original")
    query.sort_by = String(source.sortBy);
  if (kind === "COMPANY") query.with_companies = String(id);
  else if (kind === "NETWORK") query.with_networks = String(id);
  else if (kind === "LIST") path = `list/${id}`;
  else if (kind === "COLLECTION") path = `collection/${id}`;
  else if (kind === "PERSON" || kind === "DIRECTOR")
    path = `person/${id}/${media}_credits`;
  if (kind !== "DISCOVER" && (!Number.isInteger(id) || id <= 0))
    throw new Error("This collection source has an invalid TMDB ID.");
  const data = await get<Record<string, Record<string, unknown>[]>>(
    path,
    query,
    signal,
  );
  const rows =
    kind === "DIRECTOR"
      ? (data.crew ?? []).filter((r) => r.job === "Director")
      : (data.results ?? data.items ?? data.parts ?? data.cast ?? []);
  return rows
    .slice(0, 200)
    .map((r) => ({
      id: `tmdb:${r.id}`,
      name: String(r.title ?? r.name ?? "Untitled"),
      type: (r.media_type ?? media) === "tv" ? "series" : "movie",
      source: "addon",
      provider: defaultAddon.base,
      poster: r.poster_path
        ? safeUrl(`https://image.tmdb.org/t/p/w500${r.poster_path}`)
        : undefined,
      background: r.backdrop_path
        ? safeUrl(`https://image.tmdb.org/t/p/w1280${r.backdrop_path}`)
        : undefined,
      description: String(r.overview ?? ""),
      year: String(r.release_date ?? r.first_air_date ?? "").slice(0, 4),
    }));
}
export async function resolveTmdb(
  item: Item,
  signal?: AbortSignal,
): Promise<Item> {
  if (!/^tmdb:\d+$/.test(item.id)) return item;
  const media = item.type === "series" ? "tv" : "movie";
  const data = await get<{ imdb_id?: string }>(
    `${media}/${item.id.slice(5)}/external_ids`,
    {},
    signal,
  );
  if (!data.imdb_id)
    throw new Error(
      "TMDB has no IMDb ID for this title; your IMDb streaming add-ons cannot resolve it.",
    );
  return { ...item, id: data.imdb_id, provider: defaultAddon.base };
}
