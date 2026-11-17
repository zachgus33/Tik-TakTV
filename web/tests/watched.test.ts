import { beforeEach, describe, expect, it, vi } from "vitest";
import { storeProgress } from "../src/storage";
import {
  isEpisodeWatched,
  isWatched,
  markWatched,
  unmarkWatched,
} from "../src/watched";
import type { Episode, Item } from "../src/types";

const item: Item = {
  id: "tt0108778",
  name: "Friends",
  type: "series",
  source: "addon",
  provider: "https://v3-cinemeta.strem.io",
};
const episode = (number: number): Episode => ({
  id: `tt0108778:1:${number}`,
  name: `Episode ${number}`,
  season: 1,
  episode: number,
});

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal("sessionStorage", memoryStorage());
});

describe("watched markers", () => {
  it("tracks episodes independently and can unmark one", () => {
    const watched = markWatched([], item, episode(1), 100);
    expect(isWatched(watched, item, episode(1))).toBe(true);
    expect(isWatched(watched, item, episode(2))).toBe(false);
    expect(
      isWatched(unmarkWatched(watched, item, episode(1)), item, episode(1)),
    ).toBe(false);
  });

  it("recognizes episodes before an older resume point as watched", () => {
    expect(isEpisodeWatched([], item, episode(1), episode(3))).toBe(true);
    expect(isEpisodeWatched([], item, episode(2), episode(3))).toBe(true);
    expect(isEpisodeWatched([], item, episode(3), episode(3))).toBe(false);
  });

  it("moves completed playback out of resume history and into watched history", () => {
    storeProgress(item, 1_746, 1_800, episode(1));
    expect(JSON.parse(localStorage.getItem("nuvio:progress") ?? "[]")).toEqual(
      [],
    );
    expect(
      JSON.parse(localStorage.getItem("nuvio:watched") ?? "[]"),
    ).toMatchObject([
      { id: item.id, season: 1, episode: 1, watchedAt: expect.any(Number) },
    ]);
  });
});
