export type PlaybackService = {
  url: string;
  token: string;
  mode?: "direct" | "remux" | "transcode";
};
export function getService(): PlaybackService | null {
  try {
    const s = JSON.parse(
      localStorage.getItem("nuvio:playback-service") ?? "null",
    );
    return s?.url && s?.token ? s : null;
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
  const response = await fetch(`${config.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  return response;
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
  const response = await serviceRequest(
    "/prepare",
    { url, headers, mode: mode ?? config.mode ?? "direct" },
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
