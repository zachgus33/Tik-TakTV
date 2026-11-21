import { addonStreams, defaultAddons } from "../src/api";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createGuideParser, xmltvTime } from "../src/guide-parser";
import {
  addonUrls,
  parseCollections,
  parseTransfer,
  mergeCollections,
  optionalCollectionGenre,
  sourceCatalog,
} from "../src/collections";

import {
  catalogChoices,
  completeCatalogSettings,
  homeCatalogEntries,
  normalizeCatalogOrder,
  settingMatchesChoice,
} from "../src/catalog-settings";
import {
  autoplayStreams,
  audioCompatibility,
  codecCompatibility,
  compatibilityPlaybackMode,
  directStream,
  defaultStreamPreferences,
  debridStream,
  quality,
  rankedStreams,
  needsCompatibilityTranscode,
  normalizeStreamPreferences,
  parseExcludedTerms,
  seeders,
  sourcePickerStreams,
  preferredAudioTrackIndex,
  saveStreamPreferences,
  streamAudioCodec,
  streamAudioLanguageScore,
  streamMatchesRegex,
  streamSubtitlePriority,
  validStreamRegex,
} from "../src/stream-selection";
import { prepareTorbox, selectTorboxFile, torboxLink } from "../src/torbox";
import { resolveRealDebrid, validateRealDebridKey } from "../src/realdebrid";
import { resolveAccountProvider } from "../src/provider-sharing";
import { liveAudioCodec } from "../src/media-compatibility";
import { downloadPreparationStatus, prepareDownload } from "../src/connection";
import {
  streamCompatibility,
  updateDownloadJob,
  downloadJobs,
  removeDownloadJob,
} from "../src/reliability";
import { decryptSetup, encryptSetup } from "../src/encrypted-backup";
import {
  addonQuarantined,
  clearAddonQuarantine,
  recordAddonFailure,
} from "../src/addon-health";
import { persistableSetup } from "../src/account-isolation";
import { clearAccountStorage } from "../src/storage";
import { beginProfileSync, profileSyncKey } from "../src/profile-sync";
import {
  hasLikelyExpiringPlaybackCredentials,
  readStreamLink,
  saveStreamLink,
  streamContentKey,
} from "../src/enhanced-stream-cache";
import { streamBadgeNames } from "../src/stream-badges";
import { mergePlaybackAlternatives } from "../src/Player";

describe("custom collection catalog resolution", () => {
  it("treats a saved 'none' genre as an unfiltered catalog", () => {
    expect(optionalCollectionGenre("none")).toBeUndefined();
    expect(optionalCollectionGenre(" NONE ")).toBeUndefined();
    expect(optionalCollectionGenre("comedy")).toBe("comedy");
  });
  it("keeps a configured catalog when the default add-on is disabled", () => {
    const disabled = {
      base: "https://default.example",
      enabled: false,
      manifest: {
        id: "catalog",
        name: "Default",
        catalogs: [{ id: "arabic", type: "movie" }],
      },
    };
    const configured = {
      base: "https://configured.example",
      enabled: true,
      manifest: {
        id: "catalog",
        name: "Configured",
        catalogs: [{ id: "arabic", type: "movie" }],
      },
    };
    expect(
      sourceCatalog(
        {
          provider: "addon",
          addonId: "catalog",
          type: "movie",
          catalogId: "arabic,genre",
        },
        [disabled, configured],
      ),
    ).toEqual({ addon: configured, catalog: configured.manifest.catalogs[0] });
  });
  it("loads a saved ArabCinemeta row on a new profile without copied add-ons", () => {
    const resolved = sourceCatalog(
      {
        provider: "addon",
        addonId: "community.elcinema.metadata",
        type: "series",
        catalogId: "elcinema-shahid-series",
      },
      [],
    );
    expect(resolved?.addon.base).toBe("https://arabcinemeta.osamayousry.com");
    expect(resolved?.catalog.id).toBe("elcinema-shahid-series");
  });
  it("restores any configured add-on URL without a copied manifest", () => {
    const resolved = sourceCatalog(
      {
        provider: "addon",
        addonId: "https://example.com/private/config?token=abc",
        type: "movie",
        catalogId: "curated",
      },
      [],
    );
    expect(resolved?.addon.base).toBe(
      "https://example.com/private/config?token=abc",
    );
    expect(resolved?.catalog.id).toBe("curated");
  });
  it("uses the named add-on when another add-on has the same catalog ID", () => {
    const named = {
      base: "https://named.example",
      manifest: { id: "named", name: "Named", catalogs: [] },
    };
    const other = {
      base: "https://other.example",
      manifest: {
        id: "other",
        name: "Other",
        catalogs: [{ type: "movie", id: "curated" }],
      },
    };
    const resolved = sourceCatalog(
      {
        provider: "addon",
        addonId: "named",
        type: "movie",
        catalogId: "curated",
      },
      [named, other],
    );
    expect(resolved?.addon).toBe(named);
  });
  it("recovers a saved collection when its add-on manifest ID changed", () => {
    const addon = {
      base: "https://arabic.example",
      manifest: {
        id: "new-id",
        name: "Arabic",
        catalogs: [{ type: "series", id: "shahid" }],
      },
    };
    const resolved = sourceCatalog(
      {
        provider: "addon",
        addonId: "old-id",
        type: "series",
        catalogId: "shahid",
      },
      [addon],
    );
    expect(resolved?.addon).toBe(addon);
  });
  it("does not guess between two add-ons with the same catalog", () => {
    const addons = ["one", "two"].map((id) => ({
      base: `https://${id}.example`,
      manifest: { id, name: id, catalogs: [{ type: "movie", id: "popular" }] },
    }));
    expect(
      sourceCatalog(
        {
          provider: "addon",
          addonId: "old-id",
          type: "movie",
          catalogId: "popular",
        },
        addons,
      ),
    ).toBeUndefined();
  });
});

