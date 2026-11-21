import { sourceFetch } from "./connection";
import {
  streamDescriptor,
  type StreamBadgeFilter,
  type StreamBadgeImport,
  type StreamPreferences,
} from "./stream-selection";
import type { Stream } from "./types";

function compilePattern(pattern: string) {
  const caseInsensitive = pattern.includes("(?i)");
  const source = pattern.replaceAll("(?i)", "");
  try {
    return new RegExp(source, caseInsensitive ? "i" : undefined);
  } catch {
    return undefined;
  }
}

function usableFilter(value: unknown): StreamBadgeFilter | undefined {
  if (!value || typeof value !== "object") return undefined;
  const filter = value as Record<string, unknown>;
  const name = String(filter.name ?? "").trim();
  const pattern = String(filter.pattern ?? "").trim();
  if (!name || !pattern || !compilePattern(pattern)) return undefined;
  return {
    id: String(filter.id ?? "") || undefined,
    groupId: String(filter.groupId ?? "") || undefined,
    name,
    pattern,
    imageURL: String(filter.imageURL ?? "") || undefined,
    isEnabled: filter.isEnabled !== false,
    tagColor: String(filter.tagColor ?? "") || undefined,
    textColor: String(filter.textColor ?? "") || undefined,
    borderColor: String(filter.borderColor ?? "") || undefined,
  };
}

export async function importStreamBadges(
  sourceUrl: string,
): Promise<StreamBadgeImport> {
  const url = new URL(sourceUrl.trim());
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Use an HTTP or HTTPS badge-rules URL.");
  const response = await sourceFetch(url.href, {}, true);
  if (!response.ok)
    throw new Error(`Badge rules returned HTTP ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  const filters = Array.isArray(payload.filters)
    ? payload.filters.map(usableFilter).filter(Boolean)
    : [];
  if (!filters.length)
    throw new Error("Badge rules did not contain any usable filters.");
  return {
    sourceUrl: url.href,
    filters: filters as StreamBadgeFilter[],
    groups: Array.isArray(payload.groups)
      ? payload.groups
          .filter((group) => group && typeof group === "object")
          .map((group) => {
            const value = group as Record<string, unknown>;
            return {
              id: String(value.id ?? "") || undefined,
              name: String(value.name ?? "") || undefined,
              color: String(value.color ?? "") || undefined,
            };
          })
      : [],
    isActive: true,
  };
}

function fileSizeBadge(stream: Stream) {
  const match = /(?:^|\s)([\d.]+)\s*(GB|MB)(?:\s|$)/i.exec(
    streamDescriptor(stream),
  );
  if (!match) return undefined;
  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${match[2].toUpperCase()}`;
}

export function streamBadgeNames(
  stream: Stream,
  preferences: StreamPreferences,
) {
  const candidates = [
    stream.behaviorHints?.filename,
    stream.name,
    stream.title,
    stream.addonName,
    stream.url,
    streamDescriptor(stream),
  ]
    .filter(Boolean)
    .map(String);
  const names: string[] = [];
  for (const badgeImport of preferences.streamBadgeImports.filter(
    (entry) => entry.isActive,
  ))
    for (const filter of badgeImport.filters) {
      if (filter.isEnabled === false) continue;
      const regex = compilePattern(filter.pattern);
      if (regex && candidates.some((candidate) => regex.test(candidate)))
        names.push(filter.name);
    }
  if (preferences.showFileSizeBadges) {
    const size = fileSizeBadge(stream);
    if (size) names.push(size);
  }
  if (preferences.showAddonNameBadge && stream.addonName)
    names.push(stream.addonName);
  return [...new Set(names)];
}
