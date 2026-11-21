import { afterEach, describe, expect, it, vi } from "vitest";
import {
  dueEpisodeReminders,
  notifyDueEpisodes,
} from "../src/episode-notifications";
import type { Progress } from "../src/types";

afterEach(() => vi.unstubAllGlobals());

function episodeProgress(
  id: string,
  released: string,
  episode = 1,
): Progress {
  return {
    item: {
      id: `tt-${id}`,
      name: `Show ${id}`,
      type: "series",
      source: "addon",
    },
    episode: {
      id,
      name: `Episode ${episode}`,
      season: 2,
      episode,
      released,
    },
    seconds: 0,
    duration: 1800,
    at: 1,
  };
}

describe("episode release reminders", () => {
  it("returns reminders that reached their configured lead time", () => {
    const now = new Date("2026-11-21T12:00:00Z").valueOf();
    const progress = [
      episodeProgress("due", "2026-11-21T12:30:00Z"),
      episodeProgress("later", "2026-11-21T13:00:00Z", 2),
    ];
    expect(dueEpisodeReminders(progress, 30, now)).toMatchObject([
      { key: expect.stringContaining("due"), title: "Show due is ready" },
    ]);
  });

  it("deduplicates delivered reminders and ignores stale releases", () => {
    const now = new Date("2026-11-21T12:00:00Z").valueOf();
    const due = episodeProgress("due", "2026-11-21T12:00:00Z");
    const stale = episodeProgress("stale", "2026-11-18T12:00:00Z");
    const key = `${due.item.id}:${due.episode!.id}:${due.episode!.released}`;
    expect(
      dueEpisodeReminders([due, stale], 0, now, new Set([key])),
    ).toEqual([]);
  });

  it("delivers through the PWA service worker once per profile", async () => {
    const now = new Date().toISOString();
    const progress = [episodeProgress("service-worker", now)];
    const values = new Map<string, string>();
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const NotificationMock = Object.assign(vi.fn(), {
      permission: "granted",
    });
    vi.stubGlobal("Notification", NotificationMock);
    vi.stubGlobal("window", { Notification: NotificationMock });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        ready: Promise.resolve({ showNotification }),
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });

    await expect(notifyDueEpisodes(progress, 0, "Zach")).resolves.toBe(1);
    await expect(notifyDueEpisodes(progress, 0, "Zach")).resolves.toBe(0);
    expect(showNotification).toHaveBeenCalledTimes(1);
    expect(showNotification).toHaveBeenCalledWith(
      "Show service-worker is ready",
      expect.objectContaining({ tag: expect.stringContaining("service-worker") }),
    );
  });
});