describe("in-player source stability", () => {
  const playback = (url: string, label: string) => ({
    item: {
      id: "tt1",
      name: "Movie",
      type: "movie" as const,
      source: "addon" as const,
    },
    url,
    sourceLabel: label,
  });

  it("appends late provider results without moving existing source indexes", () => {
    const first = playback("https://cdn.example/first.mp4", "First");
    const selected = playback("https://cdn.example/selected.mp4", "Selected");
    const late = playback("https://cdn.example/late.mp4", "Late Debridio");

    expect(
      mergePlaybackAlternatives([first, selected], [late, selected, first]),
    ).toEqual([first, selected, late]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("account isolation", () => {
  it("keeps the same profile index isolated between accounts", () => {
    expect(profileSyncKey("account-a", 2)).not.toBe(
      profileSyncKey("account-b", 2),
    );
    expect(profileSyncKey("account-a", 1)).not.toBe(
      profileSyncKey("account-a", 2),
    );
  });

  it("opens a selected profile before its remote refresh finishes", async () => {
    let finish!: (value: string) => void;
    const load = new Promise<string>((resolve) => {
      finish = resolve;
    });
    const opened = vi.fn();
    const applied = vi.fn();
    beginProfileSync(opened, () => load, applied, vi.fn());
    expect(opened).toHaveBeenCalledOnce();
    expect(applied).not.toHaveBeenCalled();
    finish("fresh setup");
    await load;
    await Promise.resolve();
    expect(applied).toHaveBeenCalledWith("fresh setup");
  });

  it("never persists a live Nuvio bearer as a playback-service secret", () => {
    const setup = {
      playbackService: {
        url: "https://api.tiktaktv.me",
        token: "live-account-bearer",
        account: true as const,
      },
      addons: [],
      collections: [],
      library: [],
      progress: [],
      provider: null,
      torboxKey: "",
      realDebridKey: "",
      autoplay: true,
    };
    expect(persistableSetup(setup).playbackService).toBeNull();
  });

  it("keeps source controls in the profile setup for cross-device sync", () => {
    const streamPreferences = {
      maxQuality: 4320,
      maxSizeGb: 0,
      excludedTerms: [],
      codec: "any" as const,
      autoPlayMode: "regex" as const,
      autoPlayRegex: "Debridio (2160p|4k|1440p|1080p|720p)",
      updatedAt: 123,
    };
    const setup = {
      addons: [],
      collections: [],
      library: [],
      progress: [],
      provider: null,
      torboxKey: "",
      realDebridKey: "",
      autoplay: true,
      streamPreferences,
    };
    expect(persistableSetup(setup).streamPreferences).toEqual(
      streamPreferences,
    );
  });

  it("clears credentials and account-owned caches from both storage scopes", () => {
    const makeStorage = () => {
      const values = new Map<string, string>();
      return {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      };
    };
    const local = makeStorage();
    const session = makeStorage();
    vi.stubGlobal("localStorage", local);
    vi.stubGlobal("sessionStorage", session);
    for (const storage of [local, session]) {
      storage.setItem("nuvio:torbox-key", "private");
      storage.setItem("nuvio:provider", "private");
      storage.setItem("nuvio:home-catalogs", "private");
      storage.setItem("tiktak:stream-preferences", "private");
      storage.setItem("tiktak:active-profile-owner", "old-user:1");
    }
    clearAccountStorage();
    for (const storage of [local, session]) {
      expect(storage.getItem("nuvio:torbox-key")).toBeNull();
      expect(storage.getItem("nuvio:provider")).toBeNull();
      expect(storage.getItem("nuvio:home-catalogs")).toBeNull();
      expect(storage.getItem("tiktak:stream-preferences")).toBeNull();
      expect(storage.getItem("tiktak:active-profile-owner")).toBeNull();
    }
  });
});
describe("encrypted setup backups", () => {
  it("round-trips private setup and rejects the wrong passphrase", async () => {
    const setup = {
      transfer: {
        format: "nuvio-enhanced-web" as const,
        version: 1 as const,
        addons: ["https://addon.example/manifest.json"],
        collections: [],
        library: [],
        progress: [],
      },
      provider: {
        kind: "xtream" as const,
        server: "https://tv.example",
        username: "friend",
        password: "private-password",
      },
      epgUrl: "https://guide.example/epg.xml?token=private-epg",
      torboxKey: "private-torbox",
      realDebridKey: "private-rd",
      autoplay: true,
      homeCatalogs: [],
      tmdbKey: "private-tmdb",
    };
    const encrypted = await encryptSetup(setup, "correct horse battery staple");
    expect(encrypted).not.toContain("private-torbox");
    expect(encrypted).not.toContain("private-password");
    expect(encrypted).not.toContain("private-epg");
    expect(
      await decryptSetup(encrypted, "correct horse battery staple"),
    ).toEqual(setup);
    await expect(decryptSetup(encrypted, "wrong passphrase")).rejects.toThrow(
      /incorrect|damaged/i,
    );
  });
});

describe("add-on failure quarantine", () => {
  it("pauses a repeatedly failing add-on and supports an immediate retry", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const addon = defaultAddons[0];
    recordAddonFailure(addon, new Error("offline"));
    recordAddonFailure(addon, new Error("offline"));
    expect(addonQuarantined(addon)).toBe(false);
    recordAddonFailure(addon, new Error("offline"));
    expect(addonQuarantined(addon)).toBe(true);
    clearAddonQuarantine();
    expect(addonQuarantined(addon)).toBe(false);
    vi.unstubAllGlobals();
  });
});
describe("UI text encoding", () => {
  it("does not contain common UTF-8 mojibake sequences", () => {
    const source = ["App.tsx", "Settings.tsx"]
      .map((file) =>
        readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"),
      )
      .join("\n");
    expect(source).not.toMatch(/Â|ðŸ|â€|â€™|Ã|ï¿½|�/u);
  });
});
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
describe("per-profile source controls", () => {
  it("parses multiple comma-separated excluded terms without losing input", () => {
    expect(parseExcludedTerms("CAM, telesync, dubbed")).toEqual([
      "CAM",
      "telesync",
      "dubbed",
    ]);
    expect(parseExcludedTerms(" CAM, cam,\n telesync; dubbed ")).toEqual([
      "CAM",
      "telesync",
      "dubbed",
    ]);
  });
  it("preserves Mobile Enhanced's unlimited source-selection timeout", () => {
    expect(
      normalizeStreamPreferences({
        autoPlayTimeoutSeconds: Number.MAX_SAFE_INTEGER,
      }).autoPlayTimeoutSeconds,
    ).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("applies quality, size, codec and excluded-term limits", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    storage.set(
      "tiktak:stream-preferences",
      JSON.stringify({
        maxQuality: 1080,
        maxSizeGb: 5,
        codec: "h264",
        excludedTerms: ["CAM"],
      }),
    );
    const streams = [
      { name: "2160p H264 4 GB", url: "https://cdn.example/4k.mp4" },
      { name: "1080p H265 4 GB", url: "https://cdn.example/hevc.mp4" },
      { name: "1080p H264 8 GB", url: "https://cdn.example/large.mp4" },
      { name: "1080p H264 CAM 4 GB", url: "https://cdn.example/cam.mp4" },
      { name: "1080p H264 4 GB", url: "https://cdn.example/good.mp4" },
    ];
    expect(rankedStreams(streams, false).map((stream) => stream.url)).toEqual([
      "https://cdn.example/good.mp4",
    ]);
    expect(autoplayStreams(streams, false).map((stream) => stream.url)).toEqual([
      "https://cdn.example/good.mp4",
    ]);
    vi.unstubAllGlobals();
  });
  it("persists the complete regex payload including its sync revision", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    saveStreamPreferences({
      maxQuality: 4320,
      maxSizeGb: 0,
      codec: "any",
      excludedTerms: [],
      autoPlayMode: "regex",
      autoPlayRegex: "Debridio (2160p|4k|1440p|1080p|720p)",
      updatedAt: 456,
    });
    expect(
      JSON.parse(storage.get("tiktak:stream-preferences") ?? "{}"),
    ).toMatchObject({
      autoPlayMode: "regex",
      autoPlayRegex: "Debridio (2160p|4k|1440p|1080p|720p)",
      updatedAt: 456,
    });
  });
  it("keeps provider order for regex autoplay while still selecting preferred embedded audio", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === "tiktak:stream-preferences"
          ? JSON.stringify({
              autoPlayMode: "regex",
              autoPlayRegex: "720p",
            })
          : null,
    });
    vi.stubGlobal("navigator", { languages: ["en-US"], language: "en-US" });
    const portuguese = {
      name: "720p Portuguese",
      seeders: 5000,
      url: "https://cdn.example/portuguese.mp4",
    };
    const english = {
      name: "720p English",
      seeders: 10,
      url: "https://cdn.example/english.mp4",
    };
    expect(streamAudioLanguageScore(english)).toBeGreaterThan(
      streamAudioLanguageScore(portuguese),
    );
    expect(autoplayStreams([portuguese, english], false)[0]).toBe(portuguese);
    expect(
      preferredAudioTrackIndex([
        { label: "Português", language: "por" },
        { label: "English AAC", language: "eng" },
      ]),
    ).toBe(1);
  });
  it("uses mobile manual mode, add-on scope, and direct-debrid group ordering", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const publicStream = {
      addonId: "https://public.example",
      addonName: "Public",
      name: "Public 1080p",
      url: "https://cdn.example/public.mp4",
    };
    const debridStream = {
      addonId: "https://debrid.example",
      addonName: "Debridio",
      name: "[RD+] Debridio 1080p",
      url: "https://cdn.example/debrid.mp4",
    };

    storage.set(
      "tiktak:stream-preferences",
      JSON.stringify({ autoPlayMode: "manual" }),
    );
    expect(autoplayStreams([publicStream, debridStream], true)).toEqual([]);

    storage.set(
      "tiktak:stream-preferences",
      JSON.stringify({
        autoPlayMode: "first",
        autoPlaySelectedAddons: [publicStream.addonId],
      }),
    );
    expect(autoplayStreams([debridStream, publicStream], true)).toEqual([
      publicStream,
    ]);

    storage.set(
      "tiktak:stream-preferences",
      JSON.stringify({ autoPlayMode: "first" }),
    );
    expect(
      autoplayStreams(
        [publicStream, debridStream],
        true,
        ["Public", "Debridio"],
      ),
    ).toEqual([debridStream, publicStream]);

    storage.set(
      "tiktak:stream-preferences",
      JSON.stringify({
        autoPlayMode: "first",
        pinnedSources: [
          { id: publicStream.addonId, name: publicStream.addonName },
        ],
      }),
    );
    expect(
      sourcePickerStreams([debridStream, publicStream], [
        "Debridio",
        "Public",
      ]),
    ).toEqual([publicStream, debridStream]);
  });
});

