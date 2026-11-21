import { afterEach, expect, it, vi } from "vitest";
import { prepareMedia, sourceFetch } from "../src/connection";

afterEach(() => vi.unstubAllGlobals());

it("requests browser-accessible add-on manifests directly", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toBe("https://addon.example/manifest.json");
    expect(options?.headers).toBeUndefined();
    return Response.json({ id: "working-addon" });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(response.ok).toBe(true);
  expect(await response.json()).toEqual({ id: "working-addon" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uses the companion only after browser access is blocked", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://addon.example/manifest.json")
      throw new TypeError("CORS blocked");
    expect(url).toBe("https://playback.example/request");
    const body = JSON.parse(String(options?.body));
    expect(body.url).toBe("https://addon.example/manifest.json");
    return Response.json({ id: "relayed-addon" });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(await response.json()).toEqual({ id: "relayed-addon" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "https://addon.example/manifest.json",
    "https://playback.example/request",
  ]);
});

it("falls back once for an add-on that requires protected headers", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string) =>
    url === "https://addon.example/manifest.json"
      ? new Response("Forbidden", { status: 403 })
      : Response.json({ id: "protected-addon" }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(await response.json()).toEqual({ id: "protected-addon" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "https://addon.example/manifest.json",
    "https://playback.example/request",
  ]);
});

it("tries a self-hosted HTTP add-on directly before companion relay", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const source = "http://192.168.4.56:3000/manifest.json";
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === source) throw new TypeError("Mixed content blocked");
    expect(url).toBe("https://playback.example/request");
    expect(JSON.parse(String(options?.body)).url).toBe(source);
    return Response.json({ id: "lan-addon" });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch(source);
  expect(await response.json()).toEqual({ id: "lan-addon" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    source,
    "https://playback.example/request",
  ]);
});

it("preserves an approved JSON body when a skip API needs companion relay", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const source = "https://api.anime-skip.com/graphql";
  const graphql = JSON.stringify({ query: "{ test }" });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === source) throw new TypeError("CORS blocked");
    expect(url).toBe("https://playback.example/request");
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({
      url: source,
      method: "POST",
      body: graphql,
    });
    expect(body.headers["x-client-id"] ?? body.headers["X-Client-ID"]).toBe(
      "client",
    );
    return Response.json({ data: {} });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch(source, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Client-ID": "client" },
    body: graphql,
  });
  expect(await response.json()).toEqual({ data: {} });
});

it("replaces and retries a saturated playback conversion session", async () => {
  const service = JSON.stringify({
    url: "https://playback.example",
    token: "test",
    mode: "transcode",
  });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) =>
      key === "nuvio:playback-service" ? service : null,
  });
  const playbackId = "playback-session-1234567890";
  const previous = `https://playback.example/media/${"a".repeat(32)}/index.m3u8`;
  let preparations = 0;
  let cancellations = 0;
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://playback.example/playback/cancel") {
      cancellations += 1;
      expect(JSON.parse(String(options?.body))).toEqual({ playbackId });
      return Response.json({ cancelled: 1 });
    }
    expect(url).toBe("https://playback.example/prepare");
    preparations += 1;
    const body = JSON.parse(String(options?.body));
    expect(body.playbackId).toBe(playbackId);
    expect(body.replace).toBe(`/media/${"a".repeat(32)}/index.m3u8`);
    return preparations === 1
      ? Response.json(
          { error: "Two video transcodes are already active." },
          { status: 429 },
        )
      : Response.json({ path: `/media/${"b".repeat(32)}/index.m3u8` });
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    prepareMedia(
      "https://cdn.example/video.mkv",
      undefined,
      undefined,
      "transcode",
      "aac",
      false,
      true,
      0,
      previous,
      playbackId,
    ),
  ).resolves.toBe(
    `https://playback.example/media/${"b".repeat(32)}/index.m3u8`,
  );
  expect(preparations).toBe(2);
  expect(cancellations).toBe(1);
});
