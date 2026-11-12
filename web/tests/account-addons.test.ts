import { describe, expect, it } from "vitest";
import { manifestUrl, restoreSavedAddons } from "../src/account-addons";
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
});