describe("mobile-style stream link reuse", () => {
  it("reuses stable links and rejects expiring credential URLs", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    const item = {
      id: "tt-cache",
      name: "Cached movie",
      type: "movie" as const,
      source: "addon" as const,
    };
    const key = streamContentKey(item);
    const stable = {
      addonName: "Debridio",
      name: "Cached 1080p",
      url: "https://cdn.example/movie.mp4",
    };
    saveStreamLink(key, stable);
    expect(readStreamLink(key, 24)).toEqual(stable);
    expect(
      hasLikelyExpiringPlaybackCredentials(
        "https://cdn.example/movie.mp4?expires=123&signature=secret",
      ),
    ).toBe(true);
    saveStreamLink(key, {
      ...stable,
      url: "https://cdn.example/movie.mp4?token=temporary",
    });
    expect(readStreamLink(key, 24)).toBeUndefined();
  });
});

describe("mobile-style stream badges", () => {
  it("matches active imported rules and built-in size/add-on badges", () => {
    const preferences = {
      ...defaultStreamPreferences,
      streamBadgeImports: [
        {
          sourceUrl: "https://badges.example/rules.json",
          isActive: true,
          filters: [
            { name: "4K", pattern: "(?i)(2160p|4k)" },
            { name: "HDR", pattern: "(?i)hdr", isEnabled: false },
          ],
        },
      ],
    };
    expect(
      streamBadgeNames(
        {
          addonName: "Debridio",
          name: "4K cached",
          title: "Movie.2160p.WEB-DL 18.5 GB",
          url: "https://cdn.example/movie.mkv",
        },
        preferences,
      ),
    ).toEqual(["4K", "18.5 GB", "Debridio"]);
  });
});
describe("add-on controls", () => {
  it("keeps disabled add-ons out of catalog choices", () => {
    const addon = defaultAddons[0];
    expect(catalogChoices([{ ...addon, enabled: false }])).toEqual([]);
    expect(
      catalogChoices([{ ...addon, enabled: true }]).length,
    ).toBeGreaterThan(0);
  });
});
describe("browser downloads", () => {
  it("allows a direct MP4 download without requiring the companion service", async () => {
    await expect(
      prepareDownload("https://cdn.example/movie.mp4", "Movie.mp4"),
    ).resolves.toBe("https://cdn.example/movie.mp4");
  });

  it("waits for the companion's completed MP4 and exposes its real prepared size", async () => {
    const values = new Map<string, string>([
      [
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "x".repeat(40),
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { setTimeout, clearTimeout }),
    );
    const progress: { status: string; bytes?: number }[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith("/download"))
        return new Response(
          JSON.stringify({
            status: "preparing",
            statusPath: "/media/abcdefghijklmnopqrstuvwx12345678/status.json",
          }),
          { status: 202 },
        );
      return new Response(
        JSON.stringify({
          status: "ready",
          bytes: 4_194_304,
          path: "/media/abcdefghijklmnopqrstuvwx12345678/download.mp4",
        }),
      );
    });
    await expect(
      prepareDownload(
        "https://cdn.example/movie.mkv",
        "Movie.mp4",
        undefined,
        undefined,
        (value) => progress.push({ status: value.status, bytes: value.bytes }),
      ),
    ).resolves.toBe(
      "https://playback.example/media/abcdefghijklmnopqrstuvwx12345678/download.mp4",
    );
    expect(progress).toEqual([
      { status: "preparing", bytes: undefined },
      { status: "ready", bytes: 4_194_304 },
    ]);
  });

  it("reports a companion conversion failure instead of handing off an attachment", async () => {
    const values = new Map<string, string>([
      [
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "x".repeat(40),
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal(
      "window",
      Object.assign(new EventTarget(), { setTimeout, clearTimeout }),
    );
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "preparing",
            statusPath: "/media/abcdefghijklmnopqrstuvwx12345678/status.json",
          }),
          { status: 202 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "failed",
            error: "The source rejected the download.",
          }),
        ),
      );
    await expect(
      prepareDownload("https://cdn.example/movie.mkv", "Movie.mp4"),
    ).rejects.toThrow("The source rejected the download.");
  });

  it("treats an expired temporary MP4 as a terminal manager failure", async () => {
    const values = new Map<string, string>([
      [
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "x".repeat(40),
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Download expired." }), {
        status: 410,
      }),
    );
    await expect(
      downloadPreparationStatus(
        "/media/abcdefghijklmnopqrstuvwx12345678/status.json",
      ),
    ).rejects.toMatchObject({
      name: "DownloadStatusError",
      permanent: true,
    });
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

  it("leaves a fresh Nuvio account disconnected", () => {
    expect(resolveAccountProvider(1, {}, {})).toBeNull();
    expect(resolveAccountProvider(2, {}, {})).toBeNull();
  });

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
      '<?xml version="1.0"?><tv><channel id="news"><display-name>US| Test News HD</display-name><icon src="http://logos.example/news.png" /></channel><programme channel="news" start="20261023173000 +0000" stop="20261023183000 +0000"><ti',
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
    expect(parser.artwork().news).toBe("http://logos.example/news.png");
  });
  it("rejects malformed XML instead of treating it as a valid guide", () => {
    const parser = createGuideParser();
    expect(() => {
      parser.write("<html>not xmltv");
      parser.finish();
    }).toThrow();
  });
  it("keeps only requested guide channels for progressive large-feed parsing", () => {
    const parser = createGuideParser(Date.UTC(2026, 9, 23, 18), {
      ids: ["wanted"],
    });
    parser.write(
      '<tv><channel id="wanted"><display-name>Wanted</display-name></channel><channel id="other"><display-name>Other</display-name></channel><programme channel="wanted" start="20261023180000 +0000" stop="20261023190000 +0000"><title>Wanted show</title></programme><programme channel="other" start="20261023180000 +0000" stop="20261023190000 +0000"><title>Other show</title></programme></tv>',
    );
    expect(Object.keys(parser.finish())).toEqual(["wanted"]);
  });
  it("matches provider guide identifiers despite case and quality decoration", () => {
    const parser = createGuideParser(Date.UTC(2026, 9, 23, 18), {
      ids: ["US| ESPN HD"],
    });
    parser.write(
      '<tv><channel id="us-espn"><display-name>ESPN</display-name></channel><programme channel="us-espn" start="20261023180000 +0000" stop="20261023190000 +0000"><title>Live Sports</title></programme></tv>',
    );
    expect(parser.finish()["us-espn"]?.[0]?.title).toBe("Live Sports");
  });
  it("drains only newly changed guide rows for cheap worker updates", () => {
    const parser = createGuideParser(Date.UTC(2026, 9, 23, 18), {
      ids: ["one", "two"],
    });
    parser.write(
      '<tv><channel id="one"><display-name>One</display-name></channel><channel id="two"><display-name>Two</display-name></channel><programme channel="one" start="20261023180000 +0000" stop="20261023190000 +0000"><title>First</title></programme>',
    );
    expect(Object.keys(parser.drain().programmes)).toEqual(["one"]);
    expect(Object.keys(parser.drain().programmes)).toEqual([]);
    parser.write(
      '<programme channel="two" start="20261023180000 +0000" stop="20261023190000 +0000"><title>Second</title></programme></tv>',
    );
    expect(Object.keys(parser.drain().programmes)).toEqual(["two"]);
    expect(Object.keys(parser.finish()).sort()).toEqual(["one", "two"]);
  });
});
describe("home catalog management", () => {
  const addons = [
    {
      base: "https://one.example/config-a",
      manifest: {
        id: "torrentio",
        name: "Torrentio A",
        catalogs: [{ id: "popular", type: "movie", name: "Popular" }],
      },
    },
    {
      base: "https://two.example/config-b",
      manifest: {
        id: "torrentio",
        name: "Torrentio B",
        catalogs: [{ id: "popular", type: "movie", name: "Popular" }],
      },
    },
  ];

  it("shows Trakt add-on catalogs while keeping search-only catalogs off Home", () => {
    const traktAddon = {
      base: "https://trakt.example/config",
      manifest: {
        id: "trakt-addon",
        name: "Trakt",
        catalogs: [
          {
            id: "trakt_trending_movies",
            type: "trakt",
            name: "Trending movies",
          },
          {
            id: "trakt_search_movies",
            type: "trakt",
            name: "Search",
            extra: [{ name: "search", isRequired: true }],
          },
        ],
      },
    };
    expect(
      catalogChoices([traktAddon]).map((choice) => choice.catalogId),
    ).toEqual(["trakt_trending_movies"]);
    expect(
      homeCatalogEntries([traktAddon], []).map((entry) => entry.catalog.id),
    ).toEqual(["trakt_trending_movies"]);
  });

  it("includes AIO Metadata catalogs with the shared all type", () => {
    const addon = {
      base: "https://metadata.example/config",
      manifest: {
        id: "aio-metadata",
        name: "AIO Metadata",
        catalogs: [
          { id: "trakt.list.30828647", type: "all", name: "Trending Movies" },
        ],
      },
    };
    expect(catalogChoices([addon]).map((choice) => choice.catalogId)).toEqual([
      "trakt.list.30828647",
    ]);
    expect(
      homeCatalogEntries([addon], []).map((entry) => entry.catalog.type),
    ).toEqual(["all"]);
  });

  it("keeps separately configured copies of the same add-on distinct", () => {
    const choices = catalogChoices(addons);
    expect(choices).toHaveLength(2);
    expect(choices[0].key).not.toBe(choices[1].key);
    const settings = completeCatalogSettings(choices, []);
    expect(settingMatchesChoice(settings[0], choices[0])).toBe(true);
    expect(settingMatchesChoice(settings[0], choices[1])).toBe(false);
    expect(
      settingMatchesChoice(
        {
          addon_id: "torrentio",
          type: "movie",
          catalog_id: "popular",
          enabled: true,
          order: 0,
          key: "torrentio:movie:popular",
        },
        choices[0],
      ),
    ).toBe(true);
  });

  it("preserves edits and normalizes drag-button ordering", () => {
    const choices = catalogChoices(addons);
    const settings = completeCatalogSettings(choices, [
      {
        addon_id: "torrentio",
        type: "movie",
        catalog_id: "popular",
        enabled: false,
        order: 8,
        custom_title: "Friday night",
        key: choices[1].key,
      },
    ]);
    expect(settings[1]).toMatchObject({
      enabled: false,
      custom_title: "Friday night",
      key: choices[1].key,
    });
    expect(
      normalizeCatalogOrder(settings.reverse()).map((item) => item.order),
    ).toEqual([0, 1]);
  });

  it("shows all eligible catalogs when settings contain only collection rows", () => {
    const many = Array.from({ length: 16 }, (_, index) => ({
      ...addons[0],
      base: `https://catalog-${index}.example`,
    }));
    const entries = homeCatalogEntries(many, [
      {
        addon_id: "",
        type: "movie",
        catalog_id: "",
        enabled: true,
        order: 0,
        is_collection: true,
      },
    ]);
    expect(entries).toHaveLength(16);
    expect(entries[15].addon.base).toBe("https://catalog-15.example");
  });

  it("keeps disabled add-ons off Home even when saved rows include them", () => {
    const choices = catalogChoices(addons);
    const settings = completeCatalogSettings(choices, []);
    expect(
      homeCatalogEntries(
        [{ ...addons[0], enabled: false }, addons[1]],
        settings,
      ).map((entry) => entry.addon.base),
    ).toEqual([addons[1].base]);
  });

  it("honors hidden rows in a custom Home layout", () => {
    const settings = completeCatalogSettings(catalogChoices(addons), []);
    settings[0].enabled = false;
    expect(
      homeCatalogEntries(addons, settings).map((entry) => entry.addon.base),
    ).toEqual([addons[1].base]);
  });

  it("keeps removed default rows gone while showing newly installed catalogs", () => {
    const choices = catalogChoices(addons);
    const removed = {
      ...completeCatalogSettings(choices, [])[0],
      removed: true,
      enabled: false,
    };
    expect(
      homeCatalogEntries(addons, [removed]).map((entry) => entry.addon.base),
    ).toEqual([addons[1].base]);
    expect(homeCatalogEntries([addons[0]], [removed])).toEqual([]);
  });

  it("does not hide a personal installation when a legacy default catalog is disabled", () => {
    const choices = catalogChoices(addons);
    const legacy = {
      addon_id: "torrentio",
      type: "movie",
      catalog_id: "popular",
      enabled: false,
      order: 0,
      key: "torrentio:movie:popular",
    };
    expect(
      homeCatalogEntries(addons, [legacy]).map((entry) => entry.addon.base),
    ).toEqual([addons[1].base]);
    expect(
      completeCatalogSettings(choices, [legacy]).map((row) => row.enabled),
    ).toEqual([false, true]);
    expect(
      homeCatalogEntries(addons, [
        legacy,
        {
          ...legacy,
          key: choices[1].key,
          enabled: true,
          order: 1,
        },
      ]).map((entry) => entry.addon.base),
    ).toEqual([addons[1].base]);
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
  it("preserves image-only Nuvio folders with hidden blank titles", () => {
    const imported = parseCollections([
      {
        id: "services",
        title: "Streaming Services",
        folders: [
          {
            id: "netflix",
            title: "",
            hideTitle: true,
            coverImageUrl: "https://images.example/netflix-card.png",
            sources: [],
          },
        ],
      },
    ]);

    expect(imported[0].folders[0]).toMatchObject({
      id: "netflix",
      title: "",
      hideTitle: true,
      coverImageUrl: "https://images.example/netflix-card.png",
    });
  });
  it("accepts configured addon URLs and native managed add-on records", () => {
    expect(
      addonUrls(
        "stremio://addon.example/torbox=private/manifest.json\nhttps://second.example/manifest.json\nhttp://192.168.1.50:3000/manifest.json",
      ),
    ).toHaveLength(3);
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
      "Settings backups",
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
  it("ranks quality first and seeders second, excluding anything below 720p", () => {
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
      "2160p",
      "720p",
    ]);
    expect(seeders({ title: "Seeders: 1,200" })).toBe(1200);
  });
  it("autoplay preserves provider order instead of applying hidden quality ranking", () => {
    const noSubs = {
      name: "2160p",
      seeders: 20_000,
      url: "https://cdn.example/4k.mp4",
    };
    const embeddedSubs = {
      name: "1080p MULTI-SUB",
      seeders: 300,
      url: "https://cdn.example/subbed.mp4",
    };
    const suppliedSubs = {
      name: "720p",
      seeders: 800,
      url: "https://cdn.example/source-subs.mp4",
      subtitles: [{ url: "https://subs.example/en.vtt", lang: "eng" }],
    };
    const suppliedSubsLowSeeders = {
      name: "1080p",
      seeders: 10,
      url: "https://cdn.example/source-subs-low.mp4",
      subtitles: [{ url: "https://subs.example/en-2.vtt", lang: "eng" }],
    };
    expect(streamSubtitlePriority(suppliedSubs)).toBe(2);
    expect(streamSubtitlePriority(embeddedSubs)).toBe(3);
    expect(
      autoplayStreams(
        [noSubs, embeddedSubs, suppliedSubsLowSeeders, suppliedSubs],
        false,
      ).map((stream) => stream.url),
    ).toEqual([
      "https://cdn.example/4k.mp4",
      "https://cdn.example/subbed.mp4",
      "https://cdn.example/source-subs-low.mp4",
      "https://cdn.example/source-subs.mp4",
    ]);
  });
  it("uses Nuvio-style regex matching without hiding other manual sources", () => {
    const torrentio = {
      addonName: "Torrentio",
      name: "[TB+] Torrentio 720p",
      seeders: 900,
      url: "https://cdn.example/torrentio-720.mp4",
    };
    const debridio = {
      addonName: "Debridio",
      name: "Debridio cached source",
      title: "Friends 1440p WEB-DL AAC",
      seeders: 40,
      url: "https://cdn.example/debridio-1440.mp4",
    };
    const storage = new Map([
      [
        "tiktak:stream-preferences",
        JSON.stringify({
          maxQuality: 1080,
          maxSizeGb: 0,
          excludedTerms: ["Debridio"],
          codec: "any",
          autoPlayMode: "regex",
          autoPlayRegex: "(?=.*Debridio)(?=.*1440p)",
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    expect(validStreamRegex("(?=.*Debridio)(?=.*1440p)")).toBe(true);
    expect(validStreamRegex("[broken")).toBe(false);
    expect(streamMatchesRegex(debridio, "(?=.*Debridio)(?=.*1440p)")).toBe(
      true,
    );
    // Like Nuvio Mobile Enhanced, an explicit regex controls selection from
    // the full playable candidate list instead of being silently overruled by
    // the smart-mode quality and excluded-term settings.
    expect(autoplayStreams([torrentio, debridio], false)).toEqual([debridio]);
    // The manual chooser is deliberately complete and does not inherit those
    // autoplay limits. Debridio's 1440p source remains visible.
    expect(sourcePickerStreams([torrentio, debridio])).toEqual([
      torrentio,
      debridio,
    ]);
  });
  it("selects a matching Debridio 1440p source when the regex allows it", () => {
    const storage = new Map([
      [
        "tiktak:stream-preferences",
        JSON.stringify({
          maxQuality: 4320,
          maxSizeGb: 0,
          excludedTerms: [],
          codec: "any",
          autoPlayMode: "regex",
          autoPlayRegex: "(?=.*Debridio)(?=.*1440p)",
        }),
      ],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    const torrentio = {
      addonName: "Torrentio",
      name: "720p AAC",
      url: "https://cdn.example/torrentio.mp4",
    };
    const debridio = {
      addonName: "Debridio",
      name: "Cached 1440p AAC",
      url: "https://cdn.example/debridio.mp4",
    };
    expect(autoplayStreams([torrentio, debridio], false)).toEqual([debridio]);
  });
  it("only enables raw torrents when TorBox is connected", () => {
    expect(
      rankedStreams([{ name: "1080p", infoHash: "a".repeat(40) }], false),
    ).toHaveLength(0);
    expect(
      rankedStreams([{ name: "1080p", infoHash: "a".repeat(40) }], true),
    ).toHaveLength(1);
    expect(
      autoplayStreams([{ name: "1080p", infoHash: "a".repeat(40) }], true),
    ).toHaveLength(0);
  });
  it("never autoplays download-to-debrid or malformed resolver results", () => {
    const ready = {
      name: "[TB+] Torrentio 720p",
      title: "Episode \u{1F464} 170 \u{1F4BE} 500 MB",
      url: "https://torrentio.example/resolve/torbox/token/hash/file/0/file.mp4",
    };
    const download = {
      name: "[TB download] Torrentio 1080p",
      title: "Episode \u{1F464} 900 \u{1F4BE} 2 GB",
      url: "https://torrentio.example/resolve/torbox/token/hash/file/0/file.mp4",
    };
    const malformed = {
      name: "[TB+] Torrentio 1080p",
      title: "Episode \u{1F464} 800 \u{1F4BE} 2 GB",
      url: "https://torrentio.example/resolve/torbox/token/hash/file/undefined/file.mp4",
    };
    expect(autoplayStreams([download, malformed, ready], true)).toEqual([
      ready,
    ]);
    expect(seeders(ready)).toBe(170);
  });
  it("recognizes resolved debrid URLs that must use the playback relay", () => {
    expect(
      debridStream({
        name: "[TB+] Torrentio 1080p",
        url: "https://torrentio.example/resolve/torbox/key/hash/file/0/video",
      }),
    ).toBe(true);
    expect(
      debridStream({
        name: "[RD+] Torrentio 1080p",
        url: "https://cdn.example/video.mp4",
      }),
    ).toBe(true);
    expect(
      debridStream({
        name: "Public 1080p",
        url: "https://cdn.example/video.mp4",
      }),
    ).toBe(false);
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
  it("keeps quality and seeder ordering before autoplay removes raw torrents", () => {
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
    expect(rankedStreams([raw, direct], true)[0]).toBe(raw);
    expect(autoplayStreams([raw, direct], true)[0]).toBe(direct);
  });
  it("keeps higher quality ahead of container compatibility", () => {
    const mkv = {
      name: "Provider 1080p",
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
    expect(rankedStreams([mkv, mp4], true)[0]).toBe(mkv);
  });
  it("keeps provider order among equally compatible streams and starts web-ready media first", () => {
    const h264 = {
      name: "[TB+] Torrentio 720p",
      title: "Show.720p.x264 seeders: 170",
      url: "https://cdn.example/resolve",
      behaviorHints: { filename: "Show.S01E01.720p.x264.mkv" },
    };
    const hevc = {
      name: "[TB+] Torrentio 1080p",
      title: "Show.1080p.x265 seeders: 230",
      url: "https://cdn.example/Show.S01E01.x265.mp4",
    };
    const webReady = {
      name: "[TB+] Torrentio 720p",
      title: "Show.720p.x264.AAC seeders: 120",
      url: "https://cdn.example/Show.S01E01.x264.mp4",
    };
    expect(codecCompatibility(h264)).toBe(2);
    expect(codecCompatibility(hevc)).toBe(-2);
    expect(compatibilityPlaybackMode(h264)).toBe("transcode");
    expect(compatibilityPlaybackMode(hevc)).toBe("transcode");
    expect(compatibilityPlaybackMode(webReady)).toBeUndefined();
    expect(rankedStreams([hevc, h264], true)[0]).toBe(hevc);
    expect(autoplayStreams([hevc, h264, webReady], true)[0]).toBe(webReady);
  });
  it("starts browser-safe audio before conversion-only audio", () => {
    const dts = {
      name: "4K DTS-HD",
      title: "Movie.2160p.x264.DTS-HD.MA",
      url: "https://cdn.example/movie.mp4",
    };
    const aac = {
      name: "1080p AAC",
      title: "Movie.1080p.x264.AAC",
      url: "https://cdn.example/movie-aac.mp4",
    };
    const trueHd = {
      name: "1080p TrueHD 7.1",
      url: "https://cdn.example/truehd.mp4",
    };
    expect(streamAudioCodec(dts)).toBe("dts");
    expect(streamAudioCodec(trueHd)).toBe("truehd");
    expect(audioCompatibility(aac)).toBeGreaterThan(audioCompatibility(dts));
    expect(compatibilityPlaybackMode(dts)).toBe("transcode");
    expect(compatibilityPlaybackMode(trueHd)).toBe("transcode");
    expect(autoplayStreams([dts, aac], false)[0]).toBe(aac);
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
    expect(autoplayStreams([download, torrentio], true)[0]).toBe(torrentio);
  });
  it("starts direct MP4 before conversion sources and removes unavailable flagged sources", () => {
    const mkv = { name: "1080p", url: "https://cdn.example/movie.mkv" };
    const webReady = { name: "720p", url: "https://cdn.example/movie.mp4" };
    const flagged = {
      name: "2160p",
      url: "https://cdn.example/movie.mp4",
      behaviorHints: { notWebReady: true },
    };
    expect(autoplayStreams([mkv, flagged, webReady], false)).toEqual([
      webReady,
      mkv,
    ]);
    expect(autoplayStreams([mkv], false)).toEqual([mkv]);
  });
  it("keeps raw torrents in manual source lists only when a debrid resolver is available", () => {
    const raw = {
      name: "Torrent 1080p",
      infoHash: "a".repeat(40),
    };
    const direct = {
      name: "Direct 720p",
      url: "https://cdn.example/movie.mp4",
    };
    expect(sourcePickerStreams([raw, direct])).toEqual([direct]);
    expect(sourcePickerStreams([raw, direct], [], true)).toEqual([
      raw,
      direct,
    ]);
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

describe("independent Real-Debrid playback", () => {
  it("validates a user key and resolves the selected cached file", async () => {
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ username: "friend" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ["a".repeat(40)]: { rd: [{ filename: "cached" }] },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "torrent-1" }), { status: 201 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "torrent-1",
            files: [{ id: 7, path: "/The.Rookie.S01E01.1080p.mkv" }],
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "torrent-1",
            links: ["https://real-debrid.example/restricted"],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ download: "https://cdn.example/rookie.mkv" }),
        ),
      );
    await validateRealDebridKey("friend-key");
    const resolved = await resolveRealDebrid(
      "friend-key",
      { infoHash: "a".repeat(40), name: "1080p" },
      { id: "episode", name: "Pilot", season: 1, episode: 1 },
    );
    expect(resolved).toEqual({
      url: "https://cdn.example/rookie.mkv",
      filename: "/The.Rookie.S01E01.1080p.mkv",
    });
    expect((mock.mock.calls[2][1]?.body as FormData).get("magnet")).toContain(
      "urn:btih:",
    );
    expect((mock.mock.calls[4][1]?.body as FormData).get("files")).toBe("7");
    expect((mock.mock.calls[6][1]?.body as FormData).get("link")).toBe(
      "https://real-debrid.example/restricted",
    );
  });
});

describe("stream manifest compatibility", () => {
  it("labels direct, converted, and unsupported sources clearly", () => {
    expect(
      streamCompatibility({ url: "https://cdn.example/movie.mp4" }).label,
    ).toBe("Direct play");
    expect(
      streamCompatibility({
        url: "https://cdn.example/movie.mkv",
        behaviorHints: { notWebReady: true },
      }).label,
    ).toBe("Conversion required");
    expect(
      streamCompatibility({
        name: "[TB+] Torrentio 1080p",
        title: "Movie.1080p.x265.DTS",
        url: "https://torrentio.example/resolve/torbox/key/hash/file/0/video",
        behaviorHints: { filename: "Movie.1080p.x265.DTS.mkv" },
      }).label,
    ).toBe("Direct play");
    expect(streamCompatibility({ name: "Unavailable" }).label).toBe(
      "Unsupported",
    );
  });

  it("keeps download activity separately for each profile for 30 days", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    vi.stubGlobal("window", new EventTarget());
    localStorage.setItem("tiktak:active-profile-owner", "account-a:1");
    updateDownloadJob({
      id: "job-1",
      name: "Movie.mp4",
      status: "started",
      detail: "Ready",
      at: Date.now(),
    });
    expect(downloadJobs()).toEqual([
      expect.objectContaining({ id: "job-1", status: "started" }),
    ]);
    removeDownloadJob("job-1");
    expect(downloadJobs()).toEqual([]);
    localStorage.setItem("tiktak:active-profile-owner", "account-a:2");
    expect(downloadJobs()).toEqual([]);
    updateDownloadJob({
      id: "job-2",
      name: "Other movie.mp4",
      status: "failed",
      detail: "Source rejected the download.",
      at: Date.now() - 30 * 24 * 60 * 60 * 1_000 - 1,
    });
    expect(downloadJobs()).toEqual([]);
    expect(values.get("nuvio:downloads:account-a:2")).toBe("[]");
  });

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
    expect(result.eligible).toBe(1);
    expect(result.installedStreaming).toBe(1);
    expect(result.streams).toHaveLength(1);
    expect(result.sources).toEqual([
      { name: "Streamer", status: "responded", streams: 1 },
    ]);
    expect(result.streams[0].addonName).toBe("Streamer");
  });

  it("starts every compatible stream provider without queueing later add-ons", async () => {
    const resolvers: ((response: Response) => void)[] = [];
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        }),
    );
    const addons = Array.from({ length: 7 }, (_, index) => ({
      base: `https://provider-${index + 1}.example`,
      manifest: {
        id: `provider-${index + 1}`,
        name: index === 6 ? "Debridio" : `Provider ${index + 1}`,
        resources: [{ name: "stream", types: ["movie"] }],
      },
    }));
    const request = addonStreams(
      addons,
      { id: "tt1", name: "Movie", type: "movie", source: "addon" },
      "tt1",
    );

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("provider-7.example");
    resolvers.forEach((resolve, index) =>
      resolve(
        new Response(
          JSON.stringify({
            streams: [
              {
                name: index === 6 ? "Debridio 4K" : `Stream ${index + 1}`,
                url: `https://cdn.example/${index + 1}.mp4`,
              },
            ],
          }),
        ),
      ),
    );

    const result = await request;
    expect(result.streams).toHaveLength(7);
    expect(result.streams.at(-1)?.addonName).toBe("Debridio");
  });
});
