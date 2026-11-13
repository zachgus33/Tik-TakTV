import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Agent, fetch as upstreamFetch } from "undici";

function probeAudioTracks(inputUrl, inputArgs = []) {
  return new Promise((resolve) => {
    const child = spawn(
      process.env.FFPROBE_PATH ?? "ffprobe",
      [
        "-v",
        "error",
        ...inputArgs,
        "-select_streams",
        "a",
        "-show_entries",
        "stream=index:stream_tags=language,title",
        "-of",
        "json",
        inputUrl,
      ],
      { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    );
    let output = "";
    const timer = setTimeout(() => child.kill(), 15_000);
    child.stdout.on("data", (chunk) => {
      if (output.length < 1_000_000) output += chunk;
    });
    const finish = (value) => {
      clearTimeout(timer);
      resolve(value);
    };
    child.once("error", () => finish([]));
    child.once("exit", (code) => {
      if (code) return finish([]);
      try {
        const streams = JSON.parse(output).streams ?? [];
        finish(
          streams.map((stream, audioIndex) => ({
            audioIndex,
            language:
              String(stream.tags?.language ?? "und")
                .toLowerCase()
                .replace(/[^a-z0-9-]/g, "") || "und",
            title: String(stream.tags?.title ?? "").trim(),
          })),
        );
      } catch {
        finish([]);
      }
    });
  });
}
import ipaddr from "ipaddr.js";

// Supabase's public anonymous client key; this is not a service-role secret.
const nuvioAnonKey =
  process.env.NUVIO_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";
const guideCacheDir =
  process.env.GUIDE_CACHE_DIR ?? join(tmpdir(), "tiktaktv-guides");
const guideCacheAge = Number(process.env.GUIDE_CACHE_AGE_MS ?? 6 * 60 * 60_000);

export function publicAddress(address) {
  try {
    let a = ipaddr.parse(address);
    if (a.kind() === "ipv6" && a.isIPv4MappedAddress()) a = a.toIPv4Address();
    return a.range() === "unicast";
  } catch {
    return false;
  }
}
export async function resolveTarget(input) {
  const u = new URL(input);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new Error("Invalid source address");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const found = await dns.lookup(host, { all: true });
  if (!found.length || found.some((a) => !publicAddress(a.address)))
    throw new Error("Private destinations are not allowed");
  return { u, found };
}
export async function fetchSafe(input, options = {}) {
  let current = input;
  let headers = { ...(options.headers ?? {}) };
  for (let hop = 0; hop < 6; hop++) {
    const { u, found } = await resolveTarget(current);
    const agent = new Agent({
      connect: {
        lookup(_host, opts, cb) {
          const a = found[0];
          if (opts?.all) cb(null, found);
          else cb(null, a.address, a.family);
        },
      },
    });
    let response;
    try {
      response = await upstreamFetch(u, {
        ...options,
        headers,
        redirect: "manual",
        dispatcher: agent,
      });
    } catch (e) {
      await agent.close();
      throw e;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const loc = response.headers.get("location");
      await response.body?.cancel();
      await agent.close();
      if (!loc) throw new Error("Invalid source redirect");
      const next = new URL(loc, u);
      if (next.origin !== u.origin) {
        delete headers.Authorization;
        delete headers.authorization;
        delete headers.Cookie;
        delete headers.cookie;
      }
      current = next.href;
      continue;
    }
    return { response, url: u.href, close: () => agent.close() };
  }
  throw new Error("Too many source redirects");
}
const allowedHeaders = new Set([
  "accept",
  "user-agent",
  "referer",
  "origin",
  "authorization",
]);
export function sourceHeaders(value = {}) {
  const result = {};
  for (const [k, v] of Object.entries(value)) {
    if (
      !allowedHeaders.has(k.toLowerCase()) ||
      typeof v !== "string" ||
      /[\r\n]/.test(v) ||
      v.length > 4096
    )
      throw new Error("Unsupported source header");
    result[k] = v;
  }
  return result;
}
export function safeDownloadName(value) {
  const cleaned = String(value ?? "TikTak TV download.mp4")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\.+\s*/, "")
    .trim()
    .slice(0, 180);
  return (cleaned || "TikTak TV download").replace(/\.mp4$/i, "") + ".mp4";
}
export function rewritePlaylist(text, base, link) {
  if (/\bURI=(?!")/i.test(text)) throw new Error("Invalid HLS URI attribute");
  return text
    .split(/\r?\n/)
    .map((line) => {
      if (!line.trim()) return line;
      if (line.startsWith("#"))
        return line.replace(
          /URI="([^"]+)"/g,
          (_, url) => `URI="${link(new URL(url, base).href)}"`,
        );
      return link(new URL(line.trim(), base).href);
    })
    .join("\n");
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b) [a, b] = [b, a % b];
  return a;
}

function rotateYoutubeItems(items, rotation) {
  if (!Array.isArray(items) || items.length < 2) return items ?? [];
  let step = Math.max(1, Math.floor(items.length / 3));
  while (greatestCommonDivisor(step, items.length) !== 1) step += 1;
  const offset = (Math.max(0, rotation) * step) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

export function rotateYoutubeAccount(account, rotation = 0) {
  return {
    ...account,
    videoFeed: rotateYoutubeItems(account?.videoFeed, rotation),
    musicFeed: rotateYoutubeItems(account?.musicFeed, rotation),
    recentFeed: rotateYoutubeItems(account?.recentFeed, rotation),
    subscriptionFeed: rotateYoutubeItems(account?.subscriptionFeed, rotation),
  };
}

export function youtubeForYouFeed(discoveryVideos, popularVideos, relatedVideos) {
  const blended = [];
  const seenVideos = new Set();
  const channelCounts = new Map();
  const add = (item) => {
    if (!item?.videoId || seenVideos.has(item.videoId)) return;
    const channel = item.channelId || item.channel;
    if (channel && (channelCounts.get(channel) ?? 0) >= 2) return;
    seenVideos.add(item.videoId);
    if (channel) channelCounts.set(channel, (channelCounts.get(channel) ?? 0) + 1);
    blended.push(item);
  };
  // Keep fresh, broad discovery visible on the first screen. Uploads from
  // subscribed channels belong in Subscriptions, not this feed.
  for (let index = 0; index < Math.max(discoveryVideos.length, popularVideos.length, relatedVideos.length * 2); index += 1) {
    add(discoveryVideos[index]);
    add(popularVideos[index]);
    if (index % 2 === 0) add(relatedVideos[index / 2]);
  }
  return blended;
}

export function youtubeDiscoveryQuery(title) {
  const words = String(title ?? "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .toLowerCase()
    .match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return [...new Set(words.filter((word) => !youtubeGenericTitleWords.has(word)))]
    .slice(0, 5)
    .join(" ");
}

export function youtubeDiscoveryQueries(recentTitles, likedTitles, limit = 3) {
  const candidates = [];
  for (let index = 0; index < Math.max(recentTitles.length, likedTitles.length); index += 1) {
    if (likedTitles[index]) candidates.push(likedTitles[index]);
    if (recentTitles[index]) candidates.push(recentTitles[index]);
  }
  const queries = [];
  for (const title of candidates) {
    const query = youtubeDiscoveryQuery(title);
    if (query.length < 5) continue;
    const words = new Set(query.split(" "));
    if (queries.some((existing) => {
      const existingWords = new Set(existing.split(" "));
      const overlap = [...words].filter((word) => existingWords.has(word)).length;
      return overlap >= Math.ceil(Math.min(words.size, existingWords.size) / 2);
    })) continue;
    queries.push(query);
    if (queries.length >= limit) break;
  }
  return queries;
}

export function youtubeRecentVideoIds(value) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (id) => typeof id === "string" && youtubeVideoIdPattern.test(id),
          ),
        ),
      ].slice(0, 40)
    : [];
}

export function youtubeInterestTopics(value) {
  return Array.isArray(value)
    ? [...new Set(value
        .filter((topic) => typeof topic === "string")
        .map((topic) => topic.trim().replace(/\s+/g, " ").slice(0, 60))
        .filter((topic) => topic.length >= 3))].slice(0, 4)
    : [];
}

export function youtubeVideoAllowed(item, kind = "video") {
  return (
    item?.status?.embeddable !== false &&
    (kind === "music" ||
      (String(item?.snippet?.categoryId ?? "") !== "10" &&
        youtubeLongFormVideo(item)))
  );
}

export function youtubeLongFormVideo(item) {
  const duration = String(item?.contentDetails?.duration ?? "");
  const match =
    /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(duration);
  if (!match) return false;
  const seconds =
    Number(match[1] ?? 0) * 86_400 +
    Number(match[2] ?? 0) * 3_600 +
    Number(match[3] ?? 0) * 60 +
    Number(match[4] ?? 0);
  // YouTube Shorts can run for three minutes. Excluding every video at or
  // under that length also removes some short landscape clips.
  return seconds > 180;
}

const youtubeGenericTitleWords = new Set([
  "about", "after", "again", "best", "first", "from", "full", "latest",
  "more", "most", "official", "part", "shorts", "that", "this", "today",
  "video", "watch", "with", "your",
]);

