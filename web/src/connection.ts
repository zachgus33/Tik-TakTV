export type PlaybackService = {
  url: string;
  token: string;
  mode?: "direct" | "remux" | "transcode";
  account?: boolean;
};
const endpointRecord =
  "https://api.github.com/repos/zachgus33/Tik-TakTV-Endpoint/contents/endpoint.json?ref=main";
const permanentEndpoint = "https://api.tiktaktv.me";

function accountToken() {
  try {
    const session = JSON.parse(
      localStorage.getItem("tiktak:account") ?? "null",
    );
    return typeof session?.access_token === "string"
      ? session.access_token
      : "";
  } catch {
    return "";
  }
}

async function discoveredService(config: PlaybackService) {
  try {
    const response = await fetch(`${endpointRecord}&t=${Date.now()}`, {
      headers: { Accept: "application/vnd.github.raw+json" },
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;
    const record = (await response.json()) as {
      url?: string;
      updated?: number;
      signature?: string;
    };
    if (
      !record.url ||
      (!record.url.endsWith(".trycloudflare.com") &&
        serviceUrl(record.url) !== permanentEndpoint) ||
      !Number.isFinite(record.updated) ||
      !/^[a-f0-9]{64}$/i.test(record.signature ?? "")
    )
      return null;
    let valid = config.account === true;
    if (!valid) {
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(config.token),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["verify"],
      );
      const signature = Uint8Array.from(
        (record.signature!.match(/../g) ?? []).map((byte) =>
          parseInt(byte, 16),
        ),
      );
      valid = await crypto.subtle.verify(
        "HMAC",
        key,
        signature,
        new TextEncoder().encode(`${record.url}\n${record.updated}`),
      );
    }
    if (!valid || record.url === config.url) return null;
    const updated = { ...config, url: serviceUrl(record.url) };
    if (config.account)
      localStorage.setItem("nuvio:discovered-url", updated.url);
    else
      localStorage.setItem("nuvio:playback-service", JSON.stringify(updated));
    Object.assign(config, updated);
    window.dispatchEvent(new Event("connections-changed"));
    return updated;
  } catch {
    return null;
  }
}

export async function refreshPlaybackEndpoint() {
  const config = getService();
  if (!config) return null;
  return discoveredService(config);
}
export function getService(): PlaybackService | null {
  try {
    const token = accountToken();
    if (token)
      return {
        // Signed-in accounts use the stable named tunnel immediately. Endpoint
        // discovery remains available for verified future migrations.
        url: permanentEndpoint,
        token,
        account: true,
      };
    const s = JSON.parse(
      localStorage.getItem("nuvio:playback-service") ?? "null",
    );
    if (s?.url && s?.token) return s;
    return null;
  } catch {
    return null;
  }
}
export function serviceUrl(value: string) {
  const u = new URL(value.trim());
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    (u.protocol !== "https:" &&
      !(
        u.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(u.hostname) &&
        location.hostname === "127.0.0.1"
      ))
  )
    throw new Error("Use the HTTPS address of your playback service.");
  return u.origin;
}
export async function serviceRequest(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  config = getService(),
  options: { keepalive?: boolean } = {},
) {
  if (!config)
    throw new Error(
      "Connect a playback service in Settings. This source blocks direct browser requests.",
    );
  const request = (service: PlaybackService) =>
    fetch(`${service.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${service.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      keepalive: options.keepalive,
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  try {
    const response = await request(config);
    // A companion-generated 5xx can be the upstream add-on's real response.
    // Retry discovery only for gateway errors that did not reach the service.
    if (
      response.status < 500 ||
      response.headers.get("X-TikTak-Companion") === "2"
    )
      return response;
  } catch (error) {
    if (signal?.aborted) throw error;
  }
  const replacement = await discoveredService(config);
  if (replacement) return request(replacement);
  return request(config);
}
export async function sourceFetch(
  url: string,
  options: RequestInit = {},
  forceService = false,
): Promise<Response> {
  const config = getService();
  let parsed: URL | undefined;
  try {
    parsed = new URL(url);
    if (parsed.hostname === "friend.tiktaktv.invalid") {
      if (!config)
        throw new Error("Connect the TikTak TV playback service first.");
      return serviceRequest(
        `/friend/addon${parsed.pathname}${parsed.search}`,
        undefined,
        options.signal ?? undefined,
        config,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("playback service"))
      throw error;
  }
  const addonJson =
    parsed &&
    (/(?:^|\/)manifest\.json$/i.test(parsed.pathname) ||
      /\/(?:catalog|meta|stream|subtitles|addon_catalog)\/.*\.json$/i.test(
        parsed.pathname,
      ));
  const relay = (signal = options.signal ?? undefined) => {
    const headers = new Headers(options.headers);
    if (addonJson && !headers.has("accept"))
      headers.set("accept", "application/json");
    return serviceRequest(
      "/request",
      {
        url,
        method: options.method ?? "GET",
        headers: Object.fromEntries(headers),
        form:
          options.body instanceof FormData
            ? Object.fromEntries(options.body)
            : undefined,
        body: typeof options.body === "string" ? options.body : undefined,
      },
      signal,
      config,
    );
  };
  // Try HTTP add-ons directly first. This works in native shells, local HTTP
  // deployments, localhost secure contexts, and browsers where the user has
  // explicitly allowed local insecure content. An HTTPS PWA normally rejects
  // the request as mixed content; the TypeError path below then uses the
  // configured companion without rejecting the add-on during installation.
  const providerApi =
    parsed && /\/(?:player_api|xmltv|get)\.php$/i.test(parsed.pathname);
  // Xtream credentials live in the query string and many providers do not
  // grant browser CORS access. Keep those requests inside the authenticated
  // companion even when the provider itself uses HTTPS.
  if (providerApi && config) return relay();
  if (forceService && config) return relay();
  try {
    const response = await fetch(url, options);
    if (
      config &&
      [401, 403, 408, 425, 429, 502, 503, 504].includes(response.status) &&
      !options.signal?.aborted
    ) {
      // HTTPS sources play and load directly by default. Fall back only after
      // the browser was refused, throttled, or timed out: those are the cases
      // where the companion can supply protected headers or bypass browser
      // CORS. One fallback request avoids turning a source failure into a
      // retry storm against either the add-on or the companion.
      const relayed = await relay().catch(() => undefined);
      if (relayed?.ok) return relayed;
    }
    return response;
  } catch (e) {
    // A browser TypeError is the observable CORS/network failure path. HTTP,
    // Xtream APIs, explicit relay requests, and header-bearing media already
    // took the companion path above, so this only adds the companion when a
    // normal HTTPS request genuinely cannot be used in the browser.
    if (e instanceof TypeError && config && !options.signal?.aborted)
      return relay();
    if (e instanceof TypeError && parsed?.protocol === "http:")
      throw new Error(
        "This browser blocked the HTTP add-on. Use an HTTPS tunnel/reverse proxy, or connect a same-network TikTak companion that can reach it.",
      );
    throw e;
  }
}
export async function prepareMedia(
  url: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  mode?: PlaybackService["mode"],
  audioCodec?: "aac" | "mp3" | "opus" | "webm",
  live = false,
  forceRelay = false,
  start = 0,
  replace = "",
  playbackId = "",
) {
  const config = getService();
  if (!config) return url;
  const selectedMode = mode ?? config.mode ?? "direct";
  // Resolved TorBox/add-on HTTPS links are already browser-playable and can be
  // rate-limited when fetched again through the Pi. Keep the relay for sources
  // that need headers or explicit remux/transcode compatibility.
  if (
    selectedMode === "direct" &&
    !forceRelay &&
    !Object.keys(headers ?? {}).length
  )
    return url;
  const payload = {
    url,
    headers,
    mode: selectedMode,
    audioCodec,
    live,
    start: live ? 0 : Math.max(0, start),
    replace: replace.startsWith(`${config.url}/media/`)
      ? new URL(replace).pathname
      : undefined,
    playbackId: /^[A-Za-z0-9_-]{20,100}$/.test(playbackId)
      ? playbackId
      : undefined,
  };
  let response = await serviceRequest("/prepare", payload, signal, config);
  if (playbackId && [429, 503].includes(response.status) && !signal?.aborted) {
    void serviceRequest("/playback/cancel", { playbackId }, undefined, config, {
      keepalive: true,
    }).catch(() => undefined);
    response = await serviceRequest("/prepare", payload, signal, config);
  }
  if (response.status === 429 && live && !signal?.aborted) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1200);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          reject(signal.reason);
        },
        { once: true },
      );
    });
    response = await serviceRequest("/prepare", payload, signal, config);
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      data.error ??
        `Playback service returned HTTP ${response.status}. Check its connection in Settings.`,
    );
  }
  const data = await response.json();
  if (typeof data.path !== "string" || !data.path.startsWith("/media/"))
    throw new Error("Invalid playback service response.");
  return `${config.url}${data.path}`;
}

export async function cancelPlaybackSession(
  playbackId: string,
  signal?: AbortSignal,
) {
  const config = getService();
  if (!config || !/^[A-Za-z0-9_-]{20,100}$/.test(playbackId)) return false;
  const response = await serviceRequest(
    "/playback/cancel",
    { playbackId },
    signal,
    config,
    { keepalive: true },
  ).catch(() => undefined);
  return response?.ok === true;
}

export async function queueDownload(
  url: string,
  filename: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<DownloadPreparationStatus> {
  const config = getService();
  if (
    !config &&
    /\.(?:mp4|m4v)(?:[?#]|$)/i.test(url) &&
    !Object.keys(headers ?? {}).length
  )
    return { status: "ready", url, filename };
  if (!config)
    throw new Error(
      "This source needs the TikTak TV playback service to convert it to MP4. Connect the service in Settings, or choose a direct MP4 source.",
    );
  const response = await serviceRequest(
    "/download",
    { url, filename, headers },
    signal,
    config,
  );
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : `Download service returned HTTP ${response.status}.`,
    );
  }
  const created = (await response.json()) as DownloadPreparationStatus;
  if (
    typeof created.statusPath !== "string" ||
    !validDownloadPath(created.statusPath, "status.json")
  )
    throw new Error("Invalid download service response.");
  return created;
}

export async function prepareDownload(
  url: string,
  filename: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
  onStatus?: (status: DownloadPreparationStatus) => void,
) {
  const created = await queueDownload(url, filename, headers, signal);
  if (created.status === "ready" && created.url) return created.url;
  const config = getService();
  if (!config || !created.statusPath)
    throw new Error("Invalid download service response.");
  onStatus?.(created);
  let current = created;
  while (current.status === "preparing") {
    await abortableDelay(1_500, signal);
    current = await downloadPreparationStatus(
      created.statusPath,
      signal,
      config,
    );
    onStatus?.(current);
  }
  if (current.status === "failed")
    throw new Error(
      current.error ?? "This source could not be prepared as an MP4.",
    );
  if (
    current.status !== "ready" ||
    typeof current.path !== "string" ||
    !validDownloadPath(current.path, "download.mp4")
  )
    throw new Error("Invalid completed download response.");
  return `${config.url}${current.path}`;
}

export type DownloadPreparationStatus = {
  status: "preparing" | "ready" | "failed";
  stage?: "copy" | "transcode";
  statusPath?: string;
  path?: string;
  filename?: string;
  bytes?: number;
  progressSeconds?: number;
  createdAt?: number;
  updatedAt?: number;
  error?: string;
  url?: string;
};

function validDownloadPath(
  value: string,
  file: "status.json" | "download.mp4",
) {
  return new RegExp(
    `^/media/[A-Za-z0-9_-]{32}/${file.replace(".", "\\.")}$`,
  ).test(value);
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function downloadPreparationStatus(
  statusPath: string,
  signal?: AbortSignal,
  config = getService(),
): Promise<DownloadPreparationStatus> {
  if (!validDownloadPath(statusPath, "status.json"))
    throw new Error("Invalid download status path.");
  if (!config) throw new Error("Connect the TikTak TV playback service first.");
  const response = await serviceRequest(statusPath, undefined, signal, config);
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    const message =
      typeof detail.error === "string" && detail.error.trim()
        ? detail.error
        : `Download status returned HTTP ${response.status}.`;
    // An expired opaque ticket cannot recover on a later poll. Tunnel and
    // gateway failures remain retryable in the manager.
    throw new DownloadStatusError(
      message,
      response.status === 404 || response.status === 410,
    );
  }
  const status = (await response.json()) as DownloadPreparationStatus;
  if (!["preparing", "ready", "failed"].includes(status.status))
    throw new Error("Invalid download status response.");
  return { ...status, statusPath };
}

export async function cancelDownloadPreparation(statusPath: string) {
  if (!validDownloadPath(statusPath, "status.json"))
    throw new Error("Invalid download status path.");
  const config = getService();
  if (!config) throw new Error("Connect the TikTak TV playback service first.");
  const response = await serviceRequest(
    "/download/cancel",
    { statusPath },
    undefined,
    config,
  );
  if (!response.ok) {
    const detail = (await response.json().catch(() => ({}))) as {
      error?: unknown;
    };
    throw new Error(
      typeof detail.error === "string"
        ? detail.error
        : `Download cancellation returned HTTP ${response.status}.`,
    );
  }
}

export class DownloadStatusError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = "DownloadStatusError";
  }
}

export function completedDownloadUrl(path: string) {
  const config = getService();
  if (!config || !validDownloadPath(path, "download.mp4")) return undefined;
  return `${config.url}${path}`;
}

async function friendRequest<T>(
  path:
    | "/friend/status"
    | "/friend/setup"
    | "/friend/redeem"
    | "/friend/revoke"
    | "/friend/restore-addons",
  body: Record<string, unknown> = {},
) {
  if (path === "/friend/redeem") {
    const attempts = JSON.parse(
      sessionStorage.getItem("tiktak:friend-attempts") ?? "[]",
    ) as number[];
    const recent = attempts.filter((value) => Date.now() - value < 60_000);
    if (recent.length >= 5)
      throw new Error(
        "Too many friend-code attempts. Wait one minute and try again.",
      );
    recent.push(Date.now());
    sessionStorage.setItem("tiktak:friend-attempts", JSON.stringify(recent));
  }
  const config = getService();
  if (!config) throw new Error("Connect the TikTak TV playback service first.");
  const response = await serviceRequest(path, body, undefined, config);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      data.error || `Friend access returned HTTP ${response.status}.`,
    );
  return data;
}

export const friendAccessStatus = () =>
  friendRequest<{ available: boolean; owner: boolean; published: boolean }>(
    "/friend/status",
  );

export const publishFriendSetup = (
  code: string,
  torboxKey: string,
  realDebridKey: string,
  template: Record<string, unknown>,
) =>
  friendRequest<{
    ok: boolean;
    torboxKey: string;
    realDebridKey: string;
    ownerTorboxKey?: string;
    ownerRealDebridKey?: string;
  }>("/friend/setup", { code, torboxKey, realDebridKey, template });

export const redeemFriendSetup = <T>(code: string) =>
  // Add-on bases are returned unchanged for compatibility with Nuvio and other
  // Stremio clients. Debrid credentials remain short-lived service grants.
  friendRequest<{ template: T; torboxKey: string; realDebridKey: string }>(
    "/friend/redeem",
    { code },
  );

export const restoreFriendAddonUrls = (urls: string[]) =>
  friendRequest<{ addons: { url: string; base: string }[] }>(
    "/friend/restore-addons",
    { urls },
  );

export const revokeFriendSetup = () =>
  friendRequest<{
    ok: boolean;
    torboxKey: string;
    realDebridKey: string;
  }>("/friend/revoke");
