import { describe, expect, it } from "vitest";
import { anilistMediaRef } from "../src/anilist-tracking";
import { simklScrobbleContent } from "../src/simkl-scrobble";
import type { Item } from "../src/types";

const title = (id: string, type: Item["type"] = "series"): Item => ({
  id, name: "Example", type, source: "addon",
});

describe("external tracker ID safety", () => {
  it("uses only explicit AniList or MAL IDs for anime account writes", () => {
    expect(anilistMediaRef("anilist:1")).toEqual({ id: 1 });
    expect(anilistMediaRef("mal:5114")).toEqual({ idMal: 5114 });
    expect(anilistMediaRef("tt1234567")).toBeNull();
    expect(anilistMediaRef("my-anime-title")).toBeNull();
  });

  it("requires a Simkl-compatible media ID and episode before scrobbling", () => {
    expect(simklScrobbleContent(title("tt1234567"))).toBeNull();
    expect(simklScrobbleContent(title("random", "movie"))).toBeNull();
    expect(simklScrobbleContent(title("tt1234567"), { id: "1", name: "Pilot", season: 1, episode: 1 }))
      .toEqual({ show: { title: "Example", ids: { imdb: "tt1234567" } },
        episode: { season: 1, number: 1 } });
  });
});
