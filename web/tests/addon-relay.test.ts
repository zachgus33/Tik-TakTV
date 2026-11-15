import { afterEach, expect, it, vi } from "vitest";
import { sourceFetch } from "../src/connection";

afterEach(() => vi.unstubAllGlobals());

it("requests add-on manifests through the server before trying the browser", async () => {
  const service = JSON.stringify({ url: "https://playback.example", token: "test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    expect(url).toBe("https://playback.example/request");
    const body = JSON.parse(String(options?.body));
    expect(body.url).toBe("https://addon.example/manifest.json");
    expect(body.headers.accept).toBe("application/json");
    expect(body.headers["user-agent"]).toBeUndefined();
    return Response.json({ id: "working-addon" });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(response.ok).toBe(true);
  expect(await response.json()).toEqual({ id: "working-addon" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("uses a browser-accessible manifest when the server cannot reach it", async () => {
  const service = JSON.stringify({ url: "https://playback.example", token: "test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "nuvio:playback-service" ? service : null,
  });
  const fetchMock = vi.fn(async (url: string) =>
    url === "https://playback.example/request"
      ? new Response("Forbidden", { status: 403 })
      : Response.json({ id: "browser-addon" }),
  );
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(await response.json()).toEqual({ id: "browser-addon" });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "https://playback.example/request",
    "https://addon.example/manifest.json",
  ]);
});
