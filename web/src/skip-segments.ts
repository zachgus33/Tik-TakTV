import { sourceFetch } from "./connection";

export type SkipSegment = {
  startTime: number;
  endTime: number;
  type: "intro" | "recap" | "outro";
  provider: "introdb";
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

const cache = new Map<string, SkipSegment[]>();

function seconds(value: IntroDbSegment, unit: "start" | "end") {
  const direct = value[`${unit}_sec`];
  if (typeof direct === "number") return direct;
  const milliseconds = value[`${unit}_ms`];
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

export async function introDbSkipSegments(
  contentId: string,
  season: number,
  episode: number,
  signal?: AbortSignal,
): Promise<SkipSegment[]> {
  const imdbId = contentId.match(/tt\d+/i)?.[0]?.toLowerCase();
  if (!imdbId || season < 0 || episode < 1) return [];
  const key = `${imdbId}:${season}:${episode}`;
  const saved = cache.get(key);
  if (saved) return saved;
  const query = new URLSearchParams({
    imdb_id: imdbId,
    season: String(season),
    episode: String(episode),
  });
  try {
    const response = await sourceFetch(
      `https://api.introdb.app/segments?${query}`,
      { signal, cache: "force-cache" },
    );
    if (!response.ok) return [];
    const data = (await response.json()) as IntroDbResponse;
    const segments = [
      normalizeSegment(data.intro, "intro"),
      normalizeSegment(data.recap, "recap"),
      normalizeSegment(data.outro, "outro"),
    ].filter((segment): segment is SkipSegment => segment != null);
    cache.set(key, segments);
    return segments;
  } catch {
    return [];
  }
}

export function clearSkipSegmentCache() {
  cache.clear();
}
