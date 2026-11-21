import { sourceFetch } from "./connection";
import { simklWebClientId } from "./ExternalTrackingSettings";

export type SkipSegment = {
  startTime: number;
  endTime: number;
  type: "intro" | "recap" | "outro";
  provider: "introdb" | "aniskip" | "anime-skip";
};

export type SkipProviderSettings = {
  animeSkipEnabled: boolean;
  animeSkipClientId: string;
};

type IntroDbSegment = {
  start_sec?: number;
  end_sec?: number;
  start_ms?: number;
  end_ms?: number;
};

type IntroDbResponse = {
  intro?: IntroDbSegment;
  recap?: IntroDbSegment;
  outro?: IntroDbSegment;
};

type AnimeIds = { mal?: string; anilist?: string };

const segmentCache = new Map<string, SkipSegment[]>();
const idCache = new Map<string, AnimeIds>();
const introDbKey = "tiktak:introdb-api-key";

function seconds(value: IntroDbSegment, unit: "start" | "end") {
  const direct = unit === "start" ? value.start_sec : value.end_sec;
  if (typeof direct === "number") return direct;
  const milliseconds = unit === "start" ? value.start_ms : value.end_ms;
  return typeof milliseconds === "number" ? milliseconds / 1_000 : undefined;
}

function normalizeSegment(
  value: IntroDbSegment | undefined,
  type: SkipSegment["type"],
): SkipSegment | null {
  if (!value) return null;
  const startTime = seconds(value, "start");
  const endTime = seconds(value, "end");
  if (
    startTime == null ||
    endTime == null ||
    !Number.isFinite(startTime) ||
    !Number.isFinite(endTime) ||
    endTime <= startTime
  )
    return null;
  return { startTime, endTime, type, provider: "introdb" };
}

function category(type: string): SkipSegment["type"] | null {
  const normalized = type.toLowerCase();
  if (["intro", "op", "mixed-op", "new intro"].includes(normalized))
    return "intro";
  if (["outro", "ed", "mixed-ed", "credits", "ending"].includes(normalized))
    return "outro";
  return normalized === "recap" ? "recap" : null;
}

function mergeByPriority(...providers: SkipSegment[][]) {
  const selected = new Map<SkipSegment["type"], SkipSegment>();
  providers.flat().forEach((segment) => {
    if (!selected.has(segment.type)) selected.set(segment.type, segment);
  });
  return [...selected.values()].sort(
    (left, right) => left.startTime - right.startTime,
  );
}

async function json<T>(url: string, signal?: AbortSignal): Promise<T | null> {
  try {
    const response = await sourceFetch(url, { signal, cache: "force-cache" });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function introDbSkipSegments(
  contentId: string,
  season: number,
  episode: number,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  const imdbId = contentId.match(/tt\d+/i)?.[0]?.toLowerCase();
  if (!imdbId || season < 0 || episode < 1) return [];
  const query = new URLSearchParams({
    imdb_id: imdbId,
    season: String(season),
    episode: String(episode),
  });
  const data = await json<IntroDbResponse>(
    `https://api.introdb.app/segments?${query}`,
    signal,
  );
  if (!data) return [];
  return [
    normalizeSegment(data.intro, "intro"),
    normalizeSegment(data.recap, "recap"),
    normalizeSegment(data.outro, "outro"),
  ].filter((segment): segment is SkipSegment => segment != null);
}

async function resolveAnimeIds(
  contentId: string,
  signal?: AbortSignal,
): Promise<AnimeIds> {
  const directMal = /^mal:(\d+)$/i.exec(contentId)?.[1];
  if (directMal) return { mal: directMal };
  const directAniList = /^anilist:(\d+)$/i.exec(contentId)?.[1];
  if (directAniList) return { anilist: directAniList };
  const imdb = contentId.match(/tt\d+/i)?.[0]?.toLowerCase();
  if (!imdb) return {};
  const cached = idCache.get(imdb);
  if (cached) return cached;
  const common = new URLSearchParams({
    client_id: simklWebClientId,
    "app-name": "TikTak TV Web",
    "app-version": "1.0",
  });
  const search = await json<
    Array<{ type?: string; ids?: { simkl?: number | string } }>
  >(`https://api.simkl.com/search/id?imdb=${imdb}&${common}`, signal);
  const first = search?.[0];
  const simkl = first?.ids?.simkl;
  if (!simkl) return {};
  const mediaType =
    first?.type === "movie"
      ? "movies"
      : first?.type === "show"
        ? "tv"
        : "anime";
  const details = await json<{
    ids?: { mal?: number | string; anilist?: number | string };
  }>(
    `https://api.simkl.com/${mediaType}/${simkl}?extended=full&${common}`,
    signal,
  );
  const resolved = {
    mal: details?.ids?.mal ? String(details.ids.mal) : undefined,
    anilist: details?.ids?.anilist ? String(details.ids.anilist) : undefined,
  };
  idCache.set(imdb, resolved);
  return resolved;
}

async function aniSkipSegments(
  malId: string | undefined,
  episode: number,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  if (!malId) return [];
  const response = await json<{
    found?: boolean;
    results?: Array<{
      interval?: { startTime?: number; endTime?: number };
      skipType?: string;
    }>;
  }>(
    `https://api.aniskip.com/v2/skip-times/${encodeURIComponent(malId)}/${episode}?types=op,ed,recap,mixed-op,mixed-ed&episodeLength=0`,
    signal,
  );
  if (!response?.found) return [];
  return (response.results ?? []).flatMap((result) => {
    const type = category(result.skipType ?? "");
    const startTime = result.interval?.startTime;
    const endTime = result.interval?.endTime;
    return type &&
      typeof startTime === "number" &&
      typeof endTime === "number" &&
      endTime > startTime
      ? [{ startTime, endTime, type, provider: "aniskip" as const }]
      : [];
  });
}

async function animeSkipQuery<T>(
  clientId: string,
  query: string,
  signal?: AbortSignal,
): Promise<T | null> {
  if (!clientId.trim()) return null;
  try {
    const response = await sourceFetch("https://api.anime-skip.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-ID": clientId.trim(),
      },
      body: JSON.stringify({ query }),
      signal,
    });
    return response.ok ? ((await response.json()) as T) : null;
  } catch {
    return null;
  }
}

