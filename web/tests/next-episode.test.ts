import { describe, expect, it } from "vitest";
import { findNextEpisode } from "../src/next-episode";
import type { Episode } from "../src/types";

const episodes: Episode[] = [
  { id: "s2e1", name: "New season", season: 2, episode: 1 },
  { id: "s1e2", name: "Second", season: 1, episode: 2 },
  { id: "s1e1", name: "Pilot", season: 1, episode: 1 },
];

describe("findNextEpisode", () => {
  it("uses the actual episode list across season boundaries", () => {
    expect(findNextEpisode(episodes, episodes[1])?.id).toBe("s2e1");
    expect(findNextEpisode(episodes, episodes[2])?.id).toBe("s1e2");
  });

  it("does not guess an episode when the current one is absent or last", () => {
    expect(findNextEpisode(episodes, episodes[0])).toBeNull();
    expect(findNextEpisode(episodes, { id: "missing", name: "", season: 1, episode: 1 })).toBeNull();
  });
});
