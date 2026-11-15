import { afterEach, expect, it, vi } from "vitest";
import { sourceFetch } from "../src/connection";

afterEach(() => vi.unstubAllGlobals());

it("recovers a rejected add-on manifest through the relay using the browser user agent", async () => {
  const service = JSON.stringify({ url: "https://playback.example", token: "test" });
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => key === "nuvio:playback-service" ? service : null,
  });
  vi.stubGlobal("navigator", { userAgent: "Test Browser/1.0" });
  const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://addon.example/manifest.json")
      return new Response("Forbidden", { status: 403 });
    expect(url).toBe("https://playback.example/request");
    const body = JSON.parse(String(options?.body));
    expect(body.url).toBe("https://addon.example/manifest.json");
    expect(body.headers["user-agent"]).toBe("Test Browser/1.0");
    return Response.json({ id: "working-addon" });
  });
  vi.stubGlobal("fetch", fetchMock);

  const response = await sourceFetch("https://addon.example/manifest.json");
  expect(response.ok).toBe(true);
  expect(await response.json()).toEqual({ id: "working-addon" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
