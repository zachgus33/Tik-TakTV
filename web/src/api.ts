import { sourceFetch } from "./connection";
import type {
  Addon,
  Category,
  Episode,
  Item,
  Kind,
  Manifest,
  Programme,
  Provider,
  Stream,
  Subtitle,
} from "./types";

const responseCache = new Map<string, { expires: number; value: unknown }>();
const cacheableRequest = (url: string) =>
  /\/manifest\.json(?:[?#]|$)|\/catalog\/|\/meta\//i.test(url);

export function safeUrl(value: unknown): string | undefined {
  try {
    const u = new URL(String(value));
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
function safeArtwork(value: unknown, base: string): string | undefined {
  try {
    const url = new URL(String(value ?? ""), `${base.replace(/\/$/, "")}/`);
    if (url.protocol === "http:") url.protocol = "https:";
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function normalizeServer(value: string): string {
  const url = safeUrl(value.trim());
  if (!url)
    throw new Error(
      "Use an HTTPS server address. GitHub Pages cannot connect to an insecure HTTP provider.",
    );
  const u = new URL(url);
  u.pathname = u.pathname
    .replace(/\/(player_api|get)\.php.*$/i, "")
    .replace(/\/+$/, "");
  u.search = "";
  u.hash = "";
  return u.href.replace(/\/$/, "");
}
export async function json<T>(
  url: string,
  signal?: AbortSignal,
  timeoutMs = 20000,
): Promise<T> {
  const cacheEnabled = import.meta.env.MODE !== "test" && cacheableRequest(url);
  const cached = responseCache.get(url);
  if (cacheEnabled && cached && cached.expires > Date.now())
    return cached.value as T;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const r = await sourceFetch(url, {
      signal: controller.signal,
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
    if (!r.ok)
      throw new Error(
        `The source returned HTTP ${r.status}. Check your account and try again.`,
      );
    const value = (await r.json()) as T;
    if (cacheEnabled)
      responseCache.set(url, { expires: Date.now() + 120_000, value });
    return value;
  } catch (e) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (e instanceof TypeError)
      throw new Error(
        "Cannot reach this source. Check your connection, HTTPS address, and whether the provider allows browser access (CORS). GitHub Pages cannot bypass this.",
      );
    if (controller.signal.aborted)
      throw new Error("The source took too long to respond. Please try again.");
    if (e instanceof SyntaxError)
      throw new Error(
        "The source did not return a valid API response. Check the server address.",
      );
    throw e;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
export function xtreamUrl(
  p: Provider,
  action?: string,
  params: Record<string, string> = {},
) {
  const q = new URLSearchParams({
    username: p.username,
    password: p.password,
    ...params,
  });
  if (action) q.set("action", action);
  return `${p.server}/player_api.php?${q}`;
}
export function streamUrl(
  p: Provider,
  type: Kind,
  id: string,
  extension?: string,
) {
  const ext =
    type === "live"
      ? /^[a-z0-9]+$/i.test(extension ?? "")
        ? extension
        : "ts"
      : /^[a-z0-9]+$/i.test(extension ?? "")
        ? extension
        : "mp4";
  return `${p.server}/${type === "movie" ? "movie" : type === "series" ? "series" : "live"}/${encodeURIComponent(p.username)}/${encodeURIComponent(p.password)}/${encodeURIComponent(id)}.${ext}`;
}
export async function connectProvider(
  input: Omit<Provider, "scope">,
  signal?: AbortSignal,
): Promise<Provider> {
  const server = normalizeServer(input.server);
  const p = { ...input, server, scope: "" };
  const data = await json<{
    user_info?: { auth?: number | string; status?: string };
  }>(xtreamUrl(p), signal);
  if (String(data.user_info?.auth) !== "1")
    throw new Error(
      "The provider rejected these credentials. Check your username and password.",
    );
  if (
    data.user_info?.status &&
    data.user_info.status.toLowerCase() !== "active"
  )
    throw new Error("This IPTV account is not active. Contact your provider.");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${server}|${p.username}`),
  );
  return {
    ...p,
    scope: Array.from(new Uint8Array(digest))
      .slice(0, 12)
      .map((v) => v.toString(16).padStart(2, "0"))
      .join(""),
  };
}
const resource = { live: "live", movie: "vod", series: "series" };
export async function categories(
  p: Provider,
  type: Kind,
  signal?: AbortSignal,
): Promise<Category[]> {
  const data = await json<Record<string, unknown>[]>(
    xtreamUrl(p, `get_${resource[type]}_categories`),
    signal,
  );
  if (!Array.isArray(data))
    throw new Error("The provider returned an invalid category list.");
  return data.map((x) => ({
    id: String(x.category_id),
    name: String(x.category_name ?? "Uncategorized"),
  }));
}
export async function providerItems(
  p: Provider,
  type: Kind,
  category: string,
  signal?: AbortSignal,
): Promise<Item[]> {
  const action =
    type === "series" ? "get_series" : `get_${resource[type]}_streams`;
  const data = await json<Record<string, unknown>[]>(
    xtreamUrl(p, action, category ? { category_id: category } : {}),
    signal,
  );
  if (!Array.isArray(data))
    throw new Error("The provider returned an invalid library.");
  return data
    .filter((x) => x.stream_id != null || x.series_id != null)
    .map((x) => ({
      id: String(x.stream_id ?? x.series_id),
      name: String(x.name ?? "Untitled"),
      type,
      source: "xtream",
      provider: p.scope,
      poster: safeArtwork(x.stream_icon ?? x.cover, p.server),
      background: safeUrl(
        Array.isArray(x.backdrop_path) ? x.backdrop_path[0] : x.backdrop_path,
      ),
      category: String(x.category_id ?? ""),
      epgId: String(x.epg_channel_id ?? x.tvg_id ?? ""),
      extension: String(
        x.container_extension ?? (type === "live" ? "ts" : "mp4"),
      ),
      url:
        type === "live" && typeof x.direct_source === "string"
          ? safeUrl(x.direct_source)
          : undefined,
      rating: x.rating ? String(x.rating) : undefined,
      year: String(x.year ?? x.releaseDate ?? "").slice(0, 4),
      description: String(x.plot ?? ""),
    }));
}
export async function providerDetail(
  p: Provider,
  item: Item,
  signal?: AbortSignal,
): Promise<{ item: Item; episodes: Episode[] }> {
  if (item.type === "live") return { item, episodes: [] };
  const data = await json<{
    info?: Record<string, unknown>;
    movie_data?: { container_extension?: string };
    episodes?: Record<string, Record<string, unknown>[]>;
  }>(
    xtreamUrl(p, item.type === "series" ? "get_series_info" : "get_vod_info", {
      [item.type === "series" ? "series_id" : "vod_id"]: item.id,
    }),
    signal,
  );
  const info = data.info ?? {};
  const episodes = Object.entries(data.episodes ?? {})
    .flatMap(([season, rows]) =>
      Array.isArray(rows)
        ? rows.map((row) => ({
            id: String(row.id),
            name: String(row.title ?? `Episode ${row.episode_num}`),
            season: Number(row.season ?? season),
            episode: Number(row.episode_num),
            extension: String(row.container_extension ?? "mp4"),
          }))
        : [],
    )
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
  return {
    item: {
      ...item,
      description: String(
        info.plot ?? info.description ?? item.description ?? "",
      ),
      poster: safeUrl(info.movie_image ?? info.cover) ?? item.poster,
      background:
        safeUrl(
          Array.isArray(info.backdrop_path)
            ? info.backdrop_path[0]
            : info.backdrop_path,
        ) ?? item.background,
      extension: data.movie_data?.container_extension ?? item.extension,
      runtime: info.duration ? String(info.duration) : undefined,
      genres:
        typeof info.genre === "string"
          ? info.genre.split(/[,/]/).map((s) => s.trim())
          : [],
    },
    episodes,
  };
}
export function decodeText(value: unknown): string {
  const text = String(value ?? "");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(atob(text), (c) => c.charCodeAt(0)),
    );
  } catch {
    return text;
  }
}
export async function epg(
  p: Provider,
  id: string,
  signal?: AbortSignal,
): Promise<Programme[]> {
  const data = await json<{ epg_listings?: Record<string, unknown>[] }>(
    xtreamUrl(p, "get_short_epg", { stream_id: id, limit: "12" }),
    signal,
  );
  return (data.epg_listings ?? [])
    .map((x, i) => ({
      id: String(x.id ?? i),
      title: decodeText(x.title),
      description: decodeText(x.description),
      start: Number(x.start_timestamp) * 1000,
      end: Number(x.stop_timestamp ?? x.end_timestamp) * 1000,
    }))
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end))
    .sort((a, b) => a.start - b.start);
}
export const defaultAddon: Addon = {
  base: "https://v3-cinemeta.strem.io",
  manifest: {
    id: "com.linvo.cinemeta",
    name: "Nuvio Catalog Addon",
    types: ["movie", "series"],
    resources: ["catalog", "meta"],
    catalogs: [
      {
        id: "top",
        type: "movie",
        name: "Popular movies",
        extra: [{ name: "search" }],
      },
      {
        id: "top",
        type: "series",
        name: "Popular series",
        extra: [{ name: "search" }],
      },
    ],
  },
};
export const defaultSubtitleAddon: Addon = {
  base: "https://opensubtitles-v3.strem.io",
  manifest: {
    id: "org.stremio.opensubtitlesv3",
    name: "OpenSubtitles v3",
    description: "OpenSubtitles v3 Addon for Stremio",
    types: ["movie", "series"],
    resources: ["subtitles"],
    catalogs: [],
  },
};
export const defaultAddons: Addon[] = [defaultAddon, defaultSubtitleAddon];
export async function installAddon(input: string): Promise<Addon> {
  const normalized = safeUrl(input.trim().replace(/^stremio:\/\//, "https://"));
  if (!normalized)
    throw new Error("Enter the HTTPS add-on URL supplied by your add-on.");
  const parsed = new URL(normalized);
  if (!parsed.pathname.endsWith("/manifest.json"))
    parsed.pathname = `${parsed.pathname.replace(/\/$/, "")}/manifest.json`;
  const url = parsed.href;
  const manifest = await json<Manifest>(url);
  if (!manifest.id || !manifest.name || !Array.isArray(manifest.resources))
    throw new Error("This is not a valid Stremio add-on manifest.");
  parsed.pathname = parsed.pathname.slice(0, -14);
  return { base: parsed.href.replace(/\/$/, ""), manifest };
}
export function fromMeta(meta: Record<string, unknown>, addon: Addon): Item {
  return {
    id: String(meta.id),
    name: String(meta.name ?? "Untitled"),
    type: meta.type === "series" ? "series" : "movie",
    source: "addon",
    provider: addon.base,
    poster: safeUrl(meta.poster),
    background: safeUrl(meta.background),
    description: String(meta.description ?? ""),
    year: String(meta.releaseInfo ?? meta.year ?? ""),
    released: typeof meta.released === "string" ? meta.released : undefined,
    rating: meta.imdbRating ? String(meta.imdbRating) : undefined,
    genres: Array.isArray(meta.genres) ? meta.genres.map(String) : [],
    runtime: String(meta.runtime ?? ""),
    cast: Array.isArray(meta.cast) ? meta.cast.map(String).slice(0, 12) : [],
    directors: Array.isArray(meta.director)
      ? meta.director.map(String)
      : typeof meta.director === "string"
        ? [meta.director]
        : [],
  };
}
export async function catalog(
  addon: Addon,
  type: string,
  id: string,
  search = "",
  signal?: AbortSignal,
  genre?: string,
): Promise<Item[]> {
  const parameters = [
    search ? `search=${encodeURIComponent(search)}` : "",
    genre ? `genre=${encodeURIComponent(genre)}` : "",
  ].filter(Boolean);
  const extra = parameters.length ? `/${parameters.join("&")}` : "";
  const data = await json<{ metas?: Record<string, unknown>[] }>(
    `${addon.base}/catalog/${encodeURIComponent(type)}/${encodeURIComponent(id)}${extra}.json`,
    signal,
  );
  return (data.metas ?? []).slice(0, 200).map((m) => fromMeta(m, addon));
}
export async function addonDetail(
  item: Item,
  signal?: AbortSignal,
): Promise<{ item: Item; episodes: Episode[] }> {
  if (item.id.startsWith("tmdb:")) {
    const { resolveTmdb } = await import("./tmdb");
    item = await resolveTmdb(item, signal);
  }
  const data = await json<{ meta: Record<string, unknown> }>(
    `${item.provider}/meta/${item.type}/${encodeURIComponent(item.id)}.json`,
    signal,
  );
  if (!data.meta) throw new Error("No details available from this add-on.");
  const m = data.meta;
  return {
    item: fromMeta(m, { base: item.provider!, manifest: { id: "", name: "" } }),
    episodes: (Array.isArray(m.videos) ? m.videos : [])
      .map((v) => ({
        id: String(v.id),
        name: String(v.title ?? v.name ?? `Episode ${v.episode}`),
        season: Number(v.season ?? 1),
        episode: Number(v.episode ?? 1),
        released: v.released,
      }))
      .sort((a, b) => a.season - b.season || a.episode - b.episode),
  };
}
export async function addonStreams(
  addons: Addon[],
  item: Item,
  id: string,
  signal?: AbortSignal,
) {
  const eligible = addons.filter(
    (a) =>
      a.enabled !== false &&
      a.manifest.resources?.some((r) =>
        typeof r === "string"
          ? r === "stream"
          : r.name === "stream" &&
            (!r.types?.length || r.types.includes(item.type)) &&
            (!r.idPrefixes?.length ||
              r.idPrefixes.some((p) => id.startsWith(p))),
      ),
  );
  const results = await Promise.allSettled(
    eligible.map(async (a) => {
      const data = await json<{ streams?: Stream[] }>(
        `${a.base}/stream/${item.type}/${encodeURIComponent(id)}.json`,
        signal,
        6000,
      );
      return (data.streams ?? []).map((s) => ({
        ...s,
        name: s.name ?? a.manifest.name,
      }));
    }),
  );
  return {
    streams: results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
    failed: results.filter((r) => r.status === "rejected").length,
    count: eligible.length,
    installedStreaming: addons.filter(
      (a) =>
        a.enabled !== false &&
        a.manifest.resources?.some((r) =>
          typeof r === "string" ? r === "stream" : r.name === "stream",
        ),
    ).length,
  };
}
export async function addonSubtitles(
  addons: Addon[],
  item: Item,
  id: string,
  signal?: AbortSignal,
): Promise<Subtitle[]> {
  const eligible = addons.filter(
    (a) =>
      a.enabled !== false &&
      a.manifest.resources?.some((r) =>
        typeof r === "string"
          ? r === "subtitles"
          : r.name === "subtitles" &&
            (!r.types?.length || r.types.includes(item.type)) &&
            (!r.idPrefixes?.length ||
              r.idPrefixes.some((p) => id.startsWith(p))),
      ),
  );
  const results = await Promise.allSettled(
    eligible.map(async (a) => {
      const data = await json<{ subtitles?: Subtitle[] }>(
        `${a.base}/subtitles/${item.type}/${encodeURIComponent(id)}.json`,
        signal,
      );
      return (data.subtitles ?? []).filter(
        (s) => !!safeUrl(s.url) && /^(en|eng|english)$/i.test(s.lang ?? ""),
      );
    }),
  );
  return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}
export function parsePlaylist(text: string, scope: string): Item[] {
  if (!text.trim().startsWith("#EXTM3U"))
    throw new Error("Choose a valid M3U playlist.");
  if (
    text.includes("#EXT-X-TARGETDURATION") ||
    text.includes("#EXT-X-STREAM-INF")
  )
    throw new Error(
      "This is a video manifest. Use Open stream with its HTTPS URL instead.",
    );
  let meta: { name: string; poster?: string; category?: string } | undefined;
  const items: Item[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("#EXTINF:")) {
      const attrs = Object.fromEntries(
        [...line.matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]),
      );
      meta = {
        name:
          line.match(/^#EXTINF:(?:[^",]|"[^"]*")*,(.*)$/)?.[1]?.trim() ||
          attrs["tvg-name"] ||
          "Channel",
        poster: safeUrl(attrs["tvg-logo"]),
        category: attrs["group-title"] || "Other",
      };
    } else if (line && !line.startsWith("#") && meta) {
      // Reject header hacks and insecure URLs rather than quietly dropping requirements.
      const url = line.includes("|") ? undefined : safeUrl(line);
      if (url)
        items.push({
          ...meta,
          id: String(items.length),
          source: "playlist",
          provider: scope,
          type: "live",
          url,
        });
      meta = undefined;
    }
  }
  if (!items.length)
    throw new Error(
      "No HTTPS channels found. HTTP streams and streams requiring custom headers cannot play directly from GitHub Pages.",
    );
  return items;
}
