import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectProvider,
  decodeText,
  installAddon,
  json,
  normalizeServer,
  parsePlaylist,
  providerDetail,
  providerItems,
  safeUrl,
  streamUrl,
  xtreamUrl,
} from "../src/api";
import type { Provider } from "../src/types";

const provider: Provider = {
  server: "https://provider.example",
  username: "a user/@",
  password: "p&?#/é",
  scope: "test",
  name: "Test",
};
afterEach(() => vi.restoreAllMocks());
describe("provider URLs and data", () => {
  it("normalizes Xtream endpoint URLs without keeping query credentials", () => {
    expect(
      normalizeServer(
        "https://provider.example:8443/player_api.php?username=secret",
      ),
    ).toBe("https://provider.example:8443");
    expect(() => normalizeServer("http://provider.example")).toThrow("HTTPS");
    expect(safeUrl("javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("https://user:password@provider.example")).toBeUndefined();
  });
  it("encodes credentials independently in API and stream URLs", () => {
    const api = new URL(xtreamUrl(provider, "get_live_streams"));
    expect(api.searchParams.get("password")).toBe(provider.password);
    expect(api.searchParams.get("username")).toBe(provider.username);
    expect(streamUrl(provider, "live", "5", "ts")).toBe(
      "https://provider.example/live/a%20user%2F%40/p%26%3F%23%2F%C3%A9/5.ts",
    );
    expect(streamUrl(provider, "movie", "6", "mkv")).toContain("/6.mkv");
    expect(streamUrl(provider, "movie", "6", "../../x")).toContain("/6.mp4");
  });
  it("rejects unauthenticated and expired accounts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ user_info: { auth: 0 } })),
    );
    await expect(connectProvider(provider)).rejects.toThrow("rejected");
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({ user_info: { auth: 1, status: "Expired" } }),
      ),
    );
    await expect(connectProvider(provider)).rejects.toThrow("not active");
  });
  it("creates a stable account scope without retaining the password in it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ user_info: { auth: "1", status: "Active" } }),
        ),
    );
    const one = await connectProvider(provider);
    const two = await connectProvider({ ...provider, password: "changed" });
    expect(one.scope).toMatch(/^[a-f0-9]{24}$/);
    expect(one.scope).toBe(two.scope);
  });
  it("maps stream ids and safe artwork, and sends category filters", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            stream_id: 9,
            name: "News",
            stream_icon: "javascript:bad",
            category_id: 4,
          },
        ]),
      ),
    );
    const items = await providerItems(provider, "live", "4");
    expect(items[0]).toMatchObject({
      id: "9",
      name: "News",
      category: "4",
      source: "xtream",
      provider: "test",
    });
    expect(items[0].poster).toBeUndefined();
    expect(String(vi.mocked(fetch).mock.calls[0][0])).toContain(
      "category_id=4",
    );
  });
  it("upgrades provider channel icons to HTTPS and resolves relative logos", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            stream_id: 1,
            name: "News",
            stream_icon: "http://img.example/news.png",
          },
          { stream_id: 2, name: "Sports", stream_icon: "/logos/sports.png" },
        ]),
      ),
    );
    const items = await providerItems(provider, "live", "");
    expect(items[0].poster).toBe("https://img.example/news.png");
    expect(items[1].poster).toBe("https://provider.example/logos/sports.png");
  });
  it("sorts series episodes numerically and preserves container format", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          info: { plot: "Story" },
          episodes: {
            2: [
              {
                id: 22,
                title: "Second",
                episode_num: 1,
                container_extension: "mkv",
              },
            ],
            1: [
              {
                id: 11,
                title: "First",
                episode_num: 1,
                container_extension: "mp4",
              },
            ],
          },
        }),
      ),
    );
    const detail = await providerDetail(provider, {
      id: "1",
      name: "Series",
      type: "series",
      source: "xtream",
    });
    expect(detail.episodes.map((e) => e.id)).toEqual(["11", "22"]);
    expect(detail.episodes[1].extension).toBe("mkv");
  });
});
describe("errors do not disclose credential URLs", () => {
  it("turns network errors into useful CORS guidance", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Failed to fetch"),
    );
    await expect(json(xtreamUrl(provider))).rejects.toThrow("CORS");
  });
  it("handles HTTP and invalid JSON errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("", { status: 511 }),
    );
    await expect(json(xtreamUrl(provider))).rejects.toThrow("HTTP 511");
    vi.mocked(fetch).mockResolvedValue(new Response("<html>login</html>"));
    await expect(json(xtreamUrl(provider))).rejects.toThrow(
      "valid API response",
    );
  });
  it("propagates cancellation", async () => {
    const c = new AbortController();
    c.abort();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("Aborted", "AbortError"),
    );
    await expect(
      json("https://provider.example", c.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
describe("playlists and addons", () => {
  it("imports HTTPS channels and skips unsafe or custom-header streams", () => {
    const items = parsePlaylist(
      '#EXTM3U\n#EXTINF:-1 tvg-logo="https://img.example/logo.png" group-title="News",World News\nhttps://tv.example/live.m3u8\n#EXTINF:-1,Bad\nhttp://insecure.example/live\n#EXTINF:-1,Header\nhttps://tv.example/live|User-Agent=app',
      "scope",
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: "World News",
      category: "News",
      provider: "scope",
    });
  });
  it("distinguishes a video HLS manifest from a channel playlist", () => {
    expect(() =>
      parsePlaylist("#EXTM3U\n#EXT-X-TARGETDURATION:10", "scope"),
    ).toThrow("video manifest");
  });
  it("decodes UTF-8 programme metadata", () => {
    expect(
      decodeText(
        btoa(String.fromCharCode(...new TextEncoder().encode("Café news"))),
      ),
    ).toBe("Café news");
  });
  it("accepts a Stremio URL and retains a configured addon path", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "test", name: "Test", resources: ["stream"] }),
      ),
    );
    const addon = await installAddon(
      "stremio://addon.example/config/manifest.json",
    );
    expect(addon.base).toBe("https://addon.example/config");
  });
  it("accepts Nuvio's stored add-on base URL", async () => {
    const request = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ id: "test", name: "Test", resources: ["stream"] }),
        ),
      );
    const addon = await installAddon("https://addon.example/config");
    expect(request).toHaveBeenCalledWith(
      "https://addon.example/config/manifest.json",
      expect.anything(),
    );
    expect(addon.base).toBe("https://addon.example/config");
  });
});
