import type { Addon } from "./types";

export type SavedAddonRow = { url: string; name?: string | null; enabled?: boolean | null };

export function manifestUrl(base: string) {
  const url = new URL(base.trim());
  if (!url.pathname.endsWith("/manifest.json"))
    url.pathname = `${url.pathname.replace(/\/$/, "")}/manifest.json`;
  return url.href;
}

function addonBaseUrl(manifest: string) {
  try {
    const url = new URL(manifest);
    url.pathname = url.pathname.replace(/\/manifest\.json$/, "").replace(/\/$/, "");
    return url.origin + url.pathname.replace(/\/$/, "") + url.search;
  } catch {
    return undefined;
  }
}

export function cleanedAddonRows<T extends SavedAddonRow>(rows: T[]): T[] {
  return rows.filter((row) => {
    try {
      return new URL(row.url).hostname.toLowerCase() !== "pengu.uk" &&
        String(row.name ?? "").toLowerCase() !== "penguplay";
    } catch {
      return String(row.name ?? "").toLowerCase() !== "penguplay";
    }
  });
}

export function restoreSavedAddons(
  rows: SavedAddonRow[],
  refreshed: Addon[],
  cached: Addon[] = [],
): Addon[] {
  return cleanedAddonRows(rows).flatMap((row) => {
    const base = addonBaseUrl(row.url);
    const addon = refreshed.find((item) => item.base === base) ??
      cached.find((item) => item.base === base);
    return addon ? [{ ...addon, enabled: row.enabled !== false }] : [];
  });
}
