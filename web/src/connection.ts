export type PlaybackService = {
  url: string;
  token: string;
  mode?: "direct" | "remux" | "transcode";
  account?: boolean;
};
const endpointRecord =
  "https://raw.githubusercontent.com/zachgus33/Tik-TakTV-Endpoint/main/endpoint.json";
const bootstrapEndpoint =
  "https://magnificent-tongue-composed-bears.trycloudflare.com";

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
    const response = await fetch(`${endpointRecord}?t=${Date.now()}`, {
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
      !record.url?.endsWith(".trycloudflare.com") ||
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
        url: localStorage.getItem("nuvio:discovered-url") || bootstrapEndpoint,
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
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  try {
    const response = await request(config);
    if (response.status < 500) return response;
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
  try {
    const shared = new URL(url);
    if (shared.hostname === "friend.tiktaktv.invalid") {
      if (!config)
        throw new Error("Connect the TikTak TV playback service first.");
      return serviceRequest(
        `/friend/addon${shared.pathname}${shared.search}`,
        undefined,
        options.signal ?? undefined,
        config,
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("playback service"))
      throw error;
  }
  const relay = () =>
    serviceRequest(
      "/request",
      {
        url,
        method: options.method ?? "GET",
        headers: Object.fromEntries(new Headers(options.headers)),
        form:
          options.body instanceof FormData
            ? Object.fromEntries(options.body)
            : undefined,
      },
      options.signal ?? undefined,
      config,
    );
  if (forceService && config) return relay();
  try {
    return await fetch(url, options);
  } catch (e) {
    if (e instanceof TypeError && config && !options.signal?.aborted)
      return relay();
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
  const response = await serviceRequest(
    "/prepare",
    { url, headers, mode: selectedMode, audioCodec, live },
    signal,
    config,
  );
  if (!response.ok)
    throw new Error(
      `Playback service returned HTTP ${response.status}. Check its connection in Settings.`,
    );
  const data = await response.json();
  if (typeof data.path !== "string" || !data.path.startsWith("/media/"))
    throw new Error("Invalid playback service response.");
  return `${config.url}${data.path}`;
}

export async function prepareDownload(
  url: string,
  filename: string,
  headers?: Record<string, string>,
  signal?: AbortSignal,
) {
  const config = getService();
  if (!config && /\.(?:mp4|m4v)(?:[?#]|$)/i.test(url) && !headers) return url;
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
  const data = await response.json();
  if (typeof data.path !== "string" || !data.path.startsWith("/media/"))
    throw new Error("Invalid download service response.");
  return `${config.url}${data.path}`;
}

async function friendRequest<T>(
  path:
    | "/friend/status"
    | "/friend/setup"
    | "/friend/redeem"
    | "/friend/revoke",
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
  }>("/friend/setup", { code, torboxKey, realDebridKey, template });

export const redeemFriendSetup = <T>(code: string) =>
  friendRequest<{ template: T; torboxKey: string; realDebridKey: string }>(
    "/friend/redeem",
    { code },
  );

export const revokeFriendSetup = () =>
  friendRequest<{ ok: boolean }>("/friend/revoke");
