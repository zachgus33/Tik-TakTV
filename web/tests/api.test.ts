import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectProvider,
  decodeText,
  fromMeta,
  addonDetail,
  installAddon,
  json,
  normalizeServer,
  parsePlaylist,
  providerDetail,
  providerItems,
  safeSourceUrl,
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
  it("fills season 1 from canonical metadata when an IMDb add-on omits it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const partial = url.includes("partial.example");
      return new Response(JSON.stringify({ meta: {
        id: "tt3501074", name: "Madam Secretary", type: "series",
        videos: partial
          ? [{ id: "tt3501074:2:1", season: 2, episode: 1, title: "The Show Must Go On" }]
          : [
              { id: "tt3501074:1:1", season: 1, episode: 1, title: "Pilot" },
              { id: "tt3501074:2:1", season: 2, episode: 1, title: "The Show Must Go On" },
            ],
      } }));
    });
    const result = await addonDetail({
      id: "tt3501074", name: "Madam Secretary", type: "series",
      source: "addon", provider: "https://partial.example",
    });
    expect(result.episodes.map((episode) => `${episode.season}:${episode.episode}`))
      .toEqual(["1:1", "2:1"]);
    expect(result.item.provider).toBe("https://partial.example");
  });
  it("fills a missing middle season without replacing existing episode IDs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const partial = String(input).includes("partial.example");
      return new Response(JSON.stringify({ meta: {
        id: "tt1234567", name: "Series", type: "series",
        videos: (partial ? [1, 3] : [1, 2, 3]).map((season) => ({
          id: `${partial ? "custom" : "canonical"}:${season}:1`,
          season, episode: 1,
        })),
      } }));
    });
    const result = await addonDetail({ id: "tt1234567", name: "Series", type: "series",
      source: "addon", provider: "https://partial.example" });
    expect(result.episodes.map((episode) => episode.id))
      .toEqual(["custom:1:1", "canonical:2:1", "custom:3:1"]);
  });
  it("keeps custom catalog artwork when it is HTTP or relative to the add-on", () => {
    const addon = { base: "https://arabic.example/config", manifest: { id: "arabic", name: "Arabic" } };
    expect(fromMeta({ id: "arabic:1", name: "فيلم", poster: "/posters/1.jpg" }, addon).poster)
      .toBe("https://arabic.example/posters/1.jpg");
    expect(fromMeta({ id: "arabic:2", name: "فيلم", poster: "http://art.example/2.jpg" }, addon).poster)
      .toBe("http://art.example/2.jpg");
    expect(fromMeta({ id: "arabic:3", name: "فيلم" }, addon).poster).toBeUndefined();
  });
  it("normalizes Xtream endpoint URLs without keeping query credentials", () => {
    expect(
      normalizeServer(
        "https://provider.example:8443/player_api.php?username=secret",
      ),
    ).toBe("https://provider.example:8443");
    expect(normalizeServer("http://provider.example/player_api.php")).toBe(
      "http://provider.example",
    );
    expect(safeSourceUrl("http://provider.example/live/1.ts")).toBe(
      "http://provider.example/live/1.ts",
    );
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
  it("preserves provider artwork protocols and resolves relative logos", async () => {
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
    expect(items[0].poster).toBe("http://img.example/news.png");
    expect(items[1].poster).toBe("https://provider.example/logos/sports.png");
  });
  it("keeps only guide-linked channels when Live TV requests them", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          { stream_id: 1, name: "With guide", epg_channel_id: "news.one" },
          { stream_id: 2, name: "Without guide", epg_channel_id: "" },
        ]),
      ),
    );
    const items = await providerItems(provider, "live", "", undefined, {
      guideOnly: true,
    });
    expect(items.map((item) => item.name)).toEqual(["With guide"]);
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
  it("imports HTTP and HTTPS channels and skips custom-header streams", () => {
    const items = parsePlaylist(
      '#EXTM3U\n#EXTINF:-1 tvg-id="world.news" tvg-logo="https://img.example/logo.png" group-title="News",World News\nhttps://tv.example/live.m3u8\n#EXTINF:-1,Bad\nhttp://insecure.example/live\n#EXTINF:-1,Header\nhttps://tv.example/live|User-Agent=app',
      "scope",
    );
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      name: "World News",
      category: "News",
      epgId: "world.news",
      provider: "scope",
    });
    expect(items[1].url).toBe("http://insecure.example/live");
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
  it("accepts a self-hosted HTTP add-on manifest URL", async () => {
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ id: "lan", name: "LAN add-on", resources: ["stream"] }),
      ),
    );
    const addon = await installAddon(
      "http://192.168.4.56:3000/stremio/config/manifest.json",
    );
    expect(request).toHaveBeenCalledWith(
      "http://192.168.4.56:3000/stremio/config/manifest.json",
      expect.anything(),
    );
    expect(addon.base).toBe("http://192.168.4.56:3000/stremio/config");
  });
  it("explains when the hosted companion cannot reach a private HTTP add-on", async () => {
    const source = "http://192.168.4.56:3000/manifest.json";
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "nuvio:playback-service"
          ? JSON.stringify({ url: "https://playback.example", token: "test" })
          : null,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input) === source) throw new TypeError("Mixed content blocked");
      return new Response(
        JSON.stringify({ error: "Private destinations are not allowed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    });
    try {
      await expect(json(source)).rejects.toThrow(
        "hosted companion cannot reach devices inside your LAN",
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
