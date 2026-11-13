import type { Item, Progress } from "./types";
import type { YouTubeSelection } from "./youtube";

const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;
export const youtubeHistoryKey = "tiktak:youtube-history";

export function readYouTubeHistory(): YouTubeSelection[] {
  try {
    const value = JSON.parse(localStorage.getItem(youtubeHistoryKey) ?? "[]");
    return Array.isArray(value)
      ? value.filter((entry) => entry && typeof entry === "object").slice(0, 12)
      : [];
  } catch {
    return [];
  }
}

export type YouTubeResumeRequest = {
  videoId: string;
  seconds: number;
  title: string;
  thumbnail?: string;
};

export type YouTubePlaybackProgress = YouTubeResumeRequest & {
  duration: number;
};

export function youtubeVideoIdFromItem(item: Pick<Item, "id">): string | null {
  const id = item.id.startsWith("youtube:") ? item.id.slice(8) : "";
  return videoIdPattern.test(id) ? id : null;
}

export function youtubeVideoIdFromProgressRow(
  row: Record<string, unknown>,
): string | null {
  const contentId = String(row.content_id ?? "");
  const prefixed = youtubeVideoIdFromItem({ id: contentId });
  if (prefixed) return prefixed;
  const videoId = String(row.video_id ?? "");
  return row.content_type === "youtube" && videoIdPattern.test(videoId)
    ? videoId
    : null;
}

export function youtubeProgressItem(
  videoId: string,
  previous?: Item,
  history?: { videoId?: string; title?: string; thumbnail?: string }[],
): Item {
  const saved = history?.find((entry) => entry.videoId === videoId);
  const title = [saved?.title, previous?.name]
    .find(
      (value) =>
        value &&
        value !== videoId &&
        value !== `youtube:${videoId}` &&
        value !== "YouTube video",
    ) ?? "YouTube video";
  return {
    id: `youtube:${videoId}`,
    name: title,
    type: "movie",
    source: "addon",
    provider: "tiktak:youtube",
    poster:
      saved?.thumbnail ??
      previous?.poster ??
      `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  };
}

export function normalizeYouTubeProgress(
  progress: Progress[],
  history: YouTubeSelection[] = readYouTubeHistory(),
): Progress[] {
  return progress.map((entry) => {
    const videoId = youtubeVideoIdFromItem(entry.item);
    return videoId
      ? {
          ...entry,
          item: youtubeProgressItem(videoId, entry.item, history),
        }
      : entry;
  });
}
