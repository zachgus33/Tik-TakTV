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
export function createService({ token, origins, authorizeAccount }) {
  if (!token || token.length < 32)
    throw new Error("Set a private PLAYBACK_TOKEN of at least 32 characters.");
  const jobs = new Map();
  const tickets = new Map();
  const accountTokens = new Map();
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
  function decodeFriendGrant(value, userId) {
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
      return data.sub === userId && Number(data.exp) > Date.now() ? data : null;
    } catch {
      return null;
    }
  }
  async function vaultForGrant(grant, userId) {
    const data = decodeFriendGrant(grant, userId);
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
  function codeMatchesVault(code, vault) {
    if (!vault?.codeSalt || !vault?.codeHash) return false;
    const actual = scryptSync(code, Buffer.from(vault.codeSalt, "base64"), 32);
    const expected = Buffer.from(vault.codeHash, "base64");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
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
        if (j.dir) void rm(j.dir, { recursive: true, force: true });
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
      if (!['GET', 'HEAD'].includes(req.method))
        return send(405, { error: "Method not allowed" });
      return send(200, { ok: true, version: 2 });
    }
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
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
            res.writeHead(200, {
              "Content-Type": "video/mp4",
              "Content-Disposition": `attachment; filename="TikTak-TV.mp4"; filename*=UTF-8''${encodedName}`,
              "Cache-Control": "no-store",
            });
            if (req.method === "HEAD") return res.end();
            job.touched = Date.now();
            job.process?.kill();
            const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", job.args, {
              stdio: ["ignore", "pipe", "pipe"],
              windowsHide: true,
            });
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
            child.stdout.on("data", () => {
              job.touched = Date.now();
            });
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
      if (req.method !== "POST")
        return send(405, { error: "Method not allowed" });
      const body = JSON.parse(await limitedText(req, 1_000_000));
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
              error: "Connect your own Real-Debrid key before sharing your setup.",
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
          template: {
            ...vault.template,
            addons: vault.template.addons.map((addon, index) => ({
              ...addon,
              base: `https://friend.tiktaktv.invalid/${grant}/${index}`,
            })),
          },
          torboxKey: vault.torboxKey ? `friend:${grant}` : "",
          realDebridKey: vault.realDebridKey ? `friend-rd:${grant}` : "",
        });
      }
      if (route.pathname === "/guide") {
        const url = new URL(body.url);
        if (!/\/xmltv\.php$/.test(url.pathname))
          return send(400, { error: "Only an Xtream XMLTV guide is allowed" });
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
          if (jobs.size >= limits.jobs)
            return send(503, {
              error: "Playback service job capacity reached. Retry shortly.",
            });
          const runningJobs = [...jobs.values()].filter((job) => job.running);
          if (runningJobs.length >= 2)
            return send(429, {
              error:
                "Two conversion sessions are already active. Close a player and retry.",
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
              void rm(job.dir, { recursive: true, force: true });
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
          !/\/(manifest\.json|(?:catalog|meta|stream)\/.*\.json|player_api\.php|xmltv\.php)$/.test(
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
      if (j.dir) void rm(j.dir, { recursive: true, force: true });
    }
  });
  return server;
}
async function limitedText(source, max) {
  let bytes = 0;
  const chunks = [];
  const body = source.body ?? source;
  for await (const chunk of body) {
    bytes += chunk.length;
    if (bytes > max) throw new Error("Response too large");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
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
