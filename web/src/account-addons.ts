import type { Addon } from "./types";
import { baseFromManifest } from "./addon-urls";

export type SavedAddonRow = { url: string; name?: string | null; enabled?: boolean | null };

function addonBaseUrl(manifest: string) {
  try {
    return baseFromManifest(manifest);
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

// Profile entry should not depend on every remote manifest answering again.
// The saved web setup already has the manifest for previously loaded add-ons;
// users can explicitly refresh those manifests from Add-ons when needed.
export function addonUrlsMissingCache(
  rows: SavedAddonRow[],
  cached: Addon[],
): string[] {
  const knownBases = new Set(cached.map((addon) => addon.base));
  return cleanedAddonRows(rows)
    .filter((row) => {
      const base = addonBaseUrl(row.url);
      return !base || !knownBases.has(base);
    })
    .map((row) => row.url);
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
