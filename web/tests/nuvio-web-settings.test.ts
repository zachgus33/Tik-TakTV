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

  it("keeps the native subtitle and brightness defaults", () => {
    const settings = normalizeNuvioWebSettings({});
    expect(settings.rememberPlayerBrightness).toBe(true);
    expect(settings.useForcedSubtitles).toBe(true);
    expect(settings.showOnlyPreferredSubtitles).toBe(false);
    expect(settings.subtitleBold).toBe(false);
    expect(settings.subtitleOutline).toBe(true);
  });

  it("normalizes persisted subtitle rendering choices", () => {
    const settings = normalizeNuvioWebSettings({
      ...defaultNuvioWebSettings,
      subtitleTextColor: "#fff176",
      subtitleBackgroundColor: "#102033",
      subtitleOutlineColor: "not-a-color",
      subtitleBold: true,
      showOnlyPreferredSubtitles: true,
    });
    expect(settings.subtitleTextColor).toBe("#fff176");
    expect(settings.subtitleBackgroundColor).toBe("#102033");
    expect(settings.subtitleOutlineColor).toBe("#000000");
    expect(settings.subtitleBold).toBe(true);
    expect(settings.showOnlyPreferredSubtitles).toBe(true);
  });
});
