import { defaultAddon, safeUrl } from "./api";
import { sourceFetch } from "./connection";
import type { CollectionSource } from "./collections";
import type { Item } from "./types";
import { DEFAULT_TMDB_KEY } from "./config";
const base = "https://api.themoviedb.org/3";
function key() {
  return localStorage.getItem("nuvio:tmdb-key")?.trim() || DEFAULT_TMDB_KEY;
}
function authenticatedRequest(
  path: string,
  query: Record<string, string>,
  credential: string,
) {
  const bearer = credential.startsWith("eyJ") || credential.length > 80;
  const params = new URLSearchParams(
    bearer ? query : { api_key: credential, ...query },
  );
  return {
    url: `${base}/${path}?${params}`,
    headers: bearer ? { Authorization: `Bearer ${credential}` } : undefined,
  };
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
  const credential = key().trim();
  const request = authenticatedRequest(path, query, credential);
  const response = await sourceFetch(request.url, {
    signal,
    cache: "force-cache",
    headers: request.headers,
  });
  if (!response.ok)
    throw new Error(
      `TMDB returned HTTP ${response.status}. Check the API credential saved in Settings.`,
    );
  return (await response.json()) as T;
}
export async function validateTmdbCredential(
  credential: string,
): Promise<void> {
  const value = credential.trim();
  if (!value) throw new Error("Enter a TMDB API credential.");
  const request = authenticatedRequest("configuration", {}, value);
  const response = await sourceFetch(request.url, { headers: request.headers });
  if (!response.ok)
    throw new Error(`TMDB rejected this credential (HTTP ${response.status}).`);
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
  return rows.slice(0, 200).map((r) => ({
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

export type Credit = { id: number; name: string; role: string; photo?: string };

export async function peopleByName(
  names: string[],
  signal?: AbortSignal,
): Promise<Credit[]> {
  const unique = [
    ...new Set(names.map((name) => name.trim()).filter(Boolean)),
  ].slice(0, 12);
  const rows: Credit[] = [];
  for (let offset = 0; offset < unique.length; offset += 4) {
    const batch = await Promise.allSettled(
      unique.slice(offset, offset + 4).map(async (name) => {
        const data = await get<{ results?: Record<string, unknown>[] }>(
          "search/person",
          { query: name, language: "en-US", page: "1" },
          signal,
        );
        const exact = (data.results ?? []).find(
          (person) =>
            String(person.name ?? "").localeCompare(name, undefined, {
              sensitivity: "base",
            }) === 0,
        );
        const person = exact ?? data.results?.[0];
        if (!person?.id) return null;
        return {
          id: Number(person.id),
          name: String(person.name ?? name),
          role: "Cast",
          photo: person.profile_path
            ? safeUrl(`https://image.tmdb.org/t/p/w185${person.profile_path}`)
            : undefined,
        } satisfies Credit;
      }),
    );
    for (const result of batch)
      if (result.status === "fulfilled" && result.value)
        rows.push(result.value);
  }
  return rows;
}

export async function titleCredits(
  item: Item,
  signal?: AbortSignal,
): Promise<Credit[]> {
  const media = item.type === "series" ? "tv" : "movie";
  let id = item.id.startsWith("tmdb:") ? item.id.slice(5) : "";
  if (!id && /^tt\d+$/.test(item.id)) {
    const found = await get<{
      movie_results?: { id: number }[];
      tv_results?: { id: number }[];
    }>(`find/${item.id}`, { external_source: "imdb_id" }, signal);
    const row =
      item.type === "series" ? found.tv_results?.[0] : found.movie_results?.[0];
    if (!row) return [];
    id = String(row.id);
  }
  if (!id) return [];
  const data = await get<{ cast?: Record<string, unknown>[] }>(
    `${media}/${id}/credits`,
    { language: "en-US" },
    signal,
  );
  return (data.cast ?? []).slice(0, 12).map((person) => ({
    id: Number(person.id),
    name: String(person.name ?? ""),
    role: String(person.character ?? "Cast"),
    photo: person.profile_path
      ? safeUrl(`https://image.tmdb.org/t/p/w185${person.profile_path}`)
      : undefined,
  }));
}
export async function personCredits(
  personId: number,
  signal?: AbortSignal,
): Promise<Item[]> {
  const data = await get<{ cast?: Record<string, unknown>[] }>(
    `person/${personId}/combined_credits`,
    { language: "en-US" },
    signal,
  );
  return [
    ...new Map(
      (data.cast ?? [])
        .filter(
          (row) =>
            (row.media_type === "movie" || row.media_type === "tv") && row.id,
        )
        .sort((a, b) => Number(b.popularity ?? 0) - Number(a.popularity ?? 0))
        .map((row) => {
          const item: Item = {
            id: `tmdb:${row.id}`,
            name: String(row.title ?? row.name ?? "Untitled"),
            type: row.media_type === "tv" ? "series" : "movie",
            source: "addon",
            provider: defaultAddon.base,
            poster: row.poster_path
              ? safeUrl(`https://image.tmdb.org/t/p/w500${row.poster_path}`)
              : undefined,
            background: row.backdrop_path
              ? safeUrl(`https://image.tmdb.org/t/p/w1280${row.backdrop_path}`)
              : undefined,
            description: String(row.overview ?? ""),
            year: String(row.release_date ?? row.first_air_date ?? "").slice(
              0,
              4,
            ),
          };
          return [`${item.type}:${item.id}`, item] as const;
        }),
    ).values(),
  ].slice(0, 40);
}
