import type { Episode } from "./types";

export function findNextEpisode(episodes: Episode[], current: Episode): Episode | null {
  const ordered = episodes
    .filter((episode) => Number.isFinite(episode.season) && Number.isFinite(episode.episode))
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  const index = ordered.findIndex((episode) => episode.id === current.id);
  return index < 0 ? null : ordered[index + 1] ?? null;
}

const eventName = "tiktak-next-episode-auto";
const preferenceKey = () =>
  `tiktak:next-episode-auto:${localStorage.getItem("tiktak:active-profile-owner") ?? "guest"}`;

export function readNextEpisodeAutoAdvance(): boolean {
  return localStorage.getItem(preferenceKey()) === "1";
}

export function writeNextEpisodeAutoAdvance(enabled: boolean): void {
  localStorage.setItem(preferenceKey(), enabled ? "1" : "0");
  window.dispatchEvent(new Event(eventName));
}

export function subscribeNextEpisodeAutoAdvance(listener: () => void): () => void {
  window.addEventListener(eventName, listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey()) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, listener);
    window.removeEventListener("storage", onStorage);
  };
}
