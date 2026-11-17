import type { Episode, Item, WatchedItem } from "./types";

export const watchedKey = (
  type: "movie" | "series",
  id: string,
  season?: number,
  episode?: number,
) => `${type}:${id}:${season ?? ""}:${episode ?? ""}`;

export function isWatched(items: WatchedItem[], item: Item, episode?: Episode) {
  if (item.type === "live") return false;
  const key = watchedKey(item.type, item.id, episode?.season, episode?.episode);
  return items.some(
    (entry) =>
      watchedKey(entry.type, entry.id, entry.season, entry.episode) === key,
  );
}

export function isEpisodeWatched(
  items: WatchedItem[],
  item: Item,
  episode: Episode,
  resumeEpisode?: Episode,
) {
  if (isWatched(items, item, episode)) return true;
  if (!resumeEpisode || episode.season < 1 || resumeEpisode.season < 1) {
    return false;
  }
  return (
    episode.season < resumeEpisode.season ||
    (episode.season === resumeEpisode.season &&
      episode.episode < resumeEpisode.episode)
  );
}

export function markWatched(
  items: WatchedItem[],
  item: Item,
  episode?: Episode,
  watchedAt = Date.now(),
) {
  if (item.type === "live") return items;
  const entry: WatchedItem = {
    id: item.id,
    type: item.type,
    name: item.name,
    season: episode?.season,
    episode: episode?.episode,
    watchedAt,
  };
  const key = watchedKey(entry.type, entry.id, entry.season, entry.episode);
  return [
    entry,
    ...items.filter(
      (candidate) =>
        watchedKey(
          candidate.type,
          candidate.id,
          candidate.season,
          candidate.episode,
        ) !== key,
    ),
  ].slice(0, 10_000);
}

export function unmarkWatched(
  items: WatchedItem[],
  item: Item,
  episode?: Episode,
) {
  if (item.type === "live") return items;
  const key = watchedKey(item.type, item.id, episode?.season, episode?.episode);
  return items.filter(
    (entry) =>
      watchedKey(entry.type, entry.id, entry.season, entry.episode) !== key,
  );
}
