import { serviceRequest } from "./connection";

export type YouTubeKind = "video" | "music";

export type YouTubeSelection = {
  videoId?: string;
  playlistId?: string;
  title: string;
  channel?: string;
  thumbnail?: string;
};

export type SponsorSegment = {
  start: number;
  end: number;
  category: string;
};

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const playlistIdPattern = /^[A-Za-z0-9_-]{10,64}$/;

export function parseYouTubeSelection(value: string): YouTubeSelection | null {
  const input = value.trim();
  if (videoIdPattern.test(input)) return { videoId: input, title: input };
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLocaleLowerCase();
  if (
    ![
      "youtube.com",
      "m.youtube.com",
      "music.youtube.com",
      "youtu.be",
      "youtube-nocookie.com",
    ].includes(host)
  )
    return null;
  const path = url.pathname.split("/").filter(Boolean);
  const candidate =
    host === "youtu.be"
      ? path[0]
      : path[0] === "shorts" || path[0] === "embed" || path[0] === "live"
        ? path[1]
        : url.searchParams.get("v");
  const playlist = url.searchParams.get("list") ?? undefined;
  const videoId =
    candidate && videoIdPattern.test(candidate) ? candidate : undefined;
  const playlistId =
    playlist && playlistIdPattern.test(playlist) ? playlist : undefined;
  if (!videoId && !playlistId) return null;
  return { videoId, playlistId, title: videoId ?? "YouTube playlist" };
}

export async function searchYouTube(
  query: string,
  kind: YouTubeKind,
  signal?: AbortSignal,
): Promise<YouTubeSelection[]> {
  const response = await serviceRequest(
    "/youtube/search",
    { query: query.trim(), kind },
    signal,
  );
  const data = (await response.json().catch(() => ({}))) as {
    results?: YouTubeSelection[];
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error ?? "YouTube search is temporarily unavailable.");
  return data.results ?? [];
}

export async function sponsorSegments(
  videoId: string,
  signal?: AbortSignal,
): Promise<SponsorSegment[]> {
  const response = await serviceRequest("/sponsorblock", { videoId }, signal);
  if (response.status === 404) return [];
  const data = (await response.json().catch(() => ({}))) as {
    segments?: SponsorSegment[];
  };
  return response.ok ? (data.segments ?? []) : [];
}