async function animeSkipSegments(
  anilistId: string | undefined,
  episode: number,
  season: number,
  clientId: string,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  if (!anilistId || !clientId.trim()) return [];
  const shows = await animeSkipQuery<{
    data?: { findShowsByExternalId?: Array<{ id: string }> };
  }>(
    clientId,
    `{ findShowsByExternalId(service: ANILIST, serviceId: "${anilistId}") { id } }`,
    signal,
  );
  for (const show of shows?.data?.findShowsByExternalId ?? []) {
    const data = await animeSkipQuery<{
      data?: {
        findEpisodesByShowId?: Array<{
          season?: string;
          number?: string;
          timestamps?: Array<{ at: number; type?: { name?: string } }>;
        }>;
      };
    }>(
      clientId,
      `{ findEpisodesByShowId(showId: "${show.id}") { season number timestamps { at type { name } } } }`,
      signal,
    );
    const match = data?.data?.findEpisodesByShowId?.find(
      (candidate) =>
        Number(candidate.number) === episode &&
        (!candidate.season || Number(candidate.season) === season),
    );
    const timestamps = [...(match?.timestamps ?? [])].sort(
      (a, b) => a.at - b.at,
    );
    const segments = timestamps.flatMap((timestamp, index) => {
      const type = category(timestamp.type?.name ?? "");
      const endTime = timestamps[index + 1]?.at ?? Number.MAX_SAFE_INTEGER;
      return type && Number.isFinite(timestamp.at) && endTime > timestamp.at
        ? [
            {
              startTime: timestamp.at,
              endTime,
              type,
              provider: "anime-skip" as const,
            },
          ]
        : [];
    });
    if (segments.length) return segments;
  }
  return [];
}

export async function skipSegments(
  contentId: string,
  season: number,
  episode: number,
  settings: SkipProviderSettings,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  if (episode < 1) return [];
  const cacheKey = `${contentId}:${season}:${episode}:${settings.animeSkipEnabled}:${settings.animeSkipClientId}`;
  const cached = segmentCache.get(cacheKey);
  if (cached) return cached;
  const idsPromise = resolveAnimeIds(contentId, signal);
  const introPromise = introDbSkipSegments(contentId, season, episode, signal);
  const ids = await idsPromise;
  const [intro, animeSkip, aniSkip] = await Promise.all([
    introPromise,
    settings.animeSkipEnabled
      ? animeSkipSegments(
          ids.anilist,
          episode,
          season,
          settings.animeSkipClientId,
          signal,
        )
      : [],
    aniSkipSegments(ids.mal, episode, signal),
  ]);
  const merged = mergeByPriority(intro, animeSkip, aniSkip);
  segmentCache.set(cacheKey, merged);
  return merged;
}

export function readIntroDbApiKey() {
  return localStorage.getItem(introDbKey)?.trim() ?? "";
}

export function saveIntroDbApiKey(value: string) {
  const normalized = value.trim();
  if (normalized) localStorage.setItem(introDbKey, normalized);
  else localStorage.removeItem(introDbKey);
  return normalized;
}

export async function verifyIntroDbApiKey(
  apiKey: string,
  signal?: AbortSignal,
) {
  const response = await sourceFetch("https://api.introdb.app/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: "{}",
    signal,
  });
  return response.ok || response.status === 400;
}

export async function submitIntroDbSegment(
  contentId: string,
  season: number,
  episode: number,
  startTime: number,
  endTime: number,
  type: SkipSegment["type"],
  apiKey: string,
  signal?: AbortSignal,
) {
  const imdbId = contentId.match(/tt\d+/i)?.[0]?.toLowerCase();
  if (!imdbId || !apiKey.trim() || endTime <= startTime) return false;
  const response = await sourceFetch("https://api.introdb.app/submit", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      imdb_id: imdbId,
      season,
      episode,
      start_sec: startTime,
      end_sec: endTime,
      start_ms: Math.round(startTime * 1_000),
      end_ms: Math.round(endTime * 1_000),
      segment_type: type,
    }),
    signal,
  });
  if (response.ok) clearSkipSegmentCache();
  return response.ok;
}

export function clearSkipSegmentCache() {
  segmentCache.clear();
  idCache.clear();
}
