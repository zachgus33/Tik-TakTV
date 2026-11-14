import type { Item } from "./types";
import { traktAccessToken, traktClientId } from "./TraktSettings";

type Ids = { imdb?: string; tmdb?: number; trakt?: number };
type Rated = { rating: number; movie?: { ids?: Ids }; show?: { ids?: Ids } };

export function traktRatingIds(id: string): Ids | null {
  const imdb = /(?:^|[:_])(tt\d{7,})(?:$|:)/i.exec(id)?.[1];
  if (imdb) return { imdb };
  const tmdb = /^tmdb:(\d+)$/i.exec(id)?.[1];
  if (tmdb) return { tmdb: Number(tmdb) };
  const trakt = /^trakt:(\d+)$/i.exec(id)?.[1];
  if (trakt) return { trakt: Number(trakt) };
  const numeric = /^(\d+)(?::(?:movie|series|show))?$/i.exec(id)?.[1];
  return numeric ? { trakt: Number(numeric) } : null;
}

function sameIds(a: Ids, b?: Ids): boolean {
  return !!b && ((!!a.imdb && a.imdb === b.imdb) ||
    (a.tmdb != null && a.tmdb === b.tmdb) ||
    (a.trakt != null && a.trakt === b.trakt));
}

async function request(profile: string, path: string, body?: unknown): Promise<Response> {
  const token = await traktAccessToken(profile);
  if (!token) throw new Error("Connect your Trakt account in Settings to rate titles.");
  const response = await fetch(`https://api.trakt.tv${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "trakt-api-version": "2",
      "trakt-api-key": traktClientId,
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) throw new Error(`Trakt rating request failed (HTTP ${response.status}).`);
  return response;
}

export async function getTraktRating(profile: string, item: Item): Promise<number | null> {
  const ids = traktRatingIds(item.id);
  if (!ids || item.type === "live") return null;
  const kind = item.type === "movie" ? "movies" : "shows";
  // Trakt returns the signed-in user's ratings. Search every page, not just the first.
  for (let page = 1; page <= 20; page++) {
    const response = await request(profile, `/sync/ratings/${kind}?page=${page}&limit=1000`);
    const rows = await response.json() as Rated[];
    const match = rows.find((row) => sameIds(ids, kind === "movies" ? row.movie?.ids : row.show?.ids));
    if (match) return match.rating;
    const pages = Number(response.headers.get("x-pagination-page-count"));
    if (pages > 0 ? page >= pages : rows.length < 1000) break;
  }
  return null;
}

export async function setTraktRating(profile: string, item: Item, rating: number | null): Promise<void> {
  const ids = traktRatingIds(item.id);
  if (!ids || item.type === "live") throw new Error("This title has no Trakt-compatible ID.");
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10))
    throw new Error("Choose a rating from 1 to 10.");
  const kind = item.type === "movie" ? "movies" : "shows";
  const body = { [kind]: [{ ids, ...(rating !== null ? { rating } : {}) }] };
  const response = await request(profile, rating === null ? "/sync/ratings/remove" : "/sync/ratings", body);
  const result = await response.json() as { added?: Record<string, number>; deleted?: Record<string, number> };
  if ((rating === null ? result.deleted?.[kind] : result.added?.[kind]) !== 1)
    throw new Error("Trakt did not accept this title's rating.");
}
