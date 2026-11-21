import type { Episode, Item, Stream } from "./types";

type CachedStreamLink = {
  stream: Stream;
  cachedAt: number;
};

const credentialKeys = new Set([
  "accesskey",
  "accesssignature",
  "accesssig",
  "accesstoken",
  "auth",
  "authkey",
  "authsig",
  "authsignature",
  "authtoken",
  "e",
  "exp",
  "expiration",
  "expire",
  "expires",
  "expiresat",
  "expiresin",
  "expiry",
  "hmac",
  "jwt",
  "keypairid",
  "policy",
  "sig",
  "signature",
  "signed",
  "st",
  "t",
  "token",
]);

export function hasLikelyExpiringPlaybackCredentials(value?: string) {
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return [...url.searchParams.keys()].some((key) => {
    const normalized = key.toLocaleLowerCase();
    const compact = normalized.replaceAll(/[-_.]/g, "");
    return (
      credentialKeys.has(normalized) ||
      credentialKeys.has(compact) ||
      ["token", "signature", "expires", "expiry"].some(
        (fragment) =>
          normalized.includes(fragment) || compact.includes(fragment),
      )
    );
  });
}

export function streamContentKey(item: Item, episode?: Episode) {
  return episode
    ? `${item.type}|${item.id}|s${episode.season}|e${episode.episode}|${episode.id}`
    : `${item.type}|${item.id}`;
}

const linkKey = (contentKey: string) =>
  `tiktak:stream-link:${encodeURIComponent(contentKey)}`;
const bingeKey = (contentId: string) =>
  `tiktak:binge-group:${encodeURIComponent(contentId)}`;

export function saveStreamLink(contentKey: string, stream: Stream) {
  if (!stream.url || hasLikelyExpiringPlaybackCredentials(stream.url)) {
    removeStreamLink(contentKey);
    return;
  }
  const entry: CachedStreamLink = { stream, cachedAt: Date.now() };
  localStorage.setItem(linkKey(contentKey), JSON.stringify(entry));
}

export function readStreamLink(contentKey: string, maxAgeHours: number) {
  if (maxAgeHours <= 0) return undefined;
  const key = linkKey(contentKey);
  try {
    const entry = JSON.parse(
      localStorage.getItem(key) || "null",
    ) as CachedStreamLink | null;
    if (
      !entry?.stream?.url ||
      entry.cachedAt <= 0 ||
      Date.now() - entry.cachedAt > maxAgeHours * 3_600_000 ||
      hasLikelyExpiringPlaybackCredentials(entry.stream.url)
    ) {
      localStorage.removeItem(key);
      return undefined;
    }
    return entry.stream;
  } catch {
    localStorage.removeItem(key);
    return undefined;
  }
}

export function removeStreamLink(contentKey: string) {
  localStorage.removeItem(linkKey(contentKey));
}

export function saveBingeGroup(contentId: string, bingeGroup?: string) {
  const value = bingeGroup?.trim();
  if (value) localStorage.setItem(bingeKey(contentId), value);
}

export function readBingeGroup(contentId: string) {
  return localStorage.getItem(bingeKey(contentId))?.trim() || undefined;
}
