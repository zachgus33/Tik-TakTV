import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultNuvioWebSettings,
  normalizeNuvioWebSettings,
  readNuvioWebSettings,
  saveNuvioWebSettings,
} from "../src/nuvio-web-settings";

afterEach(() => vi.unstubAllGlobals());

describe("Nuvio web experience settings", () => {
  it("normalizes imported profile settings without losing web defaults", () => {
    expect(
      normalizeNuvioWebSettings({
        heroMode: "cinematic",
        subtitleSize: 999,
        touchGestures: false,
        posterCornerRadius: 99,
        continueWatchingStyle: "wide",
        continueWatchingSort: "split-upcoming",
      }),
    ).toMatchObject({
      heroMode: "cinematic",
      subtitleSize: 180,
      touchGestures: false,
      posterCornerRadius: 32,
      continueWatchingStyle: "wide",
      continueWatchingSort: "split-upcoming",
      liveTvEnabled: true,
      posterSize: defaultNuvioWebSettings.posterSize,
    });
  });

  it("persists a complete profile-owned experience payload", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const saved = saveNuvioWebSettings({
      ...defaultNuvioWebSettings,
      navigationStyle: "rail",
      heroMode: "info-rich",
      preferredAudioLanguage: "en",
      posterCornerRadius: 24,
      hidePosterLabels: true,
      continueWatchingStyle: "poster",
      continueWatchingSort: "streaming",
      updatedAt: 42,
    });
    expect(readNuvioWebSettings()).toEqual(saved);
    expect(saved).toMatchObject({
      navigationStyle: "rail",
      heroMode: "info-rich",
      preferredAudioLanguage: "en",
      posterCornerRadius: 24,
      hidePosterLabels: true,
      continueWatchingStyle: "poster",
      continueWatchingSort: "streaming",
      updatedAt: 42,
    });
  });
});