export function youtubeTitlesRelated(watchedTitle, candidateTitle) {
  const tokens = (title) =>
    new Set(
      (String(title ?? "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []).filter(
        (word) => !youtubeGenericTitleWords.has(word) && !/^\d+$/.test(word),
      ),
    );
  const watched = tokens(watchedTitle);
  return [...tokens(candidateTitle)].some((word) => watched.has(word));
}

const youtubeVideoIdPattern = /^[A-Za-z0-9_-]{11}$/;
const youtubePlaybackClients = [
  {
    name: "ANDROID",
    id: "3",
    version: "20.10.35",
    userAgent:
      "com.google.android.youtube/20.10.35 (Linux; U; Android 14; en_US) gzip",
    context: {
      clientName: "ANDROID",
      clientVersion: "20.10.35",
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "IOS",
    id: "5",
    version: "20.10.1",
    userAgent:
      "com.google.ios.youtube/20.10.1 (iPhone16,2; U; CPU iOS 17_4 like Mac OS X)",
    context: {
      clientName: "IOS",
      clientVersion: "20.10.1",
      deviceModel: "iPhone16,2",
      osName: "iPhone",
      osVersion: "17.4.0.21E219",
      hl: "en",
      gl: "US",
    },
  },
  {
    name: "TVHTML5",
    id: "7",
    version: "7.20250209.18.00",
    userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
    context: {
      clientName: "TVHTML5",
      clientVersion: "7.20250209.18.00",
      hl: "en",
      gl: "US",
    },
  },
];

function youtubeFormatUrl(format) {
  if (typeof format?.url === "string" && format.url.startsWith("https://"))
    return format.url;
  return null;
}

function youtubeMime(format) {
  return String(format?.mimeType ?? "")
    .split(";")[0]
    .trim();
}

function youtubePlaybackChoice(responses, kind) {
  const progressive = [];
  const audio = [];
  const manifests = [];
  for (const response of responses) {
    const data = response?.streamingData;
    if (typeof data?.hlsManifestUrl === "string")
      manifests.push(data.hlsManifestUrl);
    for (const format of data?.formats ?? []) {
      const url = youtubeFormatUrl(format);
      if (!url) continue;
      progressive.push({
        url,
        mimeType: youtubeMime(format),
        height: Number(format.height ?? 0),
        bitrate: Number(format.bitrate ?? 0),
      });
    }
    for (const format of data?.adaptiveFormats ?? []) {
      const url = youtubeFormatUrl(format);
      const mimeType = youtubeMime(format);
      if (!url || !mimeType.startsWith("audio/")) continue;
      audio.push({
        url,
        mimeType,
        bitrate: Number(format.bitrate ?? format.averageBitrate ?? 0),
        isDefault: format.audioTrack?.audioIsDefault !== false,
      });
    }
  }
  const bestProgressive = progressive
    .filter(
      (format) =>
        format.mimeType === "video/mp4" &&
        format.height > 0 &&
        format.height <= 1080,
    )
    .sort(
      (left, right) =>
        right.height - left.height || right.bitrate - left.bitrate,
    )[0];
  const bestAudio =
    audio
      .filter((format) => format.isDefault)
      .sort((left, right) => right.bitrate - left.bitrate)[0] ??
    audio.sort((left, right) => right.bitrate - left.bitrate)[0];
  if (kind === "music" && bestAudio) return { type: "audio", ...bestAudio };
  if (bestProgressive) return { type: "progressive", ...bestProgressive };
  if (manifests[0])
    return {
      type: "hls",
      url: manifests[0],
      mimeType: "application/vnd.apple.mpegurl",
    };
  if (bestAudio) return { type: "audio", ...bestAudio };
  return null;
}

async function resolveYoutubePlayback(videoId, kind, signal) {
  const watch = await fetchSafe(
    `https://www.youtube.com/watch?v=${videoId}&hl=en&bpctr=9999999999`,
    {
      signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      },
    },
  );
  let watchText;
  try {
    if (!watch.response.ok) throw new Error("YouTube watch page failed");
    watchText = await limitedText(watch.response, 4_000_000);
  } finally {
    await watch.close();
  }
  const apiKey = watchText.match(/"INNERTUBE_API_KEY":"([^"]+)"/)?.[1];
  const visitorData = watchText.match(/"VISITOR_DATA":"([^"]+)"/)?.[1];
  if (!apiKey) throw new Error("YouTube player configuration is unavailable");
  const responses = [];
  for (const client of youtubePlaybackClients) {
    const upstream = await fetchSafe(
      `https://www.youtube.com/youtubei/v1/player?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          origin: "https://www.youtube.com",
          "user-agent": client.userAgent,
          "x-youtube-client-name": client.id,
          "x-youtube-client-version": client.version,
          ...(visitorData ? { "x-goog-visitor-id": visitorData } : {}),
        },
        body: JSON.stringify({
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
          context: { client: client.context },
          playbackContext: {
            contentPlaybackContext: { html5Preference: "HTML5_PREF_WANTS" },
          },
        }),
      },
    );
    try {
      if (upstream.response.ok)
        responses.push(
          JSON.parse(await limitedText(upstream.response, 2_000_000)),
        );
    } finally {
      await upstream.close();
    }
  }
  return youtubePlaybackChoice(responses, kind);
}

export function createService({ token, origins, authorizeAccount }) {
  if (!token || token.length < 32)
    throw new Error("Set a private PLAYBACK_TOKEN of at least 32 characters.");
  const jobs = new Map();
  const tickets = new Map();
  const accountTokens = new Map();
  const youtubeCache = new Map();
  const youtubeDiscoveryCache = new Map();
  const youtubeFeedRotations = new Map();
  const youtubeSubscriptionOffsets = new Map();
  const sponsorCache = new Map();
  const youtubePlaybackCache = new Map();
  const parties = new Map();
  const endedParties = new Map();
  const partyCreates = new Map();
  const startedAt = Date.now();
  const limits = Object.freeze({
    jobs: 24,
    tickets: 5000,
    parties: 500,
    partyMembers: 12,
  });
  const friendAttempts = new Map();
  const friendOwner = process.env.FRIEND_OWNER_USER_ID ?? "";
  const analyticsAdmin = process.env.ANALYTICS_ADMIN_USER_ID ?? friendOwner;
  const analyticsPath =
    process.env.ANALYTICS_PATH ??
    join(process.cwd(), "runtime", "usage-analytics.json");
  const feedbackAdmin = process.env.FEEDBACK_ADMIN_USER_ID ?? analyticsAdmin;
  const feedbackPath =
    process.env.FEEDBACK_PATH ??
    join(process.cwd(), "runtime", "feedback.json");
  let analyticsCache;
  let analyticsLoadPromise;
  let analyticsWriteTimer;
  let feedbackCache;
  let feedbackLoadPromise;
  let feedbackWriteTimer;
  async function readFeedback() {
    if (feedbackCache) return feedbackCache;
    if (!feedbackLoadPromise) {
      feedbackLoadPromise = readFile(feedbackPath, "utf8")
        .then((text) => JSON.parse(text))
        .catch(() => ({ version: 1, entries: [] }))
        .then((value) => {
          feedbackCache =
            value?.version === 1 && Array.isArray(value.entries)
              ? value
              : { version: 1, entries: [] };
          return feedbackCache;
        });
    }
    return feedbackLoadPromise;
  }
  function scheduleFeedbackWrite() {
    if (feedbackWriteTimer) clearTimeout(feedbackWriteTimer);
    feedbackWriteTimer = setTimeout(
      () =>
        void (async () => {
          feedbackWriteTimer = null;
          if (!feedbackCache) return;
          await mkdir(join(feedbackPath, ".."), { recursive: true });
          const temporary = `${feedbackPath}.${randomBytes(6).toString("hex")}`;
          await writeFile(temporary, JSON.stringify(feedbackCache), {
            mode: 0o600,
          });
          await rename(temporary, feedbackPath);
        })().catch(() => {}),
      100,
    );
    feedbackWriteTimer.unref();
  }
  async function submitFeedback(userId, value) {
    const type = String(value?.type ?? "");
    const title = String(value?.title ?? "").trim();
    const details = String(value?.details ?? "").trim();
    const page = String(value?.page ?? "").slice(0, 240);
    const client = String(value?.client ?? "web").slice(0, 40);
    if (!["bug", "feature"].includes(type))
      throw new Error("Choose a feedback type.");
    if (title.length < 5 || title.length > 140)
      throw new Error("Use a title between 5 and 140 characters.");
    if (details.length < 10 || details.length > 5_000)
      throw new Error("Describe the request in 10 to 5,000 characters.");
    const attachments = Array.isArray(value?.attachments)
      ? value.attachments
      : [];
    if (attachments.length > 3)
      throw new Error("Attach no more than three images.");
    const images = attachments.map((attachment) => {
      const name =
        String(attachment?.name ?? "screenshot")
          .replace(/[^a-zA-Z0-9._ -]/g, "")
          .slice(0, 100) || "screenshot";
      const data = String(attachment?.data ?? "");
      const match = data.match(
        /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match || Buffer.byteLength(match[2], "base64") > 2_000_000)
        throw new Error(
          "Each attachment must be a PNG, JPEG, WebP, or GIF under 2 MB.",
        );
      return { name, type: match[1], data };
    });
    const data = await readFeedback();
    const entry = {
      id: randomBytes(12).toString("base64url"),
      type,
      title,
      details,
      page,
      client,
      status: "new",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      account: createHmac("sha256", token)
        .update(`feedback:${userId}`)
        .digest("base64url")
        .slice(0, 12),
      attachments: images,
    };
    data.entries.unshift(entry);
    if (data.entries.length > 1_000) data.entries.length = 1_000;
    scheduleFeedbackWrite();
    return { ok: true, id: entry.id };
  }
  async function readAnalytics() {
    if (analyticsCache) return analyticsCache;
    if (!analyticsLoadPromise) {
      analyticsLoadPromise = readFile(analyticsPath, "utf8")
        .then((text) => JSON.parse(text))
        .catch(() => ({ version: 1, visitors: {} }))
        .then((value) => {
          analyticsCache =
            value?.version === 1 && value?.visitors
              ? { ...value, accounts: value.accounts ?? {} }
              : { version: 1, visitors: {}, accounts: {} };
          return analyticsCache;
        });
    }
    return analyticsLoadPromise;
  }
  function scheduleAnalyticsWrite() {
    if (analyticsWriteTimer) clearTimeout(analyticsWriteTimer);
    analyticsWriteTimer = setTimeout(
      () =>
        void (async () => {
          analyticsWriteTimer = null;
          const value = analyticsCache;
          if (!value) return;
          await mkdir(join(analyticsPath, ".."), { recursive: true });
          const temporary = `${analyticsPath}.${randomBytes(6).toString("hex")}`;
          await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
          await rename(temporary, analyticsPath);
        })().catch(() => {}),
      250,
    );
    analyticsWriteTimer.unref();
  }
  async function recordUsage(value) {
    const visitorId = String(value?.visitorId ?? "");
    const client = String(value?.client ?? "web");
    if (
      !/^[A-Za-z0-9_-]{20,100}$/.test(visitorId) ||
      ![
        "web-desktop",
        "web-mobile",
        "pwa",
        "android-mobile",
        "android-tv",
      ].includes(client)
    )
      return false;
    const id = createHmac("sha256", token)
      .update(`usage:${visitorId}`)
      .digest("base64url");
    const data = await readAnalytics();
    const now = Date.now();
    const previous = data.visitors[id];
    data.visitors[id] = {
      firstSeen: Number(previous?.firstSeen) || now,
      lastSeen: now,
      lastVisit:
        !previous || now - Number(previous.lastSeen) >= 30 * 60_000
          ? now
          : Number(previous.lastVisit) || Number(previous.firstSeen) || now,
      visits:
        (Number(previous?.visits) || 0) +
        (!previous || now - Number(previous.lastSeen) >= 30 * 60_000 ? 1 : 0),
      client,
    };
    scheduleAnalyticsWrite();
    return true;
  }
  async function recordAccountUsage(userId, value) {
    const client = String(value?.client ?? "web");
    if (
      !userId ||
      userId === "service" ||
      ![
        "web-desktop",
        "web-mobile",
        "pwa",
        "android-mobile",
        "android-tv",
      ].includes(client)
    )
      return false;
    const id = createHmac("sha256", token)
      .update(`account:${userId}`)
      .digest("base64url");
    const data = await readAnalytics();
    const now = Date.now();
    const rawSession = String(value?.sessionId ?? "");
    const session = /^[A-Za-z0-9_-]{20,100}$/.test(rawSession)
      ? createHmac("sha256", token)
          .update(`session:${userId}:${rawSession}`)
          .digest("base64url")
      : "legacy";
    const suppliedCreatedAt = Date.parse(String(value?.createdAt ?? ""));
    const createdAt =
      Number.isFinite(suppliedCreatedAt) &&
      suppliedCreatedAt >= Date.UTC(2000, 0, 1) &&
      suppliedCreatedAt <= now + 24 * 60 * 60_000
        ? suppliedCreatedAt
        : undefined;
    const previous = data.accounts[id];
    const previousLastSeen = Number(previous?.lastSeen) || now;
    const sameSession = previous?.currentSession === session;
    const elapsedSeconds = sameSession
      ? Math.max(0, Math.min(5 * 60, (now - previousLastSeen) / 1000))
      : 0;
    const day = new Date(now).toISOString().slice(0, 10);
    const activityDays = Array.from(
      new Set([
        ...(Array.isArray(previous?.activityDays) ? previous.activityDays : []),
        day,
      ]),
    )
      .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
      .slice(-45);
    const previousCurrentSeconds = Number(previous?.currentSessionSeconds) || 0;
    data.accounts[id] = {
      firstSeen: Number(previous?.firstSeen) || now,
      lastSeen: now,
      lastActive:
        value?.active === true ? now : Number(previous?.lastActive) || 0,
      createdAt: Number(previous?.createdAt) || createdAt,
      client,
      sessions:
        Math.max(1, Number(previous?.sessions) || 1) +
        (previous && !sameSession ? 1 : 0),
      currentSession: session,
      currentSessionStarted: sameSession
        ? Number(previous?.currentSessionStarted) || previousLastSeen
        : now,
      currentSessionSeconds: sameSession
        ? previousCurrentSeconds + elapsedSeconds
        : 0,
      completedSessionSeconds:
        (Number(previous?.completedSessionSeconds) || 0) +
        (previous && !sameSession ? previousCurrentSeconds : 0),
      activityDays,
    };
    scheduleAnalyticsWrite();
    return true;
  }
  async function recordPlaybackMetric(userId, value) {
    const client = String(value?.client ?? "web");
    const release = String(value?.release ?? "web").slice(0, 24);
    const event = String(value?.event ?? "");
    const rawPlaybackId = String(value?.playbackId ?? "");
    const rawSessionId = String(value?.sessionId ?? "");
    const validClients = [
      "web-desktop",
      "web-mobile",
      "pwa",
      "android-mobile",
      "android-tv",
    ];
    const validEvents = ["opened", "started", "failed", "ended", "closed"];
    if (
      !userId ||
      userId === "service" ||
      !validClients.includes(client) ||
      !validEvents.includes(event) ||
      !/^[A-Za-z0-9._-]{1,24}$/.test(release) ||
      !/^[A-Za-z0-9_-]{20,100}$/.test(rawPlaybackId) ||
      !/^[A-Za-z0-9_-]{20,100}$/.test(rawSessionId)
    )
      return false;
    const data = await readAnalytics();
    const now = Date.now();
    data.playback ??= {
      measurementStartedAt: now,
      opened: 0,
      started: 0,
      failed: 0,
      ended: 0,
      closed: 0,
      sessionsWithPlayback: 0,
      totalDurationSeconds: 0,
      durationSamples: 0,
      durationBuckets: {
        under1m: 0,
        oneTo5m: 0,
        fiveTo15m: 0,
        fifteenTo30m: 0,
        thirtyPlus: 0,
      },
      byPlatform: {},
      byRelease: {},
    };
    data.playbackEvents ??= {};
    data.playbackSessions ??= {};
    const eventId = createHmac("sha256", token)
      .update(`playback-event:${rawPlaybackId}:${event}`)
      .digest("base64url");
    if (data.playbackEvents[eventId]) return true;
    data.playbackEvents[eventId] = now;
    const oldestRetained = now - 45 * 24 * 60 * 60_000;
    data.playbackEvents = Object.fromEntries(
      Object.entries(data.playbackEvents)
        .filter(([, timestamp]) => Number(timestamp) >= oldestRetained)
        .sort((a, b) => Number(b[1]) - Number(a[1]))
        .slice(0, 20_000),
    );
    const emptyGroup = () => ({
      opened: 0,
      started: 0,
      failed: 0,
      ended: 0,
      closed: 0,
      totalDurationSeconds: 0,
      durationSamples: 0,
      durationBuckets: {
        under1m: 0,
        oneTo5m: 0,
        fiveTo15m: 0,
        fifteenTo30m: 0,
        thirtyPlus: 0,
      },
    });
    const platform = (data.playback.byPlatform[client] ??= emptyGroup());
    const releaseGroup = (data.playback.byRelease[release] ??= emptyGroup());
    for (const group of [data.playback, platform, releaseGroup])
      group[event] = (Number(group[event]) || 0) + 1;
    if (event === "started") {
      const sessionId = createHmac("sha256", token)
        .update(`playback-session:${rawSessionId}`)
        .digest("base64url");
      if (!data.playbackSessions[sessionId]) {
        data.playbackSessions[sessionId] = now;
        data.playback.sessionsWithPlayback =
          (Number(data.playback.sessionsWithPlayback) || 0) + 1;
      }
      data.playbackSessions = Object.fromEntries(
        Object.entries(data.playbackSessions)
          .filter(([, timestamp]) => Number(timestamp) >= oldestRetained)
          .sort((a, b) => Number(b[1]) - Number(a[1]))
          .slice(0, 20_000),
      );
    }
    if (event === "ended" || event === "closed") {
      const durationSeconds = Math.max(
        0,
        Math.min(24 * 60 * 60, Math.round(Number(value?.durationSeconds) || 0)),
      );
      const bucket =
        durationSeconds < 60
          ? "under1m"
          : durationSeconds < 5 * 60
            ? "oneTo5m"
            : durationSeconds < 15 * 60
              ? "fiveTo15m"
              : durationSeconds < 30 * 60
                ? "fifteenTo30m"
                : "thirtyPlus";
      for (const group of [data.playback, platform, releaseGroup]) {
        group.totalDurationSeconds =
          (Number(group.totalDurationSeconds) || 0) + durationSeconds;
        group.durationSamples = (Number(group.durationSamples) || 0) + 1;
        group.durationBuckets[bucket] =
          (Number(group.durationBuckets[bucket]) || 0) + 1;
      }
    }
    scheduleAnalyticsWrite();
    return true;
  }
  async function usageSummary() {
    const data = await readAnalytics();
    const now = Date.now();
    const visitors = Object.values(data.visitors);
    const within = (duration) =>
      visitors.filter((entry) => now - Number(entry.lastSeen) <= duration);
    const recent = within(30 * 24 * 60 * 60_000);
    const platforms = Object.fromEntries(
      ["web-desktop", "web-mobile", "pwa", "android-mobile", "android-tv"].map(
        (name) => [
          name,
          recent.filter((entry) => entry.client === name).length,
        ],
      ),
    );
    const accounts = Object.values(data.accounts ?? {});
    const accountsWithin = (duration) =>
      accounts.filter((entry) => now - Number(entry.lastSeen) <= duration);
    const signupsWithin = (duration) =>
      accounts.filter(
        (entry) =>
          Number(entry.createdAt) > 0 &&
          now - Number(entry.createdAt) <= duration,
      );
    const utcDay = (value) => Date.parse(`${value}T00:00:00.000Z`);
    const retention = (days) => {
      const threshold = days * 24 * 60 * 60_000;
      const eligible = accounts.filter(
        (entry) => now - Number(entry.firstSeen) >= threshold,
      );
      const returned = eligible.filter((entry) => {
        const firstDay = Date.parse(
          new Date(Number(entry.firstSeen)).toISOString().slice(0, 10) +
            "T00:00:00.000Z",
        );
        return (entry.activityDays ?? []).some(
          (day) => utcDay(day) - firstDay >= threshold,
        );
      }).length;
      return {
        eligible: eligible.length,
        returned,
        rate: eligible.length
          ? Math.round((returned / eligible.length) * 1000) / 10
          : null,
      };
    };
    const totalSessions = accounts.reduce(
      (total, entry) => total + Math.max(1, Number(entry.sessions) || 1),
      0,
    );
    const totalSessionSeconds = accounts.reduce(
      (total, entry) =>
        total +
        Number(entry.completedSessionSeconds || 0) +
        Number(entry.currentSessionSeconds || 0),
      0,
    );
    const playback = data.playback ?? {};
    const durationSamples = Number(playback.durationSamples) || 0;
    const totalDurationSeconds = Number(playback.totalDurationSeconds) || 0;
    const playbackOpened = Number(playback.opened) || 0;
    const playbackStarted = Number(playback.started) || 0;
    return {
      activeNow: within(5 * 60_000).length,
      today: within(24 * 60 * 60_000).length,
      sevenDays: within(7 * 24 * 60 * 60_000).length,
      thirtyDays: recent.length,
      allTime: visitors.length,
      visits: visitors.reduce(
        (total, entry) => total + Number(entry.visits || 0),
        0,
      ),
      platforms,
      accounts: {
        onlineNow: accountsWithin(5 * 60_000).length,
        activeNow: accounts.filter(
          (entry) => now - Number(entry.lastActive) <= 5 * 60_000,
        ).length,
        today: accountsWithin(24 * 60 * 60_000).length,
        sevenDays: accountsWithin(7 * 24 * 60 * 60_000).length,
        thirtyDays: accountsWithin(30 * 24 * 60 * 60_000).length,
        allTime: accounts.length,
        signupsToday: signupsWithin(24 * 60 * 60_000).length,
        signupsSevenDays: signupsWithin(7 * 24 * 60 * 60_000).length,
        signupsThirtyDays: signupsWithin(30 * 24 * 60 * 60_000).length,
        returning: accounts.filter(
          (entry) => (entry.activityDays ?? []).length >= 2,
        ).length,
        sessionsPerAccount: accounts.length
          ? Math.round((totalSessions / accounts.length) * 10) / 10
          : 0,
        averageSessionMinutes: totalSessions
          ? Math.round((totalSessionSeconds / totalSessions / 60) * 10) / 10
          : 0,
        retention: {
          day1: retention(1),
          day7: retention(7),
          day30: retention(30),
        },
      },
      playback: {
        opened: playbackOpened,
        started: playbackStarted,
        failed: Number(playback.failed) || 0,
        ended: Number(playback.ended) || 0,
        closed: Number(playback.closed) || 0,
        sessionsWithPlayback: Number(playback.sessionsWithPlayback) || 0,
        successRate: playbackOpened
          ? Math.round((playbackStarted / playbackOpened) * 1000) / 10
          : null,
        averageDurationMinutes: durationSamples
          ? Math.round((totalDurationSeconds / durationSamples / 60) * 10) / 10
          : 0,
        totalDurationHours:
          Math.round((totalDurationSeconds / 60 / 60) * 10) / 10,
        durationSamples,
        durationBuckets: {
          under1m: Number(playback.durationBuckets?.under1m) || 0,
          oneTo5m: Number(playback.durationBuckets?.oneTo5m) || 0,
          fiveTo15m: Number(playback.durationBuckets?.fiveTo15m) || 0,
          fifteenTo30m: Number(playback.durationBuckets?.fifteenTo30m) || 0,
          thirtyPlus: Number(playback.durationBuckets?.thirtyPlus) || 0,
        },
        byPlatform: playback.byPlatform ?? {},
        byRelease: playback.byRelease ?? {},
        measurementStartedAt: Number(playback.measurementStartedAt) || null,
      },
      definitions: {
        version: 3,
        timezone: "UTC",
        signedIn:
          "Distinct privacy-safe account hashes with a heartbeat in each rolling time window.",
        returning:
          "Accounts observed on at least two UTC calendar dates in retained activity history.",
        session:
          "A browser tab or app session identified by session storage; a new tab or app restart can start another session.",
        averageSession:
          "Heartbeat-observed foreground time per session. Visible idle time can be included, and each sample is capped at five minutes.",
        retention:
          "Cumulative retention: an account becomes eligible after N x 24 hours and counts as returned after activity on or after UTC day N.",
        device:
          "A pseudonymous browser or app installation ID. Clearing storage or reinstalling can create another ID.",
        platform:
          "Device IDs active in the last 30 days, grouped by their most recently reported platform.",
        visit:
          "A device visit starts after at least 30 minutes without a heartbeat.",
        playback:
          "Aggregate embedded-player opens, successful starts, final errors, and wall-clock time while media was actually playing. Paused time, titles, channels, URLs, and external-player watch time are not collected.",
      },
      generatedAt: now,
    };
  }
  const friendVaultPath =
    process.env.FRIEND_VAULT_PATH ??
    join(process.cwd(), "runtime", "friend-vault.json");
  const friendVaultsPath =
    process.env.FRIEND_VAULTS_PATH ??
    join(process.cwd(), "runtime", "friend-vaults.json");
  const friendKey = (() => {
    try {
      const value = Buffer.from(process.env.FRIEND_VAULT_KEY ?? "", "base64");
      return value.length === 32 ? value : null;
    } catch {
      return null;
    }
  })();
  let friendVaultCache;
  let friendVaultsCache;
  const youtubeDevices = new Map();
  const youtubeVaultPath =
    process.env.YOUTUBE_VAULT_PATH ??
    join(process.cwd(), "runtime", "youtube-vault.json");
  const youtubeKey = (() => {
    try {
      const configured = Buffer.from(
        process.env.YOUTUBE_VAULT_KEY ?? "",
        "base64",
      );
      return configured.length === 32 ? configured : friendKey;
    } catch {
      return friendKey;
    }
  })();
  let youtubeVaultCache;
  async function decryptVaultFile(path) {
    if (!friendKey) return null;
    const stored = JSON.parse(await readFile(path, "utf8"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      friendKey,
      Buffer.from(stored.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
    return JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(stored.data, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
  async function encryptVaultFile(path, value) {
    if (!friendKey)
      throw new Error("Friend vault encryption is not configured");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", friendKey, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    await mkdir(join(path, ".."), { recursive: true });
    const output = JSON.stringify({
      version: 1,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    });
    const temporary = `${path}.${randomBytes(6).toString("hex")}`;
    await writeFile(temporary, output, { mode: 0o600 });
    await rename(temporary, path);
  }
  async function readFriendVault() {
    if (friendVaultCache) return friendVaultCache;
    if (!friendKey) return null;
    try {
      friendVaultCache = await decryptVaultFile(friendVaultPath);
      return friendVaultCache;
    } catch {
      return null;
    }
  }
  async function readFriendVaults() {
    if (friendVaultsCache) return friendVaultsCache;
    try {
      friendVaultsCache = await decryptVaultFile(friendVaultsPath);
    } catch {
      friendVaultsCache = { version: 2, vaults: {} };
    }
    return friendVaultsCache;
  }
  async function writeFriendVaults(value) {
    await encryptVaultFile(friendVaultsPath, value);
    friendVaultsCache = value;
  }
  async function readYoutubeVault() {
    if (youtubeVaultCache) return youtubeVaultCache;
    if (!youtubeKey) return { version: 1, accounts: {} };
    try {
      const stored = JSON.parse(await readFile(youtubeVaultPath, "utf8"));
      const decipher = createDecipheriv(
        "aes-256-gcm",
        youtubeKey,
        Buffer.from(stored.iv, "base64"),
      );
      decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
      youtubeVaultCache = JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(stored.data, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      );
    } catch {
      youtubeVaultCache = { version: 1, accounts: {} };
    }
    return youtubeVaultCache;
  }
  async function writeYoutubeVault(value) {
    if (!youtubeKey)
      throw new Error("YouTube account encryption is not configured");
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", youtubeKey, iv);
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    await mkdir(join(youtubeVaultPath, ".."), { recursive: true });
    const temporary = `${youtubeVaultPath}.${randomBytes(6).toString("hex")}`;
    await writeFile(
      temporary,
      JSON.stringify({
        version: 1,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      }),
      { mode: 0o600 },
    );
    await rename(temporary, youtubeVaultPath);
    youtubeVaultCache = value;
  }
  function youtubeOAuthConfig() {
    const clientId = String(process.env.YOUTUBE_OAUTH_CLIENT_ID ?? "").trim();
    const clientSecret = String(
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET ?? "",
    ).trim();
    return clientId && youtubeKey ? { clientId, clientSecret } : null;
  }
  function youtubeTokenBody(config, values) {
    const body = new URLSearchParams({
      client_id: config.clientId,
      ...values,
    });
    if (config.clientSecret) body.set("client_secret", config.clientSecret);
    return body;
  }
  async function youtubeToken(userId) {
    const vault = await readYoutubeVault();
    const account = vault.accounts?.[userId];
    if (!account) return null;
    if (account.accessToken && Number(account.expiresAt) > Date.now() + 60_000)
      return account.accessToken;
    const config = youtubeOAuthConfig();
    if (!config || !account.refreshToken) return null;
    const response = await upstreamFetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: youtubeTokenBody(config, {
          refresh_token: account.refreshToken,
          grant_type: "refresh_token",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.access_token) return null;
    Object.assign(account, {
      accessToken: payload.access_token,
      expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
    });
    await writeYoutubeVault(vault);
    return account.accessToken;
  }
  async function youtubeApi(userId, path, params = {}) {
    const accessToken = await youtubeToken(userId);
    if (!accessToken) return null;
    const target = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries(params))
      target.searchParams.set(key, String(value));
    const response = await upstreamFetch(target, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return response.json();
  }
  async function youtubePublicApi(path, params = {}) {
    const apiKey = String(process.env.YOUTUBE_API_KEY ?? "").trim();
    if (!apiKey) return null;
    const target = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [key, value] of Object.entries({ ...params, key: apiKey }))
      target.searchParams.set(key, String(value));
    const response = await upstreamFetch(target, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    return response.json();
  }
  function friendCodeId(code) {
    return createHmac("sha256", friendKey)
      .update(`friend-code:${code}`)
      .digest("base64url");
  }
  function friendGrant(userId, version, vaultId = "") {
    if (!friendKey) throw new Error("Friend access is not configured");
    const payload = Buffer.from(
      JSON.stringify({
        sub: userId,
        exp: Date.now() + 30 * 24 * 60 * 60_000,
        version,
        vault: vaultId,
      }),
    ).toString("base64url");
    const signature = createHmac("sha256", friendKey)
      .update(payload)
      .digest("base64url");
    return `${payload}.${signature}`;
  }
  function decodeFriendGrant(value, userId, allowExpired = false) {
    if (!friendKey || typeof value !== "string") return false;
    try {
      const [payload, signature] = value.split(".");
      const expected = createHmac("sha256", friendKey).update(payload).digest();
      const supplied = Buffer.from(signature, "base64url");
      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected)
      )
        return false;
      const data = JSON.parse(Buffer.from(payload, "base64url").toString());
      return data.sub === userId &&
        (allowExpired || Number(data.exp) > Date.now())
        ? data
        : null;
    } catch {
      return null;
    }
  }
  async function vaultForGrant(grant, userId, allowExpired = false) {
    const data = decodeFriendGrant(grant, userId, allowExpired);
    if (!data) return null;
    if (data.vault) {
      const database = await readFriendVaults();
      const vault = database.vaults?.[data.vault];
      return vault && Number(vault.updated) === Number(data.version)
        ? { vault, vaultId: data.vault }
        : null;
    }
    const vault = await readFriendVault();
    return vault && Number(vault.updated) === Number(data.version)
      ? { vault, vaultId: "" }
      : null;
  }
  async function restoreFriendAddonBase(value, userId) {
    try {
      const parsed = new URL(String(value));
      if (parsed.hostname !== "friend.tiktaktv.invalid") return null;
      const parts = parsed.pathname.split("/").filter(Boolean);
      const grant = parts[0];
      const index = Number(parts[1]);
      // Recovery is allowed after the 30-day playback grant expires because
      // the signed grant still identifies the same authenticated user and
      // exact vault version. Playback/debrid paths remain expiry-bound.
      const access = await vaultForGrant(grant, userId, true);
      const addon = access?.vault?.template?.addons?.[index];
      return Number.isInteger(index) &&
        index >= 0 &&
        typeof addon?.base === "string"
        ? addon.base
        : null;
    } catch {
      return null;
    }
  }
  function codeMatchesVault(code, vault) {
    if (!vault?.codeSalt || !vault?.codeHash) return false;
    const actual = scryptSync(code, Buffer.from(vault.codeSalt, "base64"), 32);
    const expected = Buffer.from(vault.codeHash, "base64");
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
  const ttl = 4 * 60 * 60 * 1000;
  function ticket(url, headers = {}) {
    if (tickets.size >= limits.tickets)
      throw new Error("Playback capacity reached");
    const id = randomBytes(24).toString("base64url");
    tickets.set(id, {
      url,
      headers,
      expires: Date.now() + ttl,
      children: new Map(),
    });
    return id;
  }
  const sweep = setInterval(() => {
    for (const [id, t] of tickets)
      if (t.expires < Date.now()) tickets.delete(id);
    for (const [id, j] of jobs)
      if (Date.now() - j.touched > 120000) {
        j.process?.kill();
        jobs.delete(id);
        if (j.dir)
          void rm(j.dir, { recursive: true, force: true }).catch(() => {});
      }
    for (const [id, party] of parties)
      if (party.expires < Date.now()) parties.delete(id);
    for (const [id, endedAt] of endedParties)
      if (Date.now() - endedAt > 10 * 60_000) endedParties.delete(id);
    for (const [userId, createdAt] of partyCreates)
      if (Date.now() - createdAt > 60_000) partyCreates.delete(userId);
  }, 30000);
  sweep.unref();
  function partyIdentity(value) {
    const name =
      String(value?.name ?? "Guest")
        .replace(/[\u0000-\u001f\u007f]/g, "")
        .trim()
        .slice(0, 48) || "Guest";
    let avatar = "";
    try {
      const parsed = new URL(String(value?.avatar ?? ""));
      if (
        parsed.protocol === "https:" &&
        !parsed.username &&
        !parsed.password
      ) {
        parsed.search = "";
        parsed.hash = "";
        avatar = parsed.href.slice(0, 1000);
      }
    } catch {}
    return { name, avatar };
  }
  function partyResponse(party, userId) {
    const now = Date.now();
    for (const [member, details] of party.members)
      if (now - details.seen > 30_000) party.members.delete(member);
    return {
      id: party.id,
      host: party.host === userId,
      participants: party.members.size,
      members: [...party.members].map(([id, details]) => ({
        key: createHmac("sha256", token)
          .update(id)
          .digest("base64url")
          .slice(0, 16),
        name: details.name,
        avatar: details.avatar,
        host: party.host === id,
        self: userId === id,
      })),
      playback: party.playback,
      state: { ...party.state, serverTime: now },
    };
  }
  const authorized = async (req) => {
    const a = Buffer.from(req.headers.authorization ?? "");
    const b = Buffer.from(`Bearer ${token}`);
    if (a.length === b.length && timingSafeEqual(a, b)) return "service";
    const bearer = String(req.headers.authorization ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!bearer || bearer.length > 4096) return false;
    if (authorizeAccount) return authorizeAccount(bearer);
    const cached = accountTokens.get(bearer);
    if (cached && cached.expires > Date.now()) return cached.userId;
    try {
      const response = await upstreamFetch(
        "https://api.nuvio.tv/auth/v1/user",
        {
          headers: {
            Authorization: `Bearer ${bearer}`,
            apikey: nuvioAnonKey,
          },
          signal: AbortSignal.timeout(10000),
        },
      );
      if (!response.ok) return false;
      const user = await response.json();
      if (!user?.id) return false;
      accountTokens.set(bearer, {
        userId: user.id,
        expires: Date.now() + 5 * 60_000,
      });
      if (accountTokens.size > 200)
        for (const [key, entry] of accountTokens)
          if (entry.expires < Date.now()) accountTokens.delete(key);
      return user.id;
    } catch {
      return false;
    }
  };
  const server = http.createServer(async (req, res) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    // Lets the web client distinguish a response produced by this service
    // from a gateway-generated 5xx when the tunnel itself is unavailable.
    res.setHeader("X-TikTak-Companion", "2");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,Range",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range,Accept-Ranges,Content-Length,X-TikTak-Companion",
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    const route = new URL(req.url, "http://localhost");
    const send = (status, data) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(data));
    };
    if (route.pathname === "/healthz") {
      if (!["GET", "HEAD"].includes(req.method))
        return send(405, { error: "Method not allowed" });
      return send(200, { ok: true, version: 2 });
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      if (route.pathname === "/analytics/heartbeat") {
        if (req.method !== "POST")
          return send(405, { error: "Method not allowed" });
        if (!origin) return send(403, { error: "Website origin required" });
        const body = JSON.parse(await limitedText(req, 2_000));
        if (!(await recordUsage(body)))
          return send(400, { error: "Invalid usage event" });
        return send(200, { ok: true });
      }
      if (route.pathname === "/health") {
        if (!(await authorized(req)))
          return send(401, { error: "Playback service key required" });
        return send(200, {
          ok: true,
          version: 2,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          features: {
            relay: true,
            conversion: true,
            downloads: true,
            watchTogether: true,
            friendSetup: !!friendKey,
            xmltv: true,
          },
        });
      }
      if (route.pathname.startsWith("/friend/addon/")) {
        if (!["GET", "HEAD"].includes(req.method))
          return send(405, { error: "Method not allowed" });
        const userId = await authorized(req);
        if (!userId || userId === "service")
          return send(401, { error: "Sign in to use this shared add-on." });
        const parts = route.pathname.split("/").filter(Boolean);
        const grant = parts[2];
        const index = Number(parts[3]);
        const resourcePath = parts.slice(4).join("/");
        const access = await vaultForGrant(grant, userId);
        const vault = access?.vault;
        if (
          !vault ||
          !Number.isInteger(index) ||
          index < 0 ||
          index >= vault.template.addons.length ||
          !/^(?:manifest\.json|catalog\/[^/]+\/[^/]+(?:\/[^/]+)?\.json|(?:meta|stream|subtitles)\/[^/]+\/[^/]+\.json)$/.test(
            resourcePath,
          )
        )
          return send(403, { error: "Shared add-on access expired." });
        const addon = vault.template.addons[index];
        const target = `${String(addon.base).replace(/\/$/, "")}/${resourcePath}${route.search}`;
        const result = await fetchSafe(target, {
          method: req.method,
          signal: controller.signal,
        });
        try {
          res.writeHead(result.response.status, {
            "Content-Type":
              result.response.headers.get("content-type") ??
              "application/json; charset=utf-8",
          });
          if (req.method === "HEAD" || !result.response.body) res.end();
          else await pipeline(Readable.fromWeb(result.response.body), res);
        } finally {
          await result.close();
        }
        return;
      }
      if (route.pathname.startsWith("/media/")) {
        if (!["GET", "HEAD"].includes(req.method))
          return send(405, { error: "Method not allowed" });
        const id = route.pathname.split("/")[2];
        const job = jobs.get(id);
        if (job) {
          const file = route.pathname.split("/")[3];
          if (job.kind === "download") {
            if (file !== "download.mp4")
              return send(404, { error: "Unknown media file" });
            const encodedName = encodeURIComponent(job.filename);
            const downloadHeaders = {
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="TikTak-TV.mp4"; filename*=UTF-8''${encodedName}`,
              "Cache-Control": "no-store",
            };
            if (req.method === "HEAD") {
              res.writeHead(200, downloadHeaders);
              return res.end();
            }
            job.touched = Date.now();
            job.process?.kill();
            const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", job.args, {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
            job.process = child;
            job.running = true;
            let responseStarted = false;
            let errorOutput = "";
            const stop = () => {
              if (job.process === child) {
                job.process = null;
                job.running = false;
              }
              child.kill();
            };
            res.once("close", stop);
            child.stderr.on("data", (chunk) => {
              errorOutput = (errorOutput + chunk.toString()).slice(-2000);
            });
            child.stdout.once("data", (chunk) => {
              if (res.destroyed) return stop();
              responseStarted = true;
              res.writeHead(200, downloadHeaders);
              res.write(chunk);
              child.stdout.pipe(res);
            });
            child.stdout.on("data", () => {
              job.touched = Date.now();
            });
            child.once("error", () => {
              if (responseStarted) res.destroy();
              else if (!res.writableEnded)
                send(502, {
                  error:
                    "The MP4 converter could not start. Try another source.",
                });
            });
            child.once("exit", (code) => {
              if (job.process === child) {
                job.process = null;
                job.running = false;
              }
              if (code && !res.destroyed && !res.writableEnded) {
                if (responseStarted) res.destroy();
                else
                  send(502, {
                    error: /401|403|forbidden|unauthorized/i.test(errorOutput)
                      ? "The source rejected the download. Refresh its stream link and try again."
                      : "This source could not be converted to MP4. Try another source.",
                  });
              } else if (!res.writableEnded) res.end();
            });
            return;
          }
          if (job.kind === "webm") {
            if (file !== "stream.webm")
              return send(404, { error: "Unknown media file" });
            res.writeHead(200, {
              "Content-Type": "video/webm",
              "Cache-Control": "no-store",
            });
            if (req.method === "HEAD") return res.end();
            job.touched = Date.now();
            job.process?.kill();
            const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", job.args, {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
            child.stderr.pipe(
              createWriteStream(
                join(process.cwd(), "runtime", "ffmpeg-last.log"),
                {
                  flags: "w",
                },
              ),
            );
            job.process = child;
            job.running = true;
            const stop = () => {
              if (job.process === child) {
                job.process = null;
                job.running = false;
              }
              child.kill();
            };
            res.once("close", stop);
            child.once("error", () => res.destroy());
            child.once("exit", (code) => {
              if (job.process === child) {
                job.process = null;
                job.running = false;
              }
              if (code && !res.destroyed) res.destroy();
              else if (!res.writableEnded) res.end();
            });
            child.stdout.pipe(res);
            return;
          }
          if (
            !/^(?:index|master|stream[a-z0-9_-]+)\.m3u8$|^(?:init|segment[a-z0-9_-]*\d*)\.(?:ts|m4s|mp4)$/.test(
              file,
            )
          )
            return send(404, { error: "Unknown media file" });
          job.touched = Date.now();
          let content;
          try {
            content = await readFile(join(job.dir, file));
          } catch {
            return send(503, { error: "Video is preparing. Retry shortly." });
          }
          res.writeHead(200, {
            "Content-Type": file.endsWith(".m3u8")
              ? "application/vnd.apple.mpegurl"
              : file.endsWith(".ts")
                ? "video/mp2t"
                : "video/mp4",
          });
          res.end(req.method === "HEAD" ? undefined : content);
          return;
        }
        const t = tickets.get(id);
        if (!t || t.expires < Date.now())
          return send(410, {
            error: "Playback session expired. Reopen the title.",
          });
        t.expires = Date.now() + ttl;
        const headers = { ...t.headers };
        if (req.headers.range) headers.Range = req.headers.range;
        const result = await fetchSafe(t.url, {
          headers,
          signal: controller.signal,
          method: req.method,
        });
        const r = result.response;
        try {
          const type = r.headers.get("content-type") ?? "";
          let looksLikeHls = false;
          if (req.method !== "HEAD" && r.body) {
            const probe = r.clone().body.getReader();
            let prefix = "";
            try {
              while (prefix.length < 16) {
                const { value, done } = await probe.read();
                if (done) break;
                prefix += new TextDecoder().decode(value.slice(0, 64));
              }
              looksLikeHls = prefix.trimStart().startsWith("#EXTM3U");
            } finally {
              void probe.cancel().catch(() => {});
            }
          }
          if (
            req.method !== "HEAD" &&
            r.ok &&
            (looksLikeHls ||
              /mpegurl/i.test(type) ||
              /\.m3u8(?:\?|$)/i.test(result.url) ||
              /\.m3u8(?:\?|$)/i.test(t.url))
          ) {
            const text = await limitedText(r, 4_000_000);
            if (!text.trimStart().startsWith("#EXTM3U"))
              return send(502, {
                error: "Provider did not return an HLS playlist",
              });
            const output = rewritePlaylist(text, result.url, (url) => {
              let child = t.children.get(url);
              if (!child || !tickets.has(child)) {
                child = ticket(url, t.headers);
                t.children.set(url, child);
                if (t.children.size > 256) {
                  const oldest = t.children.keys().next().value;
                  tickets.delete(t.children.get(oldest));
                  t.children.delete(oldest);
                }
              }
              return `/media/${child}/stream`;
            });
            res.writeHead(200, {
              "Content-Type": "application/vnd.apple.mpegurl",
            });
            res.end(output);
            return;
          }
          for (const h of [
            "content-type",
            "content-length",
            "content-range",
            "accept-ranges",
          ])
            if (r.headers.has(h)) res.setHeader(h, r.headers.get(h));
          res.writeHead(r.status);
          if (req.method === "HEAD" || !r.body) res.end();
          else await pipeline(Readable.fromWeb(r.body), res);
        } finally {
          await result.close();
        }
        return;
      }
      const userId = await authorized(req);
      if (!userId) return send(401, { error: "Playback service key required" });
      if (route.pathname === "/feedback/submit") {
        if (req.method !== "POST")
          return send(405, { error: "Method not allowed" });
        if (userId === "service")
          return send(403, { error: "Sign in to send feedback." });
        try {
          const value = JSON.parse(await limitedText(req, 7_000_000));
          return send(200, await submitFeedback(userId, value));
        } catch (error) {
          return send(400, {
            error: error instanceof Error ? error.message : "Invalid feedback",
          });
        }
      }
      if (route.pathname === "/feedback/admin") {
        if (req.method !== "POST")
          return send(405, { error: "Method not allowed" });
        if (!feedbackAdmin || userId !== feedbackAdmin)
          return send(403, { error: "Not available" });
        const value = JSON.parse(await limitedText(req, 20_000));
        const data = await readFeedback();
        if (value?.action === "update") {
          const entry = data.entries.find((item) => item.id === value.id);
          if (!entry) return send(404, { error: "Feedback not found" });
          if (
            !["new", "reviewing", "planned", "completed", "closed"].includes(
              value.status,
            )
          )
            return send(400, { error: "Invalid status" });
          entry.status = value.status;
          entry.updatedAt = Date.now();
          scheduleFeedbackWrite();
        } else if (value?.action === "delete") {
          const index = data.entries.findIndex((item) => item.id === value.id);
          if (index < 0) return send(404, { error: "Feedback not found" });
          data.entries.splice(index, 1);
          scheduleFeedbackWrite();
        } else if (value?.action && value.action !== "list") {
          return send(400, { error: "Invalid action" });
        }
        return send(200, {
          entries: data.entries.slice(0, 250),
          counts: data.entries.reduce((counts, item) => {
            counts[item.status] = (counts[item.status] ?? 0) + 1;
            return counts;
          }, {}),
        });
      }
      if (req.method !== "POST")
        return send(405, { error: "Method not allowed" });
      const body = JSON.parse(await limitedText(req, 1_000_000));
      if (route.pathname === "/analytics/account") {
        if (!(await recordAccountUsage(userId, body)))
          return send(400, { error: "Invalid account usage event" });
        return send(200, { ok: true });
      }
      if (route.pathname === "/analytics/playback") {
        if (!(await recordPlaybackMetric(userId, body)))
          return send(400, { error: "Invalid playback metric" });
        return send(200, { ok: true });
      }
      if (route.pathname === "/analytics/admin") {
        if (!analyticsAdmin || userId !== analyticsAdmin)
          return send(403, { error: "Not available" });
        return send(200, await usageSummary());
      }
      if (route.pathname === "/youtube/device/start") {
        if (userId === "service")
          return send(403, { error: "Sign in to TikTak TV first." });
        const config = youtubeOAuthConfig();
        if (!config)
          return send(503, {
            error: "YouTube account sign-in is being configured.",
          });
        const response = await upstreamFetch(
          "https://oauth2.googleapis.com/device/code",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: config.clientId,
              scope: "https://www.googleapis.com/auth/youtube.readonly",
            }),
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.device_code)
          return send(502, { error: "Google sign-in could not start." });
        youtubeDevices.set(userId, {
          deviceCode: payload.device_code,
          expires: Date.now() + Number(payload.expires_in ?? 900) * 1000,
          interval: Math.max(5, Number(payload.interval ?? 5)),
          lastPoll: 0,
        });
        return send(200, {
          userCode: payload.user_code,
          verificationUrl:
            payload.verification_url ??
            payload.verification_uri ??
            "https://www.google.com/device",
          expiresIn: Number(payload.expires_in ?? 900),
          interval: Math.max(5, Number(payload.interval ?? 5)),
        });
      }
      if (route.pathname === "/youtube/device/poll") {
        if (userId === "service")
          return send(403, { error: "Sign in to TikTak TV first." });
        const config = youtubeOAuthConfig();
        const pending = youtubeDevices.get(userId);
        if (!config || !pending || pending.expires < Date.now())
          return send(410, { error: "Start YouTube sign-in again." });
        if (Date.now() - pending.lastPoll < pending.interval * 900)
          return send(202, { pending: true });
        pending.lastPoll = Date.now();
        const response = await upstreamFetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: youtubeTokenBody(config, {
              device_code: pending.deviceCode,
              grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
            signal: controller.signal,
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (
          payload.error === "authorization_pending" ||
          payload.error === "slow_down"
        ) {
          if (payload.error === "slow_down") pending.interval += 5;
          return send(202, { pending: true, interval: pending.interval });
        }
        if (!response.ok || !payload.access_token) {
          youtubeDevices.delete(userId);
          return send(400, {
            error: "Google sign-in was cancelled or expired.",
          });
        }
        const vault = await readYoutubeVault();
        vault.accounts[userId] = {
          accessToken: payload.access_token,
          refreshToken:
            payload.refresh_token ?? vault.accounts[userId]?.refreshToken ?? "",
          expiresAt: Date.now() + Number(payload.expires_in ?? 3600) * 1000,
          connectedAt: Date.now(),
        };
        await writeYoutubeVault(vault);
        youtubeDevices.delete(userId);
        return send(200, { connected: true });
      }
      if (route.pathname === "/youtube/disconnect") {
        if (userId === "service")
          return send(403, { error: "Sign in to TikTak TV first." });
        const vault = await readYoutubeVault();
        delete vault.accounts[userId];
        await writeYoutubeVault(vault);
        youtubeDevices.delete(userId);
        for (const key of youtubeCache.keys())
          if (key.startsWith(`account:${userId}:`)) youtubeCache.delete(key);
        youtubeFeedRotations.delete(userId);
        youtubeSubscriptionOffsets.delete(userId);
        return send(200, { connected: false });
      }
      if (route.pathname === "/youtube/playlist") {
        const playlistId = String(body.playlistId ?? "").trim();
        if (!/^[A-Za-z0-9_-]{10,64}$/.test(playlistId))
          return send(400, { error: "Invalid YouTube playlist." });
        const playlistParams = {
          part: "snippet,contentDetails,status",
          playlistId,
          maxResults: 5,
        };
        const playlist =
          (await youtubeApi(userId, "playlistItems", playlistParams)) ??
          (await youtubePublicApi("playlistItems", playlistParams));
        const first = playlist?.items?.find(
          (item) =>
            item?.status?.privacyStatus !== "private" &&
            /^[A-Za-z0-9_-]{11}$/.test(
              item?.contentDetails?.videoId ??
                item?.snippet?.resourceId?.videoId ??
                "",
            ),
        );
        const videoId =
          first?.contentDetails?.videoId ??
          first?.snippet?.resourceId?.videoId ??
          "";
        if (!videoId)
          return send(404, {
            error: "This playlist does not contain a playable video.",
          });
        return send(200, {
          selection: {
            playlistId,
            videoId,
            title: String(first?.snippet?.title ?? "YouTube playlist").slice(
              0,
              300,
            ),
            channel: String(
              first?.snippet?.videoOwnerChannelTitle ?? "Playlist",
            ).slice(0, 200),
            thumbnail: String(
              first?.snippet?.thumbnails?.medium?.url ??
                first?.snippet?.thumbnails?.default?.url ??
                "",
            ),
          },
        });
      }
      if (route.pathname === "/youtube/account") {
        if (userId === "service")
          return send(200, {
            configured: !!youtubeOAuthConfig(),
            connected: false,
          });
        const channel = await youtubeApi(userId, "channels", {
          part: "snippet,contentDetails",
          mine: "true",
        });
        if (!channel)
          return send(200, {
            configured: !!youtubeOAuthConfig(),
            connected: false,
          });
        if (body.summary === true)
          return send(200, {
            configured: true,
            connected: true,
            channel: channel.items?.[0]?.snippet ?? null,
          });
        const recentVideoIds = youtubeRecentVideoIds(body.recentVideoIds);
        const interestTopics = youtubeInterestTopics(body.interestTopics);
        const accountCacheKey = `account:${userId}:${recentVideoIds.join(",")}:${interestTopics.join("|")}`;
        const cachedAccount = youtubeCache.get(accountCacheKey);
        const rotateAccount = (account) => {
          const rotation = youtubeFeedRotations.get(userId) ?? 0;
          youtubeFeedRotations.set(userId, rotation + 1);
          return rotateYoutubeAccount(account, rotation);
        };
        if (
          cachedAccount?.expires > Date.now() &&
          (body.refresh !== true || Date.now() - cachedAccount.fetchedAt < 30_000)
        )
          return send(200, rotateAccount(cachedAccount.account));
        const [subscriptions, playlists, activities, popular, gaming, entertainment, technology] = await Promise.all([
          youtubeApi(userId, "subscriptions", {
            part: "snippet",
            mine: "true",
            maxResults: 50,
            order: "relevance",
          }),
          youtubeApi(userId, "playlists", {
            part: "snippet,contentDetails",
            mine: "true",
            maxResults: 50,
          }),
          youtubeApi(userId, "activities", {
            part: "snippet,contentDetails",
            mine: "true",
            maxResults: 30,
          }),
          youtubeApi(userId, "videos", {
            part: "snippet,status,contentDetails",
            chart: "mostPopular",
            maxResults: 50,
            regionCode: "US",
          }),
          ...["20", "24", "28"].map((videoCategoryId) =>
            youtubeApi(userId, "videos", {
              part: "snippet,status,contentDetails",
              chart: "mostPopular",
              maxResults: 30,
              regionCode: "US",
              videoCategoryId,
            }).catch(() => null)),
        ]);
        const selectionFromActivity = (item) => ({
          videoId:
            item?.contentDetails?.upload?.videoId ??
            item?.contentDetails?.playlistItem?.resourceId?.videoId ??
            item?.contentDetails?.recommendation?.resourceId?.videoId ??
            "",
          title: String(item?.snippet?.title ?? "YouTube video").slice(0, 300),
          channel: String(item?.snippet?.channelTitle ?? "").slice(0, 200),
          thumbnail: String(
            item?.snippet?.thumbnails?.medium?.url ??
              item?.snippet?.thumbnails?.default?.url ??
              "",
          ),
        });
        const subscriptionItems = (subscriptions?.items ?? [])
          .map((item) => ({
            id: item?.snippet?.resourceId?.channelId ?? "",
            title: String(item?.snippet?.title ?? "").slice(0, 200),
            thumbnail:
              item?.snippet?.thumbnails?.medium?.url ??
              item?.snippet?.thumbnails?.default?.url ??
              "",
          }))
          .filter((item) => /^[A-Za-z0-9_-]{10,64}$/.test(item.id));
        const subscriptionOffset =
          subscriptionItems.length > 0
            ? (youtubeSubscriptionOffsets.get(userId) ?? 0) %
              subscriptionItems.length
            : 0;
        const subscriptionSample = [
          ...subscriptionItems.slice(subscriptionOffset),
          ...subscriptionItems.slice(0, subscriptionOffset),
        ].slice(0, 12);
        if (subscriptionItems.length > 0)
          youtubeSubscriptionOffsets.set(
            userId,
            (subscriptionOffset + subscriptionSample.length) %
              subscriptionItems.length,
          );
        const recentlyWatched = recentVideoIds.length
          ? await youtubeApi(userId, "videos", {
              part: "snippet,contentDetails,status",
              id: recentVideoIds.join(","),
              maxResults: 50,
            }).catch(() => null)
          : null;
        const recentlyWatchedById = new Map(
          (recentlyWatched?.items ?? []).map((item) => [item?.id, item]),
        );
        const discoveryQueries = interestTopics.length
          ? interestTopics
          : youtubeDiscoveryQueries(
          recentVideoIds
            .map((id) => recentlyWatchedById.get(id))
            .filter((item) => item && youtubeVideoAllowed(item))
            .slice(0, 12)
            .map((item) => item.snippet?.title),
          [],
          );
        const discoverySearches = await Promise.all(
          discoveryQueries.map(async (query) => {
            const cached = youtubeDiscoveryCache.get(query);
            if (cached?.expires > Date.now()) return cached.payload;
            const payload = await youtubeApi(userId, "search", {
              part: "snippet",
              type: "video",
              q: query,
              maxResults: 50,
              videoEmbeddable: "true",
              videoDuration: "medium",
              safeSearch: "moderate",
              order: "relevance",
            }).catch(() => null);
            youtubeDiscoveryCache.set(query, {
              payload,
              expires: Date.now() + (payload ? 12 * 60 * 60_000 : 30 * 60_000),
            });
            while (youtubeDiscoveryCache.size > 100)
              youtubeDiscoveryCache.delete(youtubeDiscoveryCache.keys().next().value);
            return payload;
          }),
        );
        const subscribedChannelIds = new Set(
          (subscriptions?.items ?? []).map((item) => item?.snippet?.resourceId?.channelId),
        );
        const discoveryLists = discoverySearches.map((result) => result?.items ?? []);
        const discoveryCandidates = Array.from(
          { length: Math.max(0, ...discoveryLists.map((items) => items.length)) },
          (_, index) => discoveryLists.map((items) => items[index]).filter(Boolean),
        ).flat().map((item) => ({
            videoId: String(item?.id?.videoId ?? ""),
            title: String(item?.snippet?.title ?? "YouTube video").slice(0, 300),
            channel: String(item?.snippet?.channelTitle ?? "").slice(0, 200),
            thumbnail: String(item?.snippet?.thumbnails?.medium?.url ?? ""),
            channelId: item?.snippet?.channelId,
          })).filter((item) =>
          youtubeVideoIdPattern.test(item.videoId) &&
          !recentVideoIds.includes(item.videoId) &&
          !subscribedChannelIds.has(item.channelId),
        );
        const popularCharts = [popular, gaming, entertainment, technology]
          .map((chart) => chart?.items ?? []);
        const popularCandidates = Array.from(
          { length: Math.max(0, ...popularCharts.map((items) => items.length)) },
          (_, index) => popularCharts.map((items) => items[index]).filter(Boolean),
        ).flat()
          .filter((item) =>
            youtubeVideoIdPattern.test(item?.id) &&
            !recentVideoIds.includes(item.id) &&
            !subscribedChannelIds.has(item?.snippet?.channelId),
          )
          .map((item) => ({ videoId: item.id }));
        const recentChannelIds = [
          ...new Set(
            recentVideoIds
              .map((id) => recentlyWatchedById.get(id)?.snippet?.channelId)
              .filter(
                (id) =>
                  typeof id === "string" && /^[A-Za-z0-9_-]{10,64}$/.test(id),
              ),
          ),
        ].slice(0, 4);
        const feedChannelIds = [
          ...new Set([
            ...recentChannelIds,
            ...subscriptionSample.map((subscription) => subscription.id),
          ]),
        ];
        const feedChannels = feedChannelIds.length
          ? await youtubeApi(userId, "channels", {
              part: "contentDetails",
              id: feedChannelIds.join(","),
              maxResults: 16,
            }).catch(() => null)
          : null;
        const uploadsByChannel = new Map(
          (feedChannels?.items ?? []).map((item) => [
            item?.id,
            item?.contentDetails?.relatedPlaylists?.uploads,
          ]),
        );
        const uploadLists = await Promise.all(
          feedChannelIds.map((channelId) => {
            const playlistId = uploadsByChannel.get(channelId);
            return playlistId
              ? youtubeApi(userId, "playlistItems", {
                  part: "snippet,contentDetails,status",
                  playlistId,
                  maxResults: 24,
                }).catch(() => null)
              : null;
          }),
        );
        const fallbackActivity = new Map(
          await Promise.all(
            feedChannelIds
              .filter((channelId) => {
                const index = feedChannelIds.indexOf(channelId);
                return !(uploadLists[index]?.items?.length > 0);
              })
              .map(async (channelId) => [
                channelId,
                await youtubeApi(userId, "activities", {
                  part: "snippet,contentDetails",
                  channelId,
                  maxResults: 12,
                }).catch(() => null),
              ]),
          ),
        );
        const selectionFromUpload = (item) => ({
          videoId:
            item?.contentDetails?.videoId ??
            item?.snippet?.resourceId?.videoId ??
            "",
          title: String(item?.snippet?.title ?? "YouTube video").slice(0, 300),
          channel: String(item?.snippet?.videoOwnerChannelTitle ?? "").slice(
            0,
            200,
          ),
          thumbnail: String(
            item?.snippet?.thumbnails?.medium?.url ??
              item?.snippet?.thumbnails?.default?.url ??
              "",
          ),
        });
        const uploadsFor = (channelIds) =>
          channelIds.flatMap((channelId) => {
            const index = feedChannelIds.indexOf(channelId);
            const uploads = uploadLists[index]?.items ?? [];
            return uploads.length
              ? uploads
                  .filter((item) => item?.status?.privacyStatus !== "private")
                  .map(selectionFromUpload)
              : (fallbackActivity.get(channelId)?.items ?? []).map(
                  selectionFromActivity,
                );
          });
        const recentCandidates = uploadsFor(recentChannelIds).filter(
          (item) =>
            youtubeVideoIdPattern.test(item.videoId) &&
            !recentVideoIds.includes(item.videoId),
        );
        const feedCandidates = [
          ...uploadsFor(
            subscriptionSample.map((subscription) => subscription.id),
          ),
          ...(subscriptionSample.length
            ? []
            : (activities?.items ?? []).map(selectionFromActivity)),
        ].filter((item) => youtubeVideoIdPattern.test(item.videoId));
        const uniqueFeed = [
          ...new Map(
            feedCandidates.map((item) => [item.videoId, item]),
          ).values(),
        ].slice(0, 300);
        const uniqueRecentFeed = [
          ...new Map(
            recentCandidates.map((item) => [item.videoId, item]),
          ).values(),
        ].slice(0, 96);
        const watchLaterId = String(
          channel.items?.[0]?.contentDetails?.relatedPlaylists?.watchLater ??
            "",
        );
        const watchLaterPlaylist = /^[A-Za-z0-9_-]{10,64}$/.test(watchLaterId)
          ? [
              {
                id: watchLaterId,
                snippet: { title: "Watch Later", thumbnails: {} },
                contentDetails: {},
              },
            ]
          : [];
        const playlistItems = [
          ...watchLaterPlaylist,
          ...(playlists?.items ?? []),
        ].slice(0, 51);
        const playlistLeads = await Promise.all(
          playlistItems.map((item) =>
            youtubeApi(userId, "playlistItems", {
              part: "snippet,contentDetails,status",
              playlistId: item?.id ?? "",
              maxResults: 5,
            }),
          ),
        );
        const playlistSelections = playlistItems.flatMap((item, index) => {
          const first = playlistLeads[index]?.items?.find(
            (candidate) =>
              candidate?.status?.privacyStatus !== "private" &&
              /^[A-Za-z0-9_-]{11}$/.test(
                candidate?.contentDetails?.videoId ??
                  candidate?.snippet?.resourceId?.videoId ??
                  "",
              ),
          );
          const videoId = String(
            first?.contentDetails?.videoId ??
              first?.snippet?.resourceId?.videoId ??
              "",
          );
          if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return [];
          return [
            {
              playlistId: item?.id ?? "",
              videoId,
              title: String(item?.snippet?.title ?? "YouTube playlist").slice(
                0,
                300,
              ),
              channel: "Playlist",
              thumbnail:
                item?.snippet?.thumbnails?.medium?.url ??
                item?.snippet?.thumbnails?.default?.url ??
                first?.snippet?.thumbnails?.medium?.url ??
                first?.snippet?.thumbnails?.default?.url ??
                "",
              itemCount: Number(item?.contentDetails?.itemCount ?? 0),
            },
          ];
        });
        const detailIds = [
          ...new Set([
            ...discoveryCandidates.map((item) => item.videoId),
            ...popularCandidates.map((item) => item.videoId),
            ...uniqueFeed.map((item) => item.videoId),
            ...uniqueRecentFeed.map((item) => item.videoId),
            ...playlistSelections.map((item) => item.videoId),
            ...recentVideoIds,
          ]),
        ];
        const detailBatches = [];
        for (let offset = 0; offset < detailIds.length; offset += 50)
          detailBatches.push(detailIds.slice(offset, offset + 50));
        const videoDetails = await Promise.all(
          detailBatches.map((ids) =>
            youtubeApi(userId, "videos", {
              part: "snippet,status,contentDetails",
              id: ids.join(","),
              maxResults: 50,
            }),
          ),
        );
        const detailsById = new Map(
          [...popularCharts.flat(), ...videoDetails.flatMap((payload) => payload?.items ?? [])]
            .map((item) => [item?.id, item]),
        );
        const decorate = (item) => {
          const detail = detailsById.get(item.videoId);
          if (!detail) return null;
          if (detail?.status?.embeddable === false) return null;
          if (
            String(detail?.snippet?.categoryId ?? "") !== "10" &&
            !youtubeLongFormVideo(detail)
          )
            return null;
          return {
            ...item,
            title: String(detail?.snippet?.title ?? item.title).slice(0, 300),
            channel: String(
              detail?.snippet?.channelTitle ?? item.channel,
            ).slice(0, 200),
            channelId: String(detail?.snippet?.channelId ?? item.channelId ?? ""),
            thumbnail: String(
              detail?.snippet?.thumbnails?.medium?.url ??
                detail?.snippet?.thumbnails?.default?.url ??
                item.thumbnail ??
                "",
            ),
            kind:
              String(detail?.snippet?.categoryId ?? "") === "10"
                ? "music"
                : "video",
          };
        };
        const decoratedFeed = uniqueFeed.map(decorate).filter(Boolean);
        const decoratedDiscovery = discoveryCandidates
          .map(decorate)
          .filter((item) => item?.kind === "video" && !subscribedChannelIds.has(detailsById.get(item.videoId)?.snippet?.channelId));
        const decoratedPopular = popularCandidates
          .map(decorate)
          .filter((item) => item?.kind === "video" && !subscribedChannelIds.has(detailsById.get(item.videoId)?.snippet?.channelId));
        const decoratedHistory = recentVideoIds
          .map((videoId) => decorate({ videoId }))
          .filter(Boolean);
        const watchedTitlesByChannel = new Map();
        for (const id of recentVideoIds) {
          const item = recentlyWatchedById.get(id);
          const channelId = item?.snippet?.channelId;
          if (!channelId) continue;
          const titles = watchedTitlesByChannel.get(channelId) ?? [];
          titles.push(item?.snippet?.title ?? "");
          watchedTitlesByChannel.set(channelId, titles);
        }
        const watchedChannelVideos = uniqueRecentFeed
          .map(decorate)
          .filter((item) => item?.kind === "video");
        const decoratedRecentFeed = watchedChannelVideos
          .filter((item) =>
            (watchedTitlesByChannel.get(
              detailsById.get(item.videoId)?.snippet?.channelId,
            ) ?? []).some((title) => youtubeTitlesRelated(title, item.title)),
          )
          .slice(0, 48);
        const decoratedPlaylists = playlistSelections
          .map(decorate)
          .filter(Boolean);
        const account = {
          configured: true,
          connected: true,
          channel: channel.items?.[0]?.snippet ?? null,
          subscriptions: subscriptionItems,
          playlists: decoratedPlaylists,
          videoFeed: (interestTopics.length
            ? youtubeForYouFeed(decoratedDiscovery, [], [])
            : youtubeForYouFeed(
            decoratedDiscovery,
            decoratedPopular,
            decoratedRecentFeed.filter((item) =>
              !subscribedChannelIds.has(detailsById.get(item.videoId)?.snippet?.channelId)),
          )).slice(0, 160),
          musicFeed: decoratedFeed.filter((item) => item.kind === "music"),
          recentFeed: decoratedRecentFeed,
          subscriptionFeed: decoratedFeed.filter((item) => item.kind === "video"),
          historyFeed: decoratedHistory,
        };
        youtubeCache.set(accountCacheKey, {
          account,
          fetchedAt: Date.now(),
          expires: Date.now() + 2 * 60_000,
        });
        while (youtubeCache.size > 100)
          youtubeCache.delete(youtubeCache.keys().next().value);
        return send(200, rotateAccount(account));
      }
      if (route.pathname === "/youtube/search") {
        const query = String(body.query ?? "").trim();
        const channelId = String(body.channelId ?? "").trim();
        const kind = body.kind === "music" ? "music" : "video";
        if ((!query && !channelId) || query.length > 120)
          return send(400, { error: "Enter a shorter YouTube search." });
        if (channelId && !/^[A-Za-z0-9_-]{10,64}$/.test(channelId))
          return send(400, { error: "Invalid YouTube channel." });
        const cacheKey = `${kind}:${channelId}:${query.toLocaleLowerCase()}`;
        const cached = youtubeCache.get(cacheKey);
        if (cached?.expires > Date.now())
          return send(200, { results: cached.results });
        const searchParams = {
          part: "snippet",
          type: "video",
          maxResults: 24,
          videoEmbeddable: "true",
          safeSearch: "moderate",
          ...(query ? { q: query } : {}),
          ...(channelId ? { channelId, order: "date" } : {}),
          ...(kind === "music" ? { videoCategoryId: "10" } : { videoDuration: "medium" }),
        };
        const payload = await youtubeApi(userId, "search", searchParams)
          ?? await youtubePublicApi("search", searchParams);
        if (!payload)
          return send(503, {
            error: "YouTube search is temporarily unavailable. Connect your YouTube account or try again later.",
          });
        let results = (Array.isArray(payload.items) ? payload.items : [])
          .map((item) => ({
            videoId: String(item?.id?.videoId ?? ""),
            title: String(item?.snippet?.title ?? "YouTube video").slice(0, 300),
            channel: String(item?.snippet?.channelTitle ?? "").slice(0, 200),
            thumbnail: String(item?.snippet?.thumbnails?.medium?.url
              ?? item?.snippet?.thumbnails?.default?.url ?? ""),
          }))
          .filter((item) => youtubeVideoIdPattern.test(item.videoId));
        if (results.length) {
          const videoParams = {
            part: "snippet,status,contentDetails",
            id: results.map((item) => item.videoId).join(","),
            maxResults: 50,
          };
          const details = await youtubeApi(userId, "videos", videoParams)
            ?? await youtubePublicApi("videos", videoParams);
          if (!details)
            return send(502, { error: "YouTube search is temporarily unavailable." });
          const allowed = new Set(
            (details.items ?? [])
              .filter((item) => youtubeVideoAllowed(item, kind))
              .map((item) => item.id),
          );
          results = results.filter((item) => allowed.has(item.videoId));
        }
        results = results.map((item) => ({ ...item, kind }));
        youtubeCache.set(cacheKey, {
          results,
          expires: Date.now() + 15 * 60_000,
        });
        while (youtubeCache.size > 100)
          youtubeCache.delete(youtubeCache.keys().next().value);
        return send(200, { results });
      }
      if (route.pathname === "/youtube/playback") {
        const videoId = String(body.videoId ?? "").trim();
        const kind = body.kind === "music" ? "music" : "video";
        if (!youtubeVideoIdPattern.test(videoId))
          return send(400, { error: "Invalid YouTube video." });
        const cacheKey = `${kind}:${videoId}`;
        const cached = youtubePlaybackCache.get(cacheKey);
        if (cached?.expires > Date.now()) {
          const id = ticket(cached.playback.url);
          return send(200, {
            playback: {
              ...cached.playback,
              url: `/media/${id}/stream`,
            },
          });
        }
        const playback = await resolveYoutubePlayback(
          videoId,
          kind,
          controller.signal,
        );
        if (!playback)
          return send(404, {
            error:
              "This upload has no compatible stream. It may be private, paid, age-restricted, deleted, or unavailable in your region.",
          });
        youtubePlaybackCache.set(cacheKey, {
          playback,
          expires: Date.now() + 5 * 60_000,
        });
        while (youtubePlaybackCache.size > 200)
          youtubePlaybackCache.delete(youtubePlaybackCache.keys().next().value);
        const id = ticket(playback.url);
        return send(200, {
          playback: { ...playback, url: `/media/${id}/stream` },
        });
      }
      if (route.pathname === "/sponsorblock") {
        const videoId = String(body.videoId ?? "").trim();
        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId))
          return send(400, { error: "Invalid YouTube video." });
        const cached = sponsorCache.get(videoId);
        if (cached?.expires > Date.now())
          return send(200, { segments: cached.segments });
        const target = new URL("https://sponsor.ajay.app/api/skipSegments");
        target.searchParams.set("videoID", videoId);
        target.searchParams.set(
          "categories",
          JSON.stringify([
            "sponsor",
            "selfpromo",
            "interaction",
            "intro",
            "outro",
            "preview",
            "music_offtopic",
          ]),
        );
        const upstream = await fetchSafe(target.href, {
          signal: controller.signal,
        });
        try {
          if (upstream.response.status === 404) {
            sponsorCache.set(videoId, {
              segments: [],
              expires: Date.now() + 60 * 60_000,
            });
            return send(200, { segments: [] });
          }
          if (!upstream.response.ok)
            return send(502, {
              error: "SponsorBlock is temporarily unavailable.",
            });
          const payload = JSON.parse(
            await limitedText(upstream.response, 1_000_000),
          );
          const segments = (Array.isArray(payload) ? payload : [])
            .map((entry) => ({
              start: Number(entry?.segment?.[0]),
              end: Number(entry?.segment?.[1]),
              category: String(entry?.category ?? "sponsor").slice(0, 40),
            }))
            .filter(
              (entry) =>
                Number.isFinite(entry.start) &&
                Number.isFinite(entry.end) &&
                entry.start >= 0 &&
                entry.end > entry.start,
            )
            .slice(0, 200);
          sponsorCache.set(videoId, {
            segments,
            expires: Date.now() + 2 * 60 * 60_000,
          });
          while (sponsorCache.size > 500)
            sponsorCache.delete(sponsorCache.keys().next().value);
          return send(200, { segments });
        } finally {
          await upstream.close();
        }
      }
      if (route.pathname === "/status") {
        return send(200, {
          ok: true,
          version: 2,
          uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
          load: {
            jobs: jobs.size,
            tickets: tickets.size,
            parties: parties.size,
          },
          capacity: limits,
          features: {
            relay: true,
            conversion: true,
            downloads: true,
            watchTogether: true,
            participantNames: true,
            hostEndedRoom: true,
            friendSetup: !!friendKey,
            xmltv: true,
            youtube: true,
            sponsorBlock: true,
          },
        });
      }
      if (route.pathname === "/party") {
        const action = String(body.action ?? "");
        if (action === "create") {
          if (userId === "service")
            return send(403, {
              error: "Sign in before starting Watch Together.",
            });
          const source = body.playback;
          const item = source?.item;
          let parsedUrl;
          try {
            parsedUrl = new URL(String(source?.url ?? ""));
          } catch {
            return send(400, { error: "This source cannot be shared." });
          }
          if (
            !source ||
            !item ||
            item.type === "live" ||
            !["https:", "http:"].includes(parsedUrl.protocol) ||
            String(source.url).length > 8192 ||
            typeof item.id !== "string" ||
            typeof item.name !== "string" ||
            item.id.length > 500 ||
            item.name.length > 500
          )
            return send(400, {
              error: "Watch Together is available for movies and episodes.",
            });
          if (parties.size >= limits.parties)
            return send(503, { error: "Watch Together is currently full." });
          const previousCreate = partyCreates.get(userId) ?? 0;
          if (Date.now() - previousCreate < 5_000)
            return send(429, {
              error: "Please wait a few seconds before creating another room.",
            });
          partyCreates.set(userId, Date.now());
          const id = randomBytes(18).toString("base64url");
          const now = Date.now();
          const playback = {
            item: {
              id: item.id,
              name: item.name,
              type: item.type,
              source: item.source,
              provider: item.provider,
              poster: item.poster,
              background: item.background,
              year: item.year,
            },
            url: String(source.url),
            episode: source.episode,
            hls: !!source.hls,
            mode: source.mode,
            subtitles: Array.isArray(source.subtitles)
              ? source.subtitles.slice(0, 12)
              : [],
            prepared: true,
          };
          const identity = partyIdentity(body.member);
          const party = {
            id,
            host: userId,
            playback,
            state: {
              position: Math.max(0, Number(body.position) || 0),
              paused: body.paused !== false,
              updatedAt: now,
              revision: 1,
            },
            members: new Map([[userId, { ...identity, seen: now }]]),
            kicked: new Set(),
            expires: now + 6 * 60 * 60_000,
          };
          parties.set(id, party);
          return send(200, partyResponse(party, userId));
        }
        const id = String(body.id ?? "");
        const party = parties.get(id);
        if (endedParties.has(id))
          return send(410, {
            error: "The host ended this Watch Together room.",
          });
        if (!/^[A-Za-z0-9_-]{24}$/.test(id) || !party)
          return send(404, { error: "This Watch Together link expired." });
        if (userId === "service")
          return send(403, { error: "Sign in before joining Watch Together." });
        if (party.kicked.has(userId))
          return send(403, { error: "The host removed you from this room." });
        const now = Date.now();
        const currentMember = party.members.get(userId);
        if (!currentMember && party.members.size >= limits.partyMembers)
          return send(503, { error: "This Watch Together room is full." });
        party.members.set(userId, {
          ...partyIdentity(body.member ?? currentMember),
          seen: now,
        });
        party.expires = now + 6 * 60 * 60_000;
        if (action === "end") {
          if (party.host !== userId)
            return send(403, { error: "Only the host can end this room." });
          parties.delete(id);
          endedParties.set(id, now);
          return send(200, { ok: true, ended: true });
        } else if (action === "kick") {
          if (party.host !== userId)
            return send(403, {
              error: "Only the host can remove participants.",
            });
          const memberKey = String(body.memberKey ?? "");
          const member = [...party.members.keys()].find(
            (id) =>
              id !== party.host &&
              createHmac("sha256", token)
                .update(id)
                .digest("base64url")
                .slice(0, 16) === memberKey,
          );
          if (!member)
            return send(404, { error: "That participant already left." });
          party.members.delete(member);
          party.kicked.add(member);
        } else if (action === "state" && body.update && party.host === userId) {
          party.state = {
            position: Math.max(0, Number(body.update.position) || 0),
            paused: body.update.paused !== false,
            updatedAt: now,
            revision: party.state.revision + 1,
          };
        } else if (!["join", "state", "kick"].includes(action)) {
          return send(400, { error: "Invalid Watch Together request." });
        }
        return send(200, partyResponse(party, userId));
      }
      if (route.pathname === "/friend/status") {
        const [vault, database] = await Promise.all([
          readFriendVault(),
          readFriendVaults(),
        ]);
        const owned = Object.values(database.vaults ?? {}).find(
          (item) => item.ownerUserId === userId,
        );
        return send(200, {
          available: !!vault || Object.keys(database.vaults ?? {}).length > 0,
          owner: userId === friendOwner || !!owned,
          published: !!owned || (!!vault && userId === friendOwner),
        });
      }
      if (route.pathname === "/friend/restore-addons") {
        if (userId === "service")
          return send(403, { error: "Sign in to repair shared add-ons." });
        const urls = Array.isArray(body.urls) ? body.urls.slice(0, 100) : [];
        const addons = (
          await Promise.all(
            urls.map(async (url) => ({
              url: String(url),
              base: await restoreFriendAddonBase(url, userId),
            })),
          )
        ).filter((item) => item.base);
        return send(200, { addons });
      }
      if (route.pathname === "/friend/setup") {
        if (userId === "service")
          return send(403, { error: "Sign in before creating a friend code." });
        if (!friendKey)
          return send(503, {
            error: "Friend vault encryption is not configured.",
          });
        const code = String(body.code ?? "").trim();
        let torboxKey = String(body.torboxKey ?? "").trim();
        let realDebridKey = String(body.realDebridKey ?? "").trim();
        const template = body.template;
        if (!/^\d{6,12}$/.test(code))
          return send(400, { error: "Use a 6 to 12 digit friend code." });
        if (torboxKey.startsWith("friend:")) {
          const access = await vaultForGrant(
            torboxKey.slice("friend:".length),
            userId,
          );
          if (
            !access?.vault?.torboxKey ||
            (access.vault.ownerUserId && access.vault.ownerUserId !== userId) ||
            (!access.vault.ownerUserId && userId !== friendOwner)
          )
            return send(403, {
              error: "Connect your own TorBox key before sharing your setup.",
            });
          torboxKey = access.vault.torboxKey;
        }
        if (realDebridKey.startsWith("friend-rd:")) {
          const access = await vaultForGrant(
            realDebridKey.slice("friend-rd:".length),
            userId,
          );
          if (
            !access?.vault?.realDebridKey ||
            access.vault.ownerUserId !== userId
          )
            return send(403, {
              error:
                "Connect your own Real-Debrid key before sharing your setup.",
            });
          realDebridKey = access.vault.realDebridKey;
        }
        if (
          !template ||
          !Array.isArray(template.addons) ||
          template.addons.length > 100 ||
          !Array.isArray(template.collections) ||
          template.collections.length > 250 ||
          !Array.isArray(template.homeCatalogs) ||
          template.homeCatalogs.length > 500
        )
          return send(400, { error: "The shared setup is invalid." });
        const legacyVault = await readFriendVault();
        if (codeMatchesVault(code, legacyVault))
          return send(409, {
            error: "That friend code is reserved. Choose another code.",
          });
        const salt = randomBytes(16);
        const codeHash = scryptSync(code, salt, 32);
        const database = await readFriendVaults();
        const vaultId = friendCodeId(code);
        if (
          database.vaults[vaultId] &&
          database.vaults[vaultId].ownerUserId !== userId
        )
          return send(409, {
            error: "That friend code is already in use. Choose another code.",
          });
        const ownsExisting = Object.values(database.vaults ?? {}).some(
          (existing) => existing.ownerUserId === userId,
        );
        if (!ownsExisting && Object.keys(database.vaults ?? {}).length >= 5000)
          return send(503, {
            error: "Friend-code capacity is full. Try again later.",
          });
        for (const [id, existing] of Object.entries(database.vaults ?? {}))
          if (existing.ownerUserId === userId) delete database.vaults[id];
        database.vaults[vaultId] = {
          ownerUserId: userId,
          codeSalt: salt.toString("base64"),
          codeHash: codeHash.toString("base64"),
          torboxKey,
          realDebridKey,
          template,
          updated: Date.now(),
        };
        await writeFriendVaults(database);
        const vault = database.vaults[vaultId];
        const grant = friendGrant(userId, vault.updated, vaultId);
        return send(200, {
          ok: true,
          torboxKey: torboxKey ? `friend:${grant}` : "",
          realDebridKey: realDebridKey ? `friend-rd:${grant}` : "",
        });
      }
      if (route.pathname === "/friend/revoke") {
        if (userId === "service")
          return send(403, { error: "Sign in before changing a friend code." });
        const database = await readFriendVaults();
        let removed = false;
        for (const [id, vault] of Object.entries(database.vaults ?? {})) {
          if (vault.ownerUserId === userId) {
            delete database.vaults[id];
            removed = true;
          }
        }
        if (removed) await writeFriendVaults(database);
        return send(200, { ok: true });
      }
      if (route.pathname === "/friend/redeem") {
        if (userId === "service")
          return send(403, {
            error: "Sign in to Nuvio before using a friend code.",
          });
        const attemptKey = `${userId}:${req.socket.remoteAddress ?? "unknown"}`;
        const attempt = friendAttempts.get(attemptKey) ?? {
          count: 0,
          reset: Date.now() + 15 * 60_000,
        };
        if (attempt.reset < Date.now()) {
          attempt.count = 0;
          attempt.reset = Date.now() + 15 * 60_000;
        }
        if (attempt.count >= 6)
          return send(429, {
            error: "Too many attempts. Try again in 15 minutes.",
          });
        attempt.count += 1;
        friendAttempts.set(attemptKey, attempt);
        const code = String(body.code ?? "").trim();
        if (!friendKey)
          return send(503, {
            error: "Friend setup is temporarily unavailable.",
          });
        if (!/^\d{6,12}$/.test(code))
          return send(403, { error: "That friend code was not accepted." });
        const database = await readFriendVaults();
        let vaultId = friendCodeId(code);
        let vault = database.vaults?.[vaultId];
        if (!vault) {
          vault = await readFriendVault();
          vaultId = "";
        }
        if (!vault)
          return send(403, { error: "That friend code was not accepted." });
        if (!codeMatchesVault(code, vault))
          return send(403, { error: "That friend code was not accepted." });
        friendAttempts.delete(attemptKey);
        const grant = friendGrant(userId, vault.updated, vaultId);
        return send(200, {
          // A friend code is an explicit full-setup share. Preserve each
          // original add-on base exactly so Nuvio and every compatible client
          // receive a portable manifest URL instead of a TikTak-only proxy.
          template: vault.template,
          torboxKey: vault.torboxKey ? `friend:${grant}` : "",
          realDebridKey: vault.realDebridKey ? `friend-rd:${grant}` : "",
        });
      }
      if (route.pathname === "/guide") {
        const url = new URL(body.url);
        if (!["http:", "https:"].includes(url.protocol))
          return send(400, { error: "Only an HTTP(S) XMLTV guide is allowed" });
        await mkdir(guideCacheDir, { recursive: true });
        const cacheName =
          createHash("sha256").update(url.href).digest("hex") + ".xml";
        const cachePath = join(guideCacheDir, cacheName);
        const cached = await stat(cachePath).catch(() => null);
        if (cached && Date.now() - cached.mtimeMs < guideCacheAge) {
          res.writeHead(200, {
            "Content-Type": "application/xml; charset=utf-8",
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding",
            "X-TikTak-Guide-Cache": "hit",
          });
          await pipeline(createReadStream(cachePath), createGzip(), res);
          return;
        }
        const result = await fetchSafe(url.href, {
          // A guide download fills a shared disk cache for every browser. Keep
          // it running when the initiating tab navigates away or disconnects.
          signal: AbortSignal.timeout(180000),
        });
        try {
          const canCache = result.response.ok && result.response.body;
          res.writeHead(result.response.status, {
            "Content-Type":
              result.response.headers.get("content-type") ??
              "application/xml; charset=utf-8",
            "X-TikTak-Guide-Cache": "miss",
            "Content-Encoding": "gzip",
            Vary: "Accept-Encoding",
          });
          if (canCache) {
            const tempPath = `${cachePath}.${randomBytes(6).toString("hex")}.tmp`;
            const [clientBody, cacheBody] = result.response.body.tee();
            let bytes = 0;
            const client = Readable.fromWeb(clientBody);
            client.on("data", (chunk) => {
              bytes += chunk.byteLength;
              if (bytes > 192_000_000)
                client.destroy(new Error("Guide too large"));
            });
            const clientWrite = pipeline(client, createGzip(), res).catch(
              () => undefined,
            );
            await pipeline(
              Readable.fromWeb(cacheBody),
              createWriteStream(tempPath),
            );
            await rename(tempPath, cachePath).catch(() =>
              rm(tempPath, { force: true }),
            );
            await clientWrite;
            return;
          }
          let bytes = 0;
          for await (const chunk of result.response.body ?? []) {
            bytes += chunk.byteLength;
            if (bytes > 192_000_000) throw new Error("Guide too large");
            if (!res.write(chunk))
              await new Promise((resolve) => res.once("drain", resolve));
          }
          res.end();
        } finally {
          await result.close();
        }
        return;
      }
      if (route.pathname === "/download") {
        await resolveTarget(body.url);
        if (jobs.size >= limits.jobs)
          return send(503, {
            error: "Playback service job capacity reached. Retry shortly.",
          });
        const runningJobs = [...jobs.values()].filter((job) => job.running);
        if (runningJobs.length >= 2)
          return send(429, {
            error:
              "Two media conversions are already active. Wait for one to finish and retry.",
          });
        const headers = sourceHeaders(body.headers);
        if (
          !Object.keys(headers).some(
            (name) => name.toLowerCase() === "user-agent",
          )
        )
          headers["User-Agent"] = "VLC/3.0.21 LibVLC/3.0.21";
        const id = randomBytes(24).toString("base64url");
        const input = ticket(body.url, headers);
        const address = server.address();
        const sourcePath = new URL(body.url).pathname.toLowerCase();
        const inputFile = sourcePath.endsWith(".m3u8")
          ? "stream.m3u8"
          : "stream.ts";
        const inputUrl =
          "http://127.0.0.1:" +
          address.port +
          "/media/" +
          input +
          "/" +
          inputFile;
        const hlsInputArgs =
          inputFile === "stream.m3u8"
            ? [
                "-allowed_extensions",
                "ALL",
                "-allowed_segment_extensions",
                "ALL",
                "-extension_picky",
                "0",
              ]
            : [];
        jobs.set(id, {
          kind: "download",
          filename: safeDownloadName(body.filename),
          args: [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-y",
            "-fflags",
            "+genpts+discardcorrupt",
            ...hlsInputArgs,
            "-i",
            inputUrl,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-ac",
            "2",
            "-movflags",
            "frag_keyframe+empty_moov+default_base_moof",
            "-f",
            "mp4",
            "pipe:1",
          ],
          process: null,
          touched: Date.now(),
          running: false,
        });
        return send(200, { path: `/media/${id}/download.mp4` });
      }
      if (route.pathname === "/prepare") {
        await resolveTarget(body.url);
        const headers = sourceHeaders(body.headers);
        if (
          !Object.keys(headers).some(
            (name) => name.toLowerCase() === "user-agent",
          )
        )
          headers["User-Agent"] = "VLC/3.0.21 LibVLC/3.0.21";
        if (body.mode === "remux" || body.mode === "transcode") {
          const replaceId = /^\/media\/([A-Za-z0-9_-]{32})\//.exec(
            String(body.replace ?? ""),
          )?.[1];
          const replaced = replaceId ? jobs.get(replaceId) : undefined;
          if (replaced) {
            replaced.process?.kill("SIGTERM");
            jobs.delete(replaceId);
            void rm(replaced.dir, { recursive: true, force: true }).catch(
              () => {},
            );
          }
          // A user changing live channels must replace their previous live
          // conversion immediately. Waiting for the stale-job sweep made the
          // next channel fail with HTTP 429 for up to two minutes.
          if (body.live)
            for (const [jobId, job] of jobs)
              if (job.owner === userId && job.live) {
                job.process?.kill("SIGTERM");
                jobs.delete(jobId);
                if (job.dir)
                  void rm(job.dir, { recursive: true, force: true }).catch(
                    () => {},
                  );
              }
          if (jobs.size >= limits.jobs)
            return send(503, {
              error: "Playback service job capacity reached. Retry shortly.",
            });
          const runningJobs = [...jobs.values()].filter(
            (job) => job.running && job.mode === body.mode,
          );
          const conversionLimit = body.mode === "transcode" ? 2 : 8;
          if (runningJobs.length >= conversionLimit)
            return send(429, {
              error:
                body.mode === "transcode"
                  ? "Two video transcodes are already active. Retry shortly."
                  : "The live relay is busy. Retry shortly.",
            });
          const id = randomBytes(24).toString("base64url");
          const dir = await mkdtemp(join(tmpdir(), "tiktak-"));
          const input = ticket(body.url, headers);
          const address = server.address();
          const sourcePath = new URL(body.url).pathname.toLowerCase();
          const inputFile = sourcePath.endsWith(".m3u8")
            ? "stream.m3u8"
            : "stream.ts";
          const inputUrl =
            "http://127.0.0.1:" +
            address.port +
            "/media/" +
            input +
            "/" +
            inputFile;
          const hlsInputArgs =
            inputFile === "stream.m3u8"
              ? [
                  "-allowed_extensions",
                  "ALL",
                  "-allowed_segment_extensions",
                  "ALL",
                  "-extension_picky",
                  "0",
                ]
              : [];
          const start = body.live
            ? 0
            : Math.min(24 * 60 * 60, Math.max(0, Number(body.start) || 0));
          const audioTracks = body.live
            ? []
            : await probeAudioTracks(inputUrl, hlsInputArgs);
          const multiAudio = audioTracks.length > 1;
          if (body.audioCodec === "webm") {
            const args = [
              "-hide_banner",
              "-loglevel",
              "error",
              "-nostdin",
              "-y",
              "-re",
              ...hlsInputArgs,
              ...(start ? ["-ss", String(start)] : []),
              "-i",
              inputUrl,
              "-map",
              "0:v:0?",
              "-map",
              "0:a:0?",
              "-c:v",
              "libvpx",
              "-deadline",
              "realtime",
              "-cpu-used",
              "12",
              "-b:v",
              "1000k",
              "-vf",
              "scale=-2:480",
              "-threads",
              "2",
              "-c:a",
              "libopus",
              "-ac",
              "2",
              "-ar",
              "48000",
              "-b:a",
              "96k",
              "-f",
              "webm",
              "-live",
              "1",
              "-cluster_time_limit",
              "1000",
              "pipe:1",
            ];
            jobs.set(id, {
              kind: "webm",
              owner: userId,
              mode: body.mode,
              live: !!body.live,
              args,
              process: null,
              dir,
              touched: Date.now(),
              running: false,
            });
            return send(200, { path: `/media/${id}/stream.webm`, hls: false });
          }
          const args = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-fflags",
            "+genpts+discardcorrupt",
            "-protocol_whitelist",
            "http,https,tcp,tls,crypto",
            "-format_whitelist",
            "hls,mpegts,mov,matroska,webm,aac,mp3",
            ...(body.live ? ["-re"] : []),
            ...hlsInputArgs,
            ...(start ? ["-ss", String(start)] : []),
            "-i",
            inputUrl,
            "-map",
            "0:v:0?",
            ...(multiAudio
              ? audioTracks.flatMap((track) => [
                  "-map",
                  `0:a:${track.audioIndex}?`,
                ])
              : ["-map", "0:a:0?"]),
            ...(body.mode === "transcode"
              ? [
                  "-c:v",
                  "libx264",
                  "-preset",
                  "ultrafast",
                  "-tune",
                  "zerolatency",
                  "-crf",
                  "25",
                  "-vf",
                  "scale=-2:480,setpts=PTS-STARTPTS",
                  "-g",
                  "30",
                  "-keyint_min",
                  "30",
                  "-sc_threshold",
                  "0",
                  "-threads",
                  "2",
                ]
              : ["-c:v", "copy"]),
            "-c:a",
            body.audioCodec === "mp3"
              ? "libmp3lame"
              : body.audioCodec === "opus"
                ? "libopus"
                : "aac",
            ...(body.audioCodec === "aac" || !body.audioCodec
              ? ["-profile:a", "aac_low"]
              : []),
            "-ac",
            "2",
            "-ar",
            "48000",
            "-b:a",
            "128k",
            "-af",
            body.mode === "transcode"
              ? "aresample=async=1000:first_pts=0"
              : "aresample=async=1000",
            "-pix_fmt",
            "yuv420p",
            "-max_interleave_delta",
            "0",
            "-avoid_negative_ts",
            "make_zero",
            "-f",
            "hls",
            "-hls_time",
            "2",
            "-hls_list_size",
            body.live ? "12" : "0",
            ...(body.live
              ? [
                  "-hls_delete_threshold",
                  "60",
                  "-hls_flags",
                  "delete_segments+independent_segments",
                ]
              : [
                  "-hls_playlist_type",
                  "event",
                  "-hls_flags",
                  "independent_segments",
                ]),
            ...(multiAudio
              ? [
                  "-master_pl_name",
                  "master.m3u8",
                  "-var_stream_map",
                  [
                    ...audioTracks.map(
                      (track, index) =>
                        `a:${index},agroup:audio${index === 0 ? ",default:yes" : ""},language:${track.language},name:audio${index}`,
                    ),
                    "v:0,agroup:audio,name:video",
                  ].join(" "),
                ]
              : []),
            "-hls_segment_filename",
            join(dir, multiAudio ? "segment%v-%d.ts" : "segment%d.ts"),
            join(dir, multiAudio ? "stream%v.m3u8" : "index.m3u8"),
          ];
          const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, {
            stdio: ["ignore", "ignore", "ignore"],
            windowsHide: true,
          });
          const job = {
            owner: userId,
            mode: body.mode,
            live: !!body.live,
            process: child,
            dir,
            touched: Date.now(),
            failed: false,
            running: true,
          };
          jobs.set(id, job);
          child.on("error", () => {
            job.failed = true;
          });
          child.on("exit", (code) => {
            job.running = false;
            if (code) job.failed = true;
            setTimeout(() => {
              if (jobs.get(id) !== job || job.running) return;
              jobs.delete(id);
              void rm(job.dir, { recursive: true, force: true }).catch(
                () => {},
              );
            }, 30000).unref();
          });
          let ready = false;
          for (
            let n = 0;
            n < 250 && !job.failed && !controller.signal.aborted;
            n++
          ) {
            try {
              const info = await stat(
                join(dir, multiAudio ? "master.m3u8" : "index.m3u8"),
              );
              if (info.size) {
                ready = true;
                break;
              }
            } catch {}
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          if (!ready) {
            child.kill();
            jobs.delete(id);
            tickets.delete(input);
            await rm(dir, { recursive: true, force: true });
            return send(502, {
              error:
                "Conversion could not start. Check the source and FFmpeg installation.",
            });
          }
          return send(200, {
            path:
              "/media/" + id + (multiAudio ? "/master.m3u8" : "/index.m3u8"),
            hls: true,
            audioTracks,
          });
        }
        const id = ticket(body.url, headers);
        return send(200, { path: `/media/${id}/stream` });
      }
      if (route.pathname === "/request") {
        const url = new URL(body.url);
        const isTorbox =
          url.origin === "https://api.torbox.app" &&
          /^\/v1\/api\/(user\/me|torrents\/(createtorrent|mylist|requestdl))$/.test(
            url.pathname,
          );
        const isRealDebrid =
          url.origin === "https://api.real-debrid.com" &&
          /^\/rest\/1\.0\/(?:user|torrents\/(?:instantAvailability\/[a-f0-9]+|addMagnet|selectFiles\/[^/]+|info\/[^/]+)|unrestrict\/link)$/.test(
            url.pathname,
          );
        const method = body.method ?? "GET";
        const isArtwork =
          method === "GET" &&
          /\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(url.pathname);
        if (
          !["GET", "POST"].includes(method) ||
          !(
            method === "GET" ||
            (isTorbox && url.pathname.endsWith("/createtorrent")) ||
            (isRealDebrid &&
              /\/(?:addMagnet|selectFiles\/[^/]+|unrestrict\/link)$/.test(
                url.pathname,
              ))
          )
        )
          return send(400, { error: "Unsupported API method" });
        if (
          !isTorbox &&
          !isRealDebrid &&
          !isArtwork &&
          !/\/(manifest\.json|(?:catalog|meta|stream)\/.*\.json|(?:player_api|xmltv|get)\.php|[^/]+\.m3u8?)$/.test(
            url.pathname,
          )
        )
          return send(400, {
            error: "Only add-on and IPTV API paths are allowed",
          });
        const headers = sourceHeaders(body.headers);
        if (isTorbox) {
          const supplied = String(
            headers.Authorization ?? headers.authorization ?? "",
          ).replace(/^Bearer\s+/i, "");
          if (supplied.startsWith("friend:")) {
            const grant = supplied.slice("friend:".length);
            const access = await vaultForGrant(grant, userId);
            const vault = access?.vault;
            if (!vault?.torboxKey)
              return send(403, {
                error: "Friend access expired. Enter the friend code again.",
              });
            headers.Authorization = `Bearer ${vault.torboxKey}`;
            delete headers.authorization;
            if (url.pathname.endsWith("/requestdl"))
              url.searchParams.set("token", vault.torboxKey);
          }
        }
        if (isRealDebrid) {
          const supplied = String(
            headers.Authorization ?? headers.authorization ?? "",
          ).replace(/^Bearer\s+/i, "");
          if (supplied.startsWith("friend-rd:")) {
            const grant = supplied.slice("friend-rd:".length);
            const access = await vaultForGrant(grant, userId);
            const vault = access?.vault;
            if (!vault?.realDebridKey)
              return send(403, {
                error: "Friend access expired. Enter the friend code again.",
              });
            headers.Authorization = `Bearer ${vault.realDebridKey}`;
            delete headers.authorization;
          }
        }
        let data;
        if (body.form) {
          if (
            !isRealDebrid &&
            (!isTorbox ||
              !url.pathname.endsWith("/createtorrent") ||
              body.form.add_only_if_cached !== "true")
          )
            return send(400, {
              error: "Only cached torrent requests are allowed",
            });
          data = new FormData();
          for (const [k, v] of Object.entries(body.form))
            data.set(k, String(v));
        }
        const result = await fetchSafe(url.href, {
          headers,
          method,
          body: data,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(30000),
          ]),
        });
        try {
          if (isArtwork) {
            const data = await limitedBuffer(result.response, 5_000_000);
            if (result.response.status >= 500)
              return send(424, {
                error: "The artwork source is temporarily unavailable.",
                upstreamStatus: result.response.status,
              });
            const contentType =
              result.response.headers.get("content-type") ??
              "application/octet-stream";
            if (
              !/^image\//i.test(contentType) &&
              !/^application\/octet-stream/i.test(contentType)
            )
              return send(415, {
                error: "The artwork source did not return an image.",
              });
            res.writeHead(result.response.status, {
              "Content-Type": contentType,
              "Content-Length": data.length,
              "Cache-Control": "private, max-age=3600",
            });
            res.end(data);
            return;
          }
          const text = await limitedText(result.response, 64_000_000);
          if (result.response.status >= 500)
            return send(424, {
              error: "The add-on is temporarily unavailable.",
              upstreamStatus: result.response.status,
            });
          res.writeHead(result.response.status, {
            "Content-Type":
              result.response.headers.get("content-type") ?? "application/json",
          });
          res.end(text);
        } finally {
          await result.close();
        }
        return;
      }
      send(404, { error: "Not found" });
    } catch (e) {
      if (!res.headersSent)
        send(502, {
          error:
            e instanceof SyntaxError
              ? "Invalid request"
              : "Playback service could not reach this source. Check its availability and credentials.",
        });
      else res.destroy();
    }
  });
  server.on("close", () => {
    clearInterval(sweep);
    for (const j of jobs.values()) {
      j.process?.kill();
      if (j.dir)
        void rm(j.dir, { recursive: true, force: true }).catch(() => {});
    }
  });
  return server;
}
async function limitedText(source, max) {
  return (await limitedBuffer(source, max)).toString("utf8");
}
async function limitedBuffer(source, max) {
  let bytes = 0;
  const chunks = [];
  const body = source.body ?? source;
  for await (const chunk of body) {
    bytes += chunk.length;
    if (bytes > max) throw new Error("Response too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const server = createService({
    token: process.env.PLAYBACK_TOKEN,
    origins: (
      process.env.ALLOWED_ORIGINS ??
      "https://tiktaktv.me,https://www.tiktaktv.me,https://zachgus33.github.io,http://127.0.0.1:5173"
    ).split(","),
  });
  server.listen(
    Number(process.env.PORT ?? 3101),
    process.env.HOST ?? "127.0.0.1",
    () =>
      console.log(
        "Tik-TakTV playback service ready on port " +
          (process.env.PORT ?? 3101),
      ),
  );
}
