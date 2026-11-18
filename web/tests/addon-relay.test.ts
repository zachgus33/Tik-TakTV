import { afterEach, expect, it, vi } from "vitest";
import { sourceFetch } from "../src/connection";

afterEach(() => vi.unstubAllGlobals());

it("requests browser-accessible add-on manifests directly", async () => {
  const service = JSON.stringify({ url: "https://playback.example", token: "test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "nuvio:playback-service" ? service : null,
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

it("uses the relay only when the browser cannot reach a manifest", async () => {
  const service = JSON.stringify({ url: "https://playback.example", token: "test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://addon.example/manifest.json")
      throw new TypeError("CORS blocked");
    expect(url).toBe("https://playback.example/request");
    const body = JSON.parse(String(options?.body));
    expect(body.url).toBe("https://addon.example/manifest.json");
    expect(body.headers.accept).toBe("application/json");
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
