export type PlaybackService = {
  url: string;
  token: string;
  mode?: "direct" | "remux" | "transcode";
  account?: boolean;
};
const endpointRecord =
  "https://api.github.com/repos/zachgus33/Tik-TakTV-Endpoint/contents/endpoint.json?ref=main";
const bootstrapEndpoint =
  "https://magnificent-tongue-composed-bears.trycloudflare.com";

function accountToken() {
  try {
    const session = JSON.parse(localStorage.getItem("tiktak:account") ?? "null");
    return typeof session?.access_token === "string" ? session.access_token : "";
  } catch {
    return "";
  }
}

async function discoveredService(config: PlaybackService) {
  try {
    const response = await fetch(`${endpointRecord}&t=${Date.now()}`, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
    if (!response.ok) return null;
    const file = (await response.json()) as { content?: string };
    if (!file.content) return null;
    const record = JSON.parse(atob(file.content.replace(/\s/g, ""))) as {
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
    if (config.account) localStorage.setItem("nuvio:discovered-url", updated.url);
    else
      localStorage.setItem("nuvio:playback-service", JSON.stringify(updated));
    Object.assign(config, updated);
    window.dispatchEvent(new Event("connections-changed"));
    return updated;
  } catch {
    return null;
  }
}
export function getService(): PlaybackService | null {
  try {
    const s = JSON.parse(
      localStorage.getItem("nuvio:playback-service") ?? "null",
    );
    if (s?.url && s?.token) return s;
    const token = accountToken();
    if (!token) return null;
    return {
      url: localStorage.getItem("nuvio:discovered-url") || bootstrapEndpoint,
      token,
      account: true,
    };
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
) {
  const config = getService();
  if (!config) return url;
  const selectedMode = mode ?? config.mode ?? "direct";
  // Resolved TorBox/add-on HTTPS links are already browser-playable and can be
  // rate-limited when fetched again through the Pi. Keep the relay for sources
  // that need headers or explicit remux/transcode compatibility.
  if (selectedMode === "direct" && !Object.keys(headers ?? {}).length)
    return url;
  const response = await serviceRequest(
    "/prepare",
    { url, headers, mode: selectedMode },
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
