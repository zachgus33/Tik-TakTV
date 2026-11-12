import { describe, expect, it } from "vitest";
import { restoreSavedAddons } from "../src/account-addons";
import { addonResourceUrl, manifestUrl } from "../src/addon-urls";
import type { Addon } from "../src/types";

const addon = (base: string): Addon => ({
  base,
  manifest: { id: base, name: base, resources: ["catalog"] },
});

describe("profile add-on restore", () => {
  it("does not revive add-ons removed from the native account", () => {
    expect(restoreSavedAddons([], [], [addon("https://old.example")])).toEqual([]);
  });

  it("keeps the account enabled state and uses a cached manifest after a refresh failure", () => {
    const saved = addon("https://saved.example/config?token=private");
    const restored = restoreSavedAddons(
      [{ url: manifestUrl(saved.base), enabled: false }],
      [],
      [saved, addon("https://deleted.example")],
    );
    expect(restored).toEqual([{ ...saved, enabled: false }]);
    expect(manifestUrl(saved.base)).toBe("https://saved.example/config/manifest.json?token=private");
  });

  it("matches a root-level manifest to its installed add-on", () => {
    const saved = addon("https://root.example");
    expect(restoreSavedAddons(
      [{ url: "https://root.example/manifest.json", enabled: true }],
      [saved],
    )).toEqual([{ ...saved, enabled: true }]);
  });

  it("keeps configured query parameters after each resource path", () => {
    const base = "https://source.example/config?token=private";
    expect(addonResourceUrl(base, "stream", "series", "tt123:1:2"))
      .toBe("https://source.example/config/stream/series/tt123%3A1%3A2.json?token=private");
    expect(addonResourceUrl(base, "catalog", "movie", "popular", "search=Star%20Wars"))
      .toBe("https://source.example/config/catalog/movie/popular/search=Star%20Wars.json?token=private");
    expect(addonResourceUrl(base, "meta", "movie", "tt123"))
      .toBe("https://source.example/config/meta/movie/tt123.json?token=private");
    expect(addonResourceUrl(base, "subtitles", "movie", "tt123"))
      .toBe("https://source.example/config/subtitles/movie/tt123.json?token=private");
  });
});
