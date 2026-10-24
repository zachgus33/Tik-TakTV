import { sourceFetch } from "./connection";
import { safeUrl } from "./api";
import type { Episode, Stream } from "./types";
import { quality, streamQuality } from "./stream-selection";

const base = "https://api.torbox.app/v1/api";
export type TorboxFile = {
  id: number;
  name: string;
  short_name?: string;
  mimetype?: string;
  size?: number;
};
type Torrent = {
  id: number;
  hash?: string;
  files?: TorboxFile[];
  download_finished?: boolean;
  download_present?: boolean;
};
export async function torboxRequest<T>(
  key: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) abort();
  try {
    const response = await sourceFetch(
      `${base}${path}`,
      {
        ...options,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key}`,
          Accept: "application/json",
          ...options.headers,
        },
        credentials: "omit",
        cache: "no-store",
        referrerPolicy: "no-referrer",
      },
      true,
    );
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "TorBox rejected this API key or your plan does not allow this request.",
      );
    if (response.status === 429)
      throw new Error(
        "TorBox rate limit reached. Wait a moment before trying again.",
      );
    if (!response.ok)
      throw new Error(
        `TorBox returned HTTP ${response.status}. Try again shortly.`,
      );
    const body = (await response.json()) as {
      success: boolean;
      data: T;
      error?: string;
    };
    if (body.success !== true)
      throw new Error(
        body.error?.includes("CACHED")
          ? "This torrent is not cached in TorBox. Choose a cached result."
          : "TorBox could not prepare this stream. Check its availability in your account.",
      );
    return body.data;
  } catch (error) {
    if (options.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    if (controller.signal.aborted)
      throw new Error("TorBox took too long to respond. Please retry.");
    if (error instanceof TypeError)
      throw new Error(
        "TorBox blocks direct browser API requests. Connect your private playback service in Settings, or use Torrentio configured with TorBox. This is a browser connection error, not evidence that your API key is wrong.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
export async function validateTorboxKey(key: string) {
  if (!key.trim()) throw new Error("Enter your TorBox API key.");
  await torboxRequest(key.trim(), "/user/me");
}
export function selectTorboxFile(
  files: TorboxFile[],
  stream: Stream,
  episode?: Episode,
): TorboxFile | undefined {
  const videos = files.filter(
    (f) =>
      (f.mimetype?.startsWith("video/") ||
        /\.(mp4|mkv|m4v|webm|avi|mov|ts)$/i.test(f.name)) &&
      !/\bsample\b/i.test(f.name),
  );
  const eligible = (f: TorboxFile) =>
    (quality(f.name) || streamQuality(stream)) >= 720;
  const filename = stream.behaviorHints?.filename
    ?.split(/[\\/]/)
    .pop()
    ?.toLowerCase();
  if (filename) {
    const exact = videos.find(
      (f) =>
        (f.short_name ?? f.name.split(/[\\/]/).pop())?.toLowerCase() ===
        filename,
    );
    if (exact && !episode && eligible(exact)) return exact;
  }
  if (episode) {
    const pattern = new RegExp(
      `(?:s0*${episode.season}[ ._-]*e0*${episode.episode}(?!\\d)|(?:^|\\D)0*${episode.season}x0*${episode.episode}(?!\\d))`,
      "i",
    );
    const matches = videos.filter((f) => pattern.test(f.name));
    if (matches.length === 1 && eligible(matches[0])) return matches[0];
    const high = matches
      .filter((f) => quality(f.name) >= 720)
      .sort((a, b) => quality(b.name) - quality(a.name));
    if (high.length) return high[0];
    return undefined;
  }
  const high = videos
    .filter((f) => quality(f.name) >= 720 && !/\bsample\b/i.test(f.name))
    .sort((a, b) => quality(b.name) - quality(a.name));
  if (high.length === 1) return high[0];
  if (
    !episode &&
    high.length > 1 &&
    high.every((f) => !/s\d+e\d+/i.test(f.name)) &&
    new Set(
      high.map((f) =>
        f.name
          .replace(/(?:720|1080|1440|2160|4320)[pi]?|4k|8k|uhd/gi, "")
          .toLowerCase(),
      ),
    ).size === 1
  )
    return high[0];
  // Stremio fileIdx is a torrent index; TorBox file IDs are not guaranteed to match it.
  // Never silently pick an arbitrary episode from a multi-file pack.
  return videos.length === 1 && eligible(videos[0]) ? videos[0] : undefined;
}
export async function prepareTorbox(
  key: string,
  stream: Stream,
  episode?: Episode,
  signal?: AbortSignal,
): Promise<{ torrentId: number; files: TorboxFile[]; selected?: TorboxFile }> {
  const hash = stream.infoHash?.trim().toLowerCase();
  if (!hash || !/^[a-f0-9]{40}$/.test(hash))
    throw new Error(
      "This torrent result has no supported BitTorrent info hash.",
    );
  // Matches the Enhanced native resolver: adding a cached torrent is only done on explicit Play.
  const form = new FormData();
  form.set("magnet", `magnet:?xt=urn:btih:${hash}`);
  form.set("add_only_if_cached", "true");
  form.set("allow_zip", "false");
  const created = await torboxRequest<{ torrent_id?: number; id?: number }>(
    key,
    "/torrents/createtorrent",
    { method: "POST", body: form, signal },
  );
  const torrentId = created.torrent_id ?? created.id;
  if (torrentId == null) throw new Error("TorBox did not return a torrent ID.");
  const result = await torboxRequest<Torrent | Torrent[]>(
    key,
    `/torrents/mylist?${new URLSearchParams({ id: String(torrentId), bypass_cache: "true" })}`,
    { signal },
  );
  const torrent = Array.isArray(result)
    ? result.find((t) => t.id === torrentId)
    : result;
  const files = torrent?.files ?? [];
  if (!files.length)
    throw new Error(
      "TorBox is still preparing this torrent. Try the stream again in a moment.",
    );
  return {
    torrentId,
    files,
    selected: selectTorboxFile(files, stream, episode),
  };
}
export async function torboxLink(
  key: string,
  torrentId: number,
  fileId: number,
  signal?: AbortSignal,
): Promise<string> {
  const query = new URLSearchParams({
    token: key,
    torrent_id: String(torrentId),
    file_id: String(fileId),
    zip_link: "false",
    redirect: "false",
    append_name: "true",
  });
  const link = await torboxRequest<string>(
    key,
    `/torrents/requestdl?${query}`,
    { signal },
  );
  const url = safeUrl(link);
  if (!url) throw new Error("TorBox did not return a secure video link.");
  return url;
}
