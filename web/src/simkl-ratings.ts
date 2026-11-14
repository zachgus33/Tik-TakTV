import type { Item } from "./types";
import { simklRequest } from "./ExternalTrackingSettings";

type Ids = { imdb?: string; tmdb?: string; simkl?: string };
type Rated = { user_rating?: number | null; movie?: { ids?: Ids }; show?: { ids?: Ids }; ids?: Ids };
const cache = new Map<string, { at: number; rows: Rated[] }>();

export function simklRatingIds(id: string): Ids | null {
  const imdb = /(?:^|[:_])(tt\d{7,})(?:$|:)/i.exec(id)?.[1];
  if (imdb) return { imdb };
  const tmdb = /^tmdb:(\d+)$/i.exec(id)?.[1];
  if (tmdb) return { tmdb };
  const simkl = /^simkl:(\d+)$/i.exec(id)?.[1];
  return simkl ? { simkl } : null;
}

function matches(a: Ids, b?: Ids): boolean {
  return !!b && Object.entries(a).some(([key, value]) => String(b[key as keyof Ids] || "") === value);
}

export async function getSimklRating(profile: string, item: Item): Promise<number | null> {
  const ids = simklRatingIds(item.id);
  if (!ids || item.type === "live") return null;
  const type = item.type === "movie" ? "movies" : "shows";
  const cacheKey = `${profile}:${type}`;
  let saved = cache.get(cacheKey);
  if (!saved || Date.now() - saved.at > 5 * 60_000) {
    const response = await simklRequest(profile, `/sync/ratings/${type}/1,2,3,4,5,6,7,8,9,10`);
    const data = await response.json() as Record<string, Rated[]>;
    saved = { at: Date.now(), rows: data[type] || [] };
    cache.set(cacheKey, saved);
  }
  return saved.rows.find(row => matches(ids, row.ids || row.movie?.ids || row.show?.ids))?.user_rating ?? null;
}

export async function setSimklRating(profile: string, item: Item, rating: number | null): Promise<void> {
  const ids = simklRatingIds(item.id);
  if (!ids || item.type === "live") throw new Error("This title has no Simkl-compatible ID.");
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10))
    throw new Error("Choose a rating from 1 to 10.");
  const type = item.type === "movie" ? "movies" : "shows";
  const body = { [type]: [{ ids, ...(rating === null ? {} : { rating }) }] };
  const response = await simklRequest(profile, rating === null ? "/sync/ratings/remove" : "/sync/ratings", body);
  const result = await response.json() as { added?: Record<string, number>; deleted?: Record<string, number> };
  if ((rating === null ? result.deleted?.[type] : result.added?.[type]) !== 1)
    throw new Error("Simkl did not accept this title's rating.");
  cache.delete(`${profile}:${type}`);
}
