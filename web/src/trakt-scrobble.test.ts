import { describe, expect, it } from "vitest";
import { scrobbleContent } from "./trakt-scrobble";
import type { Item } from "./types";

const movie: Item = { id: "tt0111161", name: "The Shawshank Redemption", type: "movie", source: "addon" };

describe("Trakt scrobble content", () => {
  it("uses stable movie IDs rather than fuzzy title matching", () => {
    expect(scrobbleContent(movie)).toEqual({ movie: { ids: { imdb: "tt0111161" } } });
    expect(scrobbleContent({ ...movie, id: "tmdb:278" })).toEqual({ movie: { ids: { tmdb: 278 } } });
    expect(scrobbleContent({ ...movie, id: "custom:unmatched" })).toBeNull();
  });

  it("requires an episode and excludes live TV", () => {
    expect(scrobbleContent({ ...movie, type: "series" })).toBeNull();
    expect(scrobbleContent({ ...movie, type: "series" }, { id: "episode", name: "Pilot", season: 1, episode: 1 }))
      .toEqual({ show: { ids: { imdb: "tt0111161" } }, episode: { season: 1, number: 1 } });
    expect(scrobbleContent({ ...movie, type: "live" })).toBeNull();
  });
});
