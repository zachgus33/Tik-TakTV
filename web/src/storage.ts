import { useState } from "react";
import type { Addon, Item, Progress, Provider } from "./types";
import { defaultAddons } from "./api";

export function read<T>(
  key: string,
  fallback: T,
  storage: Storage = localStorage,
): T {
  try {
    const raw = storage.getItem(`nuvio:${key}`);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(
  key: string,
  value: unknown,
  storage: Storage = localStorage,
) {
  try {
    storage.setItem(`nuvio:${key}`, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
export function useStored<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(() => read(key, fallback));
  const update = (next: T | ((previous: T) => T)) =>
    setValue((previous) => {
      const result =
        typeof next === "function" ? (next as (p: T) => T)(previous) : next;
      if (!save(key, result)) window.dispatchEvent(new Event("storage-full"));
      return result;
    });
  return [value, update] as const;
}
export const getAddons = (): Addon[] => read("addons", defaultAddons);
export const getProvider = (): Provider | null =>
  read("provider", read("provider", null), sessionStorage);
export function storeProvider(p: Provider | null, remember: boolean) {
  localStorage.removeItem("nuvio:provider");
  sessionStorage.removeItem("nuvio:provider");
  if (p && !save("provider", p, remember ? localStorage : sessionStorage))
    throw new Error(
      "Browser storage is unavailable. Allow site storage to save this connection.",
    );
}

const accountScopedKeys = [
  "addons",
  "collections",
  "library",
  "progress",
  "torbox-key",
  "realdebrid-key",
  "playback-service",
  "provider",
  "home-catalogs",
  "tmdb-key",
  "discovered-url",
];

const transientProfileKeys = ["recent-channels", "downloads"];

const transientProfileRawKeys = [
  "tiktak:addon-health",
  "tiktak:stream-preferences",
  "tiktak:playback-reports",
  "tiktak:friend-attempts",
  "tiktak:last-party-create",
];

export function clearProfileTransientStorage() {
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of transientProfileKeys) storage.removeItem(`nuvio:${key}`);
    for (const key of transientProfileRawKeys) storage.removeItem(key);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("downloads-changed"));
    window.dispatchEvent(new Event("addon-health-changed"));
  }
}

/** Remove data owned by the current Nuvio profile before another user enters. */
export function clearAccountStorage() {
  clearProfileTransientStorage();
  for (const storage of [localStorage, sessionStorage]) {
    for (const key of accountScopedKeys) storage.removeItem(`nuvio:${key}`);
    storage.removeItem("tiktak:last-sync");
  }
}
export function cleanItem(item: Item): Item {
  // Saved library records never include playback URLs (which can contain passwords).
  const { url: _url, ...rest } = item;
  return rest;
}
export function storeProgress(
  item: Item,
  seconds: number,
  duration: number,
  episode?: Progress["episode"],
) {
  if (
    item.type === "live" ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    seconds < 1
  )
    return;
  const list = read<Progress[]>("progress", []);
  const key = `${item.source}:${item.provider}:${item.type}:${item.id}`;
  const next = list.filter(
    (p) =>
      `${p.item.source}:${p.item.provider}:${p.item.type}:${p.item.id}` !== key,
  );
  if (seconds / duration < 0.97)
    next.unshift({
      item: cleanItem(item),
      seconds,
      duration,
      at: Date.now(),
      episode,
    });
  save("progress", next.slice(0, 100));
}
