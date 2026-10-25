import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import { Agent, fetch as upstreamFetch } from "undici";
import ipaddr from "ipaddr.js";

// Supabase's public anonymous client key; this is not a service-role secret.
const nuvioAnonKey =
  process.env.NUVIO_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";
const guideCacheDir = process.env.GUIDE_CACHE_DIR ?? join(tmpdir(), "tiktaktv-guides");
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
export function createService({ token, origins }) {
  if (!token || token.length < 32)
    throw new Error("Set a private PLAYBACK_TOKEN of at least 32 characters.");
  const jobs = new Map();
  const tickets = new Map();
  const accountTokens = new Map();
  const ttl = 4 * 60 * 60 * 1000;
  function ticket(url, headers = {}) {
    if (tickets.size > 5000) throw new Error("Playback capacity reached");
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
  }, 30000);
  sweep.unref();
  const authorized = async (req) => {
    const a = Buffer.from(req.headers.authorization ?? "");
    const b = Buffer.from(`Bearer ${token}`);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
    const bearer = String(req.headers.authorization ?? "").replace(
      /^Bearer\s+/i,
      "",
    );
    if (!bearer || bearer.length > 4096) return false;
    const cached = accountTokens.get(bearer);
    if (cached && cached > Date.now()) return true;
    try {
      const response = await upstreamFetch("https://api.nuvio.tv/auth/v1/user", {
        headers: {
          Authorization: `Bearer ${bearer}`,
          apikey: nuvioAnonKey,
        },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) return false;
      const user = await response.json();
      if (!user?.id) return false;
      accountTokens.set(bearer, Date.now() + 5 * 60_000);
      if (accountTokens.size > 200)
        for (const [key, expires] of accountTokens)
          if (expires < Date.now()) accountTokens.delete(key);
      return true;
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
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization,Content-Type,Range",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS");
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range,Accept-Ranges,Content-Length",
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
    const controller = new AbortController();
    res.on("close", () => controller.abort());
    try {
      if (route.pathname === "/health") {
        if (!(await authorized(req)))
          return send(401, { error: "Playback service key required" });
        return send(200, { ok: true, version: 1 });
      }
      if (route.pathname.startsWith("/media/")) {
        if (!["GET", "HEAD"].includes(req.method))
          return send(405, { error: "Method not allowed" });
        const id = route.pathname.split("/")[2];
        const job = jobs.get(id);
        if (job) {
          const file = route.pathname.split("/")[3];
          if (job.kind === "webm") {
            if (!/^(?:stream\.webm|audio\.mp3)$/.test(file))
              return send(404, { error: "Unknown media file" });
            job.touched = Date.now();
            job.clients = (job.clients ?? 0) + 1;
            clearTimeout(job.stopTimer);
            let released = false;
            const release = () => {
              if (released) return;
              released = true;
              job.clients = Math.max(0, (job.clients ?? 1) - 1);
              if (job.clients === 0) {
                job.stopTimer = setTimeout(() => {
                  if (job.clients || jobs.get(id) !== job) return;
                  job.process?.kill();
                  jobs.delete(id);
                  void rm(job.dir, { recursive: true, force: true });
                }, 3000);
                job.stopTimer.unref?.();
              }
            };
            res.once("close", release);
            res.writeHead(200, {
              "Content-Type": file === "audio.mp3" ? "audio/mpeg" : "video/webm",
              "Cache-Control": "no-store",
            });
            if (req.method === "HEAD") return res.end();
            const stream = createReadStream(
              file === "audio.mp3" ? job.audioPath : job.videoPath,
            );
            stream.on("error", () => res.destroy());
            stream.pipe(res);
            return;
          }
          if (!/^(index\.m3u8|init\.mp4|segment\d+\.(?:ts|m4s))$/.test(file))
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
          let looksLikeHls=false;
          if(req.method!=="HEAD" && r.body){
            const probe=r.clone().body.getReader();let prefix="";
            try{while(prefix.length<16){const {value,done}=await probe.read();if(done)break;prefix+=new TextDecoder().decode(value.slice(0,64));}looksLikeHls=prefix.trimStart().startsWith("#EXTM3U");}finally{void probe.cancel().catch(()=>{});}
          }
          if (
            req.method !== "HEAD" &&
            r.ok &&
            (looksLikeHls || /mpegurl/i.test(type) || /\.m3u8(?:\?|$)/i.test(result.url) || /\.m3u8(?:\?|$)/i.test(t.url))
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
      if (!(await authorized(req)))
        return send(401, { error: "Playback service key required" });
      if (req.method !== "POST")
        return send(405, { error: "Method not allowed" });
      const body = JSON.parse(await limitedText(req, 1_000_000));
      if (route.pathname === "/guide") {
        const url = new URL(body.url);
        if (!/\/xmltv\.php$/.test(url.pathname))
          return send(400, { error: "Only an Xtream XMLTV guide is allowed" });
        await mkdir(guideCacheDir, { recursive: true });
        const cacheName = createHash("sha256").update(url.href).digest("hex") + ".xml";
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
              if (bytes > 192_000_000) client.destroy(new Error("Guide too large"));
            });
            const clientWrite = pipeline(client, createGzip(), res).catch(
              () => undefined,
            );
            await pipeline(
              Readable.fromWeb(cacheBody),
              createWriteStream(tempPath),
            );
            await rename(tempPath, cachePath).catch(() => rm(tempPath, { force: true }));
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
      if (route.pathname === "/prepare") {
        await resolveTarget(body.url);
        const headers = sourceHeaders(body.headers);
        if (body.mode === "remux" || body.mode === "transcode") {
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
          const inputUrl =
            "http://127.0.0.1:" + address.port + "/media/" + input + "/stream";
          if (body.audioCodec === "webm") {
            const videoPath = join(dir, "stream.webm");
            const audioPath = join(dir, "audio.mp3");
            await new Promise((resolve, reject) => {
              const fifo = spawn("mkfifo", [videoPath, audioPath]);
              fifo.once("error", reject);
              fifo.once("exit", (code) =>
                code === 0 ? resolve() : reject(new Error("Could not create media pipes")),
              );
            });
            const args = [
              "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-re",
              "-i", inputUrl,
              "-map", "0:v:0?", "-an",
              "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "12",
              "-b:v", "1000k", "-vf", "scale=-2:480", "-threads", "2",
              "-f", "webm", "-live", "1", "-cluster_time_limit", "1000", videoPath,
              "-map", "0:a:0?", "-vn", "-c:a", "libmp3lame",
              "-ac", "2", "-ar", "48000", "-b:a", "128k", "-f", "mp3", audioPath,
            ];
            const child = spawn(process.env.FFMPEG_PATH ?? "ffmpeg", args, {
              stdio: ["ignore", "ignore", "ignore"],
              windowsHide: true,
            });
            jobs.set(id, {
              kind: "webm",
              videoPath,
              audioPath,
              process: child,
              dir,
              touched: Date.now(),
              running: true,
              clients: 0,
            });
            child.once("exit", () => {
              const job = jobs.get(id);
              if (job) job.running = false;
            });
            return send(200, { path: `/media/${id}/stream.webm`, hls: false });
          }
          const args = [
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-protocol_whitelist",
            "http,https,tcp,tls,crypto",
            "-format_whitelist",
            "hls,mpegts,mov,matroska,webm,aac,mp3",
            "-re",
            "-i",
            inputUrl,
            "-map",
            "0:v:0?",
            "-map",
            "0:a:0?",
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
                  "scale=-2:480",
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
            "-pix_fmt",
            "yuv420p",
            "-f",
            "hls",
            "-hls_time",
            "2",
            "-hls_list_size",
            "12",
            "-hls_delete_threshold",
            "60",
            "-hls_flags",
            "delete_segments+independent_segments",
            "-hls_segment_type",
            "fmp4",
            "-hls_fmp4_init_filename",
            "init.mp4",
            "-hls_segment_filename",
            join(
              dir,
              "segment%d.m4s",
            ),
            join(dir, "index.m3u8"),
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
              const info = await stat(join(dir, "index.m3u8"));
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
          return send(200, { path: "/media/" + id + "/index.m3u8", hls: true });
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
        const method = body.method ?? "GET";
        if (
          method !== "GET" &&
          !(
            isTorbox &&
            method === "POST" &&
            url.pathname.endsWith("/createtorrent")
          )
        )
          return send(400, { error: "Unsupported API method" });
        if (
          !isTorbox &&
          !/\/(manifest\.json|(?:catalog|meta|stream)\/.*\.json|player_api\.php|xmltv\.php)$/.test(
            url.pathname,
          )
        )
          return send(400, {
            error: "Only add-on and IPTV API paths are allowed",
          });
        const headers = sourceHeaders(body.headers);
        let data;
        if (body.form) {
          if (
            !isTorbox ||
            !url.pathname.endsWith("/createtorrent") ||
            body.form.add_only_if_cached !== "true"
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
      "https://zachgus33.github.io,http://127.0.0.1:5173"
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
