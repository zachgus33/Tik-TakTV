import { addonStreams, defaultAddons } from "../src/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createGuideParser, xmltvTime } from "../src/guide-parser";
import {
  addonUrls,
  parseCollections,
  parseTransfer,
  mergeCollections,
} from "../src/collections";
import {
  directStream,
  quality,
  rankedStreams,
  needsCompatibilityTranscode,
  seeders,
} from "../src/stream-selection";
import { prepareTorbox, selectTorboxFile, torboxLink } from "../src/torbox";
import { resolveAccountProvider } from "../src/provider-sharing";
import { liveAudioCodec } from "../src/media-compatibility";

afterEach(() => vi.restoreAllMocks());
describe("new account defaults", () => {
  it("includes metadata and subtitles without a shared streaming account", () => {
    expect(defaultAddons.map((addon) => addon.manifest.id)).toEqual([
      "com.linvo.cinemeta",
      "org.stremio.opensubtitlesv3",
    ]);
    expect(defaultAddons.some((addon) => /torrentio/i.test(addon.base))).toBe(
      false,
    );
  });
});
describe("live television browser compatibility", () => {
  it("uses AAC for Safari's native HLS player", () => {
    expect(
      liveAudioCodec(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15",
      ),
    ).toBe("aac");
  });

  it("keeps the verified MP3 path for Chromium browsers", () => {
    expect(
      liveAudioCodec(
        "Mozilla/5.0 AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36",
      ),
    ).toBe("mp3");
  });
});
describe("account-wide Xtream connection", () => {
  const provider = {
    server: "https://tv.example",
    username: "member",
    password: "secret",
  };

  it("migrates the primary profile connection to every secondary profile", () => {
    expect(resolveAccountProvider(2, {}, { provider })).toEqual(provider);
  });

  it("uses the account connection instead of a profile's stale connection", () => {
    expect(
      resolveAccountProvider(
        3,
        { provider: { ...provider, username: "old" } },
        { accountProvider: provider },
      ),
    ).toEqual(provider);
  });

  it("honors an account-wide disconnect", () => {
    expect(
      resolveAccountProvider(2, { provider }, { accountProvider: null }),
    ).toBeNull();
  });
});
describe("automatic Xtream XMLTV guide", () => {
  it("converts explicit positive and negative timezones to UTC", () => {
    expect(xmltvTime("20261023183000 +0200")).toBe(
      Date.UTC(2026, 9, 23, 16, 30),
    );
    expect(xmltvTime("20261023183000 -0400")).toBe(
      Date.UTC(2026, 9, 23, 22, 30),
    );
    expect(Number.isNaN(xmltvTime("bad"))).toBe(true);
  });
  it("parses split chunks, XML entities and only the current/next day", () => {
    const parser = createGuideParser(Date.UTC(2026, 9, 23, 18));
    parser.write(
      '<?xml version="1.0"?><tv><channel id="news"><display-name>US| Test News HD</display-name></channel><programme channel="news" start="20261023173000 +0000" stop="20261023183000 +0000"><ti',
    );
    parser.write(
      'tle>News &amp; weather</title><desc><![CDATA[Today’s headlines]]></desc></programme><programme channel="news" start="20261021173000 +0000" stop="20261021183000 +0000"><title>Old</title></programme></tv>',
    );
    expect(parser.finish().news).toEqual([
      {
        id: `news:${Date.UTC(2026, 9, 23, 17, 30)}`,
        start: Date.UTC(2026, 9, 23, 17, 30),
        end: Date.UTC(2026, 9, 23, 18, 30),
        title: "News & weather",
        description: "Today’s headlines",
      },
    ]);
    expect(parser.aliases()["US| Test News HD"]).toBe("news");
  });
  it("rejects malformed XML instead of treating it as a valid guide", () => {
    const parser = createGuideParser();
    expect(() => {
      parser.write("<html>not xmltv");
      parser.finish();
    }).toThrow();
  });
});
describe("Nuvio collections and add-on transfer", () => {
  const collection = {
    id: "a",
    title: "Cinema",
    pinToTop: true,
    folders: [
      {
        id: "f",
        title: "Movies",
        sources: [
          {
            provider: "addon",
            addonId: "com.linvo.cinemeta",
            type: "movie",
            catalogId: "top",
            genre: "Drama",
          },
        ],
        coverEmoji: "🎬",
      },
    ],
  };
  it("preserves native folder sources and presentation fields", () => {
    expect(parseCollections([collection])[0]).toMatchObject(collection);
  });
  it("merges imports without deleting unrelated local collections", () => {
    expect(
      mergeCollections(
        [{ id: "b", title: "Local", folders: [] }],
        [collection],
      ),
    ).toHaveLength(2);
  });
  it("rejects duplicate identities and malformed lists", () => {
    expect(() => parseCollections([collection, collection])).toThrow("unique");
    expect(() => parseCollections({ theme: "violet" })).toThrow("array");
  });
  it("accepts configured addon URLs and native managed add-on records", () => {
    expect(
      addonUrls(
        "stremio://addon.example/torbox=private/manifest.json\nhttps://second.example/manifest.json",
      ),
    ).toHaveLength(2);
    expect(
      addonUrls(
        JSON.stringify([
          { manifestUrl: "https://addon.example/config/manifest.json" },
        ]),
      ),
    ).toEqual(["https://addon.example/config/manifest.json"]);
  });
  it("rejects arbitrary schemes and native settings backups with an explanation", () => {
    expect(() => addonUrls("javascript:alert(1)")).toThrow("manifest");
    expect(() => parseTransfer('{"theme":"dark"}')).toThrow(
      "Native Enhanced settings",
    );
  });
});
describe("720p+ preference and safe episode matching", () => {
  it("keeps low quality, unrelated movies and unmatched episodes in the picker", () => {
    expect(
      selectTorboxFile([{ id: 1, name: "Movie.480p.mp4" }], { name: "1080p" }),
    ).toBeUndefined();
    expect(
      selectTorboxFile(
        [
          { id: 1, name: "Movie A.1080p.mp4" },
          { id: 2, name: "Movie B.2160p.mp4" },
        ],
        {},
      ),
    ).toBeUndefined();
    expect(
      selectTorboxFile(
        [{ id: 1, name: "Show.S01E03.1080p.mp4" }],
        {},
        { id: "ep", name: "Episode", season: 1, episode: 2 },
      ),
    ).toBeUndefined();
    expect(
      selectTorboxFile(
        [
          { id: 1, name: "Movie.720p.mp4" },
          { id: 2, name: "Movie.1080p.mp4" },
        ],
        {},
      )?.id,
    ).toBe(2);
  });
  it("recognizes resolution aliases", () => {
    expect(quality("2160p HDR")).toBe(2160);
    expect(quality("4K UHD")).toBe(2160);
    expect(quality("WEB-DL 720p")).toBe(720);
    expect(quality("CAM")).toBe(0);
  });
  it("ranks seeders first, excludes SD and unknown quality", () => {
    const streams = [
      { name: "2160p", title: "👤 12", url: "https://cdn.example/4k.mp4" },
      { name: "720p", title: "👤 300", url: "https://cdn.example/720.mp4" },
      { name: "480p", seeders: 900, url: "https://cdn.example/sd.mp4" },
      {
        name: "Unknown",
        seeders: 9000,
        url: "https://cdn.example/unknown.mp4",
      },
    ];
    expect(rankedStreams(streams, false).map((s) => s.name)).toEqual([
      "720p",
      "2160p",
    ]);
    expect(seeders({ title: "Seeders: 1,200" })).toBe(1200);
  });
  it("only enables raw torrents when TorBox is connected", () => {
    expect(
      rankedStreams([{ name: "1080p", infoHash: "a".repeat(40) }], false),
    ).toHaveLength(0);
    expect(
      rankedStreams([{ name: "1080p", infoHash: "a".repeat(40) }], true),
    ).toHaveLength(1);
  });
  it("skips helper links and non-web-ready entries without a relay", () => {
    const helper = {
      name: "Support provider",
      externalUrl: "https://example.com/support",
    };
    const incompatible = {
      name: "Provider 4K",
      url: "https://cdn.example/movie.mkv",
      behaviorHints: { notWebReady: true },
    };
    const browserReady = {
      name: "Provider 720p",
      url: "https://cdn.example/movie.m3u8",
      behaviorHints: { notWebReady: false },
    };
    expect(directStream(helper)).toBe(false);
    expect(directStream(incompatible)).toBe(false);
    expect(rankedStreams([helper, incompatible, browserReady], false)).toEqual([
      browserReady,
    ]);
  });
  it("prefers a cached direct stream over a higher-seeded raw torrent", () => {
    const direct = {
      name: "[TB+] Torrentio 1080p",
      title: "Movie.1080p 👤 215",
      url: "https://cdn.example/cached.mp4",
    };
    const raw = {
      name: "TorrentsDB 1080p",
      title: "Movie.1080p 👤 2000",
      infoHash: "a".repeat(40),
    };
    expect(rankedStreams([raw, direct], true)[0]).toBe(direct);
  });
  it("prefers browser-ready video before a higher-seeded MKV conversion", () => {
    const mkv = {
      name: "[TB+] Torrentio 1080p",
      title: "Show 1080p seeders: 500",
      url: "https://cdn.example/video",
      behaviorHints: { filename: "Show.S01E01.1080p.mkv" },
    };
    const mp4 = {
      name: "[TB+] Torrentio 720p",
      title: "Show 720p seeders: 50",
      url: "https://cdn.example/video.mp4",
    };
    expect(needsCompatibilityTranscode(mkv)).toBe(true);
    expect(needsCompatibilityTranscode(mp4)).toBe(false);
    expect(rankedStreams([mkv, mp4], true)[0]).toBe(mp4);
  });
  it("prefers cached Torrentio playback over download aggregators", () => {
    const torrentio = {
      name: "[TB+] Torrentio 1080p",
      title: "Movie 1080p seeders: 215",
      url: "https://torrentio.strem.fun/play",
    };
    const download = {
      name: "[TB download] TorrentsDB 1080p",
      title: "Movie 1080p seeders: 2199",
      url: "https://torrentsdb.com/play.mkv",
    };
    expect(rankedStreams([download, torrentio], true)[0]).toBe(torrentio);
  });
  it("matches S01E02 without choosing S01E020 or another episode", () => {
    const files = [
      { id: 1, name: "Show.S01E020.2160p.mkv" },
      { id: 2, name: "Show.S01E02.1080p.mkv" },
      { id: 3, name: "Show.S01E03.720p.mkv" },
    ];
    expect(
      selectTorboxFile(
        files,
        {},
        { id: "ep", name: "Episode", season: 1, episode: 2 },
      )?.id,
    ).toBe(2);
  });
  it("does not mistake a TorBox file id for the Stremio file index", () => {
    expect(
      selectTorboxFile(
        [
          { id: 0, name: "Movie A.mp4" },
          { id: 1, name: "Movie B.mp4" },
        ],
        { fileIdx: 0 },
      ),
    ).toBeUndefined();
  });
  it("picks an exact addon filename and a matching 1080p variant", () => {
    expect(
      selectTorboxFile(
        [
          { id: 8, name: "folder/movie.mp4" },
          { id: 2, name: "other.mp4" },
        ],
        { name: "1080p", behaviorHints: { filename: "movie.mp4" } },
      )?.id,
    ).toBe(8);
    expect(
      selectTorboxFile(
        [
          { id: 8, name: "Show.S01E02.480p.mkv" },
          { id: 2, name: "Show.S01E02.1080p.mkv" },
        ],
        {},
        { id: "ep", name: "Episode", season: 1, episode: 2 },
      )?.id,
    ).toBe(2);
  });
});
describe("TorBox cached torrent flow", () => {
  it("only requests cached additions, then obtains the selected video link", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, data: { torrent_id: 12 } }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 12, files: [{ id: 4, name: "Movie.1080p.mp4" }] }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: "https://cdn.example/movie.mp4",
          }),
        ),
      );
    const prepared = await prepareTorbox("fake-key", {
      infoHash: "a".repeat(40),
      name: "1080p",
    });
    const form = mock.mock.calls[0][1]?.body as FormData;
    expect(form.get("add_only_if_cached")).toBe("true");
    expect(prepared.selected?.id).toBe(4);
    expect(await torboxLink("fake-key", 12, 4)).toBe(
      "https://cdn.example/movie.mp4",
    );
    expect(
      new URL(String(mock.mock.calls[2][0])).searchParams.get("file_id"),
    ).toBe("4");
  });
  it("does not retry an uncached torrent as a new download", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: "NOT_CACHED" })),
      );
    await expect(
      prepareTorbox("fake-key", { infoHash: "a".repeat(40) }),
    ).rejects.toThrow("not cached");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});

describe("stream manifest compatibility", () => {
  it("treats empty resource filters as unrestricted", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ streams: [{ url: "https://cdn.example/movie.mp4" }] }),
      ),
    );
    const result = await addonStreams(
      [
        {
          base: "https://addon.example",
          manifest: {
            id: "streamer",
            name: "Streamer",
            resources: [{ name: "stream", types: [], idPrefixes: [] }],
          },
        },
      ],
      { id: "tt1", name: "Movie", type: "movie", source: "addon" },
      "tt1",
    );
    expect(result.count).toBe(1);
    expect(result.streams).toHaveLength(1);
  });
});
