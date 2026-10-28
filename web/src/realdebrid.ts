import { safeUrl } from "./api";
import { sourceFetch } from "./connection";
import { quality, streamQuality } from "./stream-selection";
import type { Episode, Stream } from "./types";

const base = "https://api.real-debrid.com/rest/1.0";

type RealDebridFile = {
  id: number;
  path: string;
  bytes?: number;
  selected?: number;
};

type TorrentInfo = {
  id: string;
  status?: string;
  files?: RealDebridFile[];
  links?: string[];
};

async function request<T>(
  key: string,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await sourceFetch(
    `${base}${path}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${key.trim()}`,
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
    throw new Error("Real-Debrid rejected this API key.");
  if (response.status === 429)
    throw new Error("Real-Debrid rate limit reached. Try again shortly.");
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error || `Real-Debrid returned HTTP ${response.status}.`,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export async function validateRealDebridKey(key: string) {
  if (!key.trim()) throw new Error("Enter your Real-Debrid API key.");
  await request(key, "/user");
}

function selectFile(
  files: RealDebridFile[],
  stream: Stream,
  episode?: Episode,
) {
  const videos = files.filter(
    (file) =>
      /\.(?:mp4|mkv|m4v|webm|avi|mov|ts)$/i.test(file.path) &&
      !/\bsample\b/i.test(file.path),
  );
  const eligible = (file: RealDebridFile) =>
    (quality(file.path) || streamQuality(stream)) >= 720;
  if (episode) {
    const pattern = new RegExp(
      `(?:s0*${episode.season}[ ._-]*e0*${episode.episode}(?!\\d)|(?:^|\\D)0*${episode.season}x0*${episode.episode}(?!\\d))`,
      "i",
    );
    const matches = videos.filter(
      (file) => pattern.test(file.path) && eligible(file),
    );
    return matches.sort((a, b) => quality(b.path) - quality(a.path))[0];
  }
  const filename = stream.behaviorHints?.filename
    ?.split(/[\\/]/)
    .pop()
    ?.toLowerCase();
  const exact = filename
    ? videos.find(
        (file) => file.path.split(/[\\/]/).pop()?.toLowerCase() === filename,
      )
    : undefined;
  if (exact && eligible(exact)) return exact;
  if (stream.fileIdx != null) {
    const fileIdx = stream.fileIdx;
    const indexed = videos.find(
      (file) => file.id === fileIdx || file.id === fileIdx + 1,
    );
    if (indexed && eligible(indexed)) return indexed;
  }
  const high = videos
    .filter(eligible)
    .sort((a, b) => quality(b.path) - quality(a.path));
  return high.length === 1 ? high[0] : undefined;
}

export async function resolveRealDebrid(
  key: string,
  stream: Stream,
  episode?: Episode,
  signal?: AbortSignal,
) {
  const hash = stream.infoHash?.trim().toLowerCase();
  if (!hash || !/^[a-f0-9]{40}$/.test(hash))
    throw new Error(
      "This torrent result has no supported BitTorrent info hash.",
    );
  const availability = await request<
    Record<string, { rd?: unknown[] } | undefined>
  >(key, `/torrents/instantAvailability/${hash}`, { signal });
  if (!availability[hash]?.rd?.length)
    throw new Error(
      "This torrent is not cached in Real-Debrid. Choose an instant/cached result.",
    );
  const magnet = new FormData();
  magnet.set("magnet", `magnet:?xt=urn:btih:${hash}`);
  const created = await request<{ id: string }>(key, "/torrents/addMagnet", {
    method: "POST",
    body: magnet,
    signal,
  });
  let info = await request<TorrentInfo>(key, `/torrents/info/${created.id}`, {
    signal,
  });
  const selected = selectFile(info.files ?? [], stream, episode);
  if (!selected)
    throw new Error(
      episode
        ? "Real-Debrid could not match this episode inside the torrent. Choose another result."
        : "Choose a stream that identifies one playable 720p-or-higher file.",
    );
  const selection = new FormData();
  selection.set("files", String(selected.id));
  await request<unknown>(key, `/torrents/selectFiles/${created.id}`, {
    method: "POST",
    body: selection,
    signal,
  });
  info = await request<TorrentInfo>(key, `/torrents/info/${created.id}`, {
    signal,
  });
  const restricted = info.links?.[0];
  if (!restricted)
    throw new Error(
      "This torrent is not ready in Real-Debrid. Choose an instant/cached result.",
    );
  const form = new FormData();
  form.set("link", restricted);
  const unrestricted = await request<{ download?: string }>(
    key,
    "/unrestrict/link",
    { method: "POST", body: form, signal },
  );
  const url = safeUrl(unrestricted.download);
  if (!url) throw new Error("Real-Debrid did not return a secure video link.");
  return { url, filename: selected.path };
}
