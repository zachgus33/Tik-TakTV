import { getService, serviceRequest } from "./connection";

export type YouTubeKind = "video" | "music";

export type YouTubeSelection = {
  videoId?: string;
  playlistId?: string;
  kind?: YouTubeKind;
  title: string;
  channel?: string;
  thumbnail?: string;
};

export type SponsorSegment = {
  start: number;
  end: number;
  category: string;
};

export type YouTubePlayback = {
  type: "progressive" | "hls" | "audio";
  url: string;
  mimeType: string;
};

export type YouTubeAccount = {
  configured: boolean;
  connected: boolean;
  channel?: { title?: string; thumbnails?: Record<string, { url?: string }> };
  subscriptions?: { id: string; title: string; thumbnail?: string }[];
  playlists?: (YouTubeSelection & { itemCount?: number })[];
  activity?: YouTubeSelection[];
  videoFeed?: YouTubeSelection[];
  musicFeed?: YouTubeSelection[];
  recentFeed?: YouTubeSelection[];
  subscriptionFeed?: YouTubeSelection[];
  historyFeed?: YouTubeSelection[];
};

async function youtubeAccountRequest<T>(path: string, body: unknown = {}) {
  const response = await serviceRequest(path, body);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok && response.status !== 202)
    throw new Error(data.error ?? "YouTube account request failed.");
  return { response, data };
}

export async function youtubeAccount(
  summary = false,
  options: { refresh?: boolean; recentVideoIds?: string[] } = {},
) {
  return (
    await youtubeAccountRequest<YouTubeAccount>("/youtube/account", { summary, ...options })
  ).data;
}

export async function startYouTubeDeviceSignIn() {
  return (
    await youtubeAccountRequest<{
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
      interval: number;
    }>("/youtube/device/start")
  ).data;
}

export async function pollYouTubeDeviceSignIn() {
  const result = await youtubeAccountRequest<{
    connected?: boolean;
    pending?: boolean;
    interval?: number;
  }>("/youtube/device/poll");
  return { status: result.response.status, ...result.data };
}

export async function disconnectYouTube() {
  return (
    await youtubeAccountRequest<{ connected: boolean }>("/youtube/disconnect")
  ).data;
}

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
  channelId?: string,
): Promise<YouTubeSelection[]> {
  const response = await serviceRequest(
    "/youtube/search",
    { query: query.trim(), kind, channelId },
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

export async function resolveYouTubePlaylist(
  selection: YouTubeSelection,
): Promise<YouTubeSelection> {
  if (!selection.playlistId || selection.videoId) return selection;
  const { data } = await youtubeAccountRequest<{
    selection?: YouTubeSelection;
  }>("/youtube/playlist", { playlistId: selection.playlistId });
  if (!data.selection?.videoId)
    throw new Error("This playlist does not contain a playable video.");
  return { ...selection, ...data.selection };
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

export async function resolveYouTubePlayback(
  videoId: string,
  kind: YouTubeKind,
  signal?: AbortSignal,
): Promise<YouTubePlayback> {
  const response = await serviceRequest(
    "/youtube/playback",
    { videoId, kind },
    signal,
  );
  const data = (await response.json().catch(() => ({}))) as {
    playback?: YouTubePlayback;
    error?: string;
  };
  if (!response.ok || !data.playback?.url)
    throw new Error(
      data.error ?? "A compatible YouTube stream could not be resolved.",
    );
  const service = getService();
  if (!service) throw new Error("TikTak playback service is not connected.");
  return {
    ...data.playback,
    url: new URL(data.playback.url, service.url).href,
  };
}
