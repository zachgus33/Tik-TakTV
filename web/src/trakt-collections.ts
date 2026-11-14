import { defaultAddon, safeUrl } from "./api";
import type { CollectionSource } from "./collections";
import { traktAccessToken, traktClientId } from "./TraktSettings";
import type { Item } from "./types";

type TraktTitle = {
  title?: string;
  year?: number;
  ids?: { imdb?: string; tmdb?: number; trakt?: number };
  overview?: string;
  released?: string;
  first_aired?: string;
  images?: { poster?: string[]; fanart?: string[]; banner?: string[]; thumb?: string[] };
};
type TraktListItem = { movie?: TraktTitle; show?: TraktTitle };

function artwork(values?: string[]): string | undefined {
  const value = values?.find((entry) => typeof entry === "string" && entry.trim());
  if (!value) return undefined;
  const url = value.startsWith("//") ? `https:${value}` : value.startsWith("http://") ? `https://${value.slice(7)}` : value.startsWith("http") ? value : `https://${value}`;
  return safeUrl(url);
}

function toItem(entry: TraktListItem, media: "movie" | "show"): Item | null {
  const title = media === "movie" ? entry.movie : entry.show;
  if (!title?.title) return null;
  const ids = title.ids;
  const id = ids?.imdb && /^tt\d+$/i.test(ids.imdb) ? ids.imdb
    : Number.isInteger(ids?.tmdb) && Number(ids?.tmdb) > 0 ? `tmdb:${ids?.tmdb}`
    : Number.isInteger(ids?.trakt) && Number(ids?.trakt) > 0 ? `trakt:${ids?.trakt}` : "";
  if (!id) return null;
  return {
    id,
    name: title.title,
    type: media === "show" ? "series" : "movie",
    source: "addon",
    provider: defaultAddon.base,
    poster: artwork(title.images?.poster) ?? artwork(title.images?.fanart),
    background: artwork(title.images?.fanart) ?? artwork(title.images?.banner) ?? artwork(title.images?.thumb),
    description: title.overview,
    year: String(title.year ?? title.released ?? title.first_aired ?? "").slice(0, 4),
  };
}

export async function traktCollection(source: CollectionSource, profile: string, signal?: AbortSignal): Promise<Item[]> {
  const id = Number(source.traktListId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("This Trakt collection has an invalid list ID.");
  const media = ["tv", "series", "show"].includes(String(source.mediaType ?? source.type).toLowerCase()) ? "show" : "movie";
  const query = new URLSearchParams({
    extended: "full,images",
    limit: "50",
    sort_by: String(source.sortBy || "rank"),
    sort_how: String(source.sortHow || "asc"),
  });
  const token = profile ? await traktAccessToken(profile).catch(() => null) : null;
  const headers = {
      Accept: "application/json",
      "trakt-api-version": "2",
      "trakt-api-key": traktClientId,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const request = (path: string, page: number) => {
    const params = new URLSearchParams(query);
    params.set("page", String(page));
    return fetch(`https://api.trakt.tv/${path}?${params}`, { signal, headers });
  };
  let path = `lists/${id}/items/${media}`;
  let response = await request(path, 1);
  if (!response.ok && token && [401, 403, 404].includes(response.status)) {
    path = `users/me/lists/${id}/items/${media}`;
    response = await request(path, 1);
  }
  const items: Item[] = [];
  for (let page = 1; page <= 4; page += 1) {
    if (!response.ok) {
      if ([401, 403, 404].includes(response.status)) throw new Error("Trakt list unavailable or private. Connect its owner account in Settings.");
      if (response.status === 429) throw new Error("Trakt rate limit reached. Try again shortly.");
      throw new Error(`Trakt returned HTTP ${response.status}.`);
    }
    const entries = await response.json() as TraktListItem[];
    if (!Array.isArray(entries)) throw new Error("Trakt returned an invalid list response.");
    items.push(...entries.map((entry) => toItem(entry, media)).filter((item): item is Item => item !== null));
    const pageCount = Number(response.headers.get("x-pagination-page-count") || 1);
    if (page >= pageCount || entries.length === 0) break;
    response = await request(path, page + 1);
  }
  return [...new Map(items.map((item) => [`${item.type}:${item.id}`, item])).values()];
}
