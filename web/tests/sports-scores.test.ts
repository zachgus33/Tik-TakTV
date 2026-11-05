import { describe, expect, it } from "vitest";
import { matchScore, parseScoreboard } from "../src/sports-scores";

const raw = {
  leagues: [{ name: "National Basketball Association", slug: "nba" }],
  events: [
    {
      id: "401",
      name: "Boston Celtics at Detroit Pistons",
      shortName: "BOS @ DET",
      date: "2026-11-05T00:00:00Z",
      status: {
        period: 4,
        displayClock: "7:24",
        type: { state: "in", shortDetail: "4th - 7:24" },
      },
      competitions: [
        {
          venue: { fullName: "Little Caesars Arena" },
          broadcasts: [{ names: ["NBC"] }],
          competitors: [
            {
              homeAway: "away",
              score: "99",
              team: {
                id: "2",
                displayName: "Boston Celtics",
                shortDisplayName: "Celtics",
                abbreviation: "BOS",
                logo: "https://example.com/bos.png",
              },
            },
            {
              homeAway: "home",
              score: "95",
              team: {
                id: "8",
                displayName: "Detroit Pistons",
                shortDisplayName: "Pistons",
                abbreviation: "DET",
              },
            },
          ],
        },
      ],
    },
  ],
};

describe("sports score enrichment", () => {
  it("parses teams, live state, venue and broadcasts", () => {
    const [event] = parseScoreboard(raw, "basketball", "NBA");
    expect(event).toMatchObject({
      state: "in",
      detail: "4th - 7:24",
      venue: "Little Caesars Arena",
      broadcasts: ["NBC"],
    });
    expect(event.teams.map((team) => team.score)).toEqual(["99", "95"]);
  });

  it("matches a guide game to the corresponding scoreboard event", () => {
    const scores = parseScoreboard(raw, "basketball", "NBA");
    const match = matchScore(
      {
        id: "guide",
        title: "Live NBA: Celtics vs Pistons",
        description: "",
        start: Date.parse("2026-11-05T00:05:00Z"),
        end: Date.parse("2026-11-05T03:00:00Z"),
        sport: "basketball",
        channels: [],
      },
      scores,
    );
    expect(match?.id).toBe("401");
  });

  it("matches a generic guide title when the venue identifies the game", () => {
    const scores = parseScoreboard(raw, "basketball", "NBA");
    const match = matchScore(
      {
        id: "guide-venue",
        title: "Live: NBA Basketball",
        description: "Live from Little Caesars Arena.",
        start: Date.parse("2026-11-05T00:05:00Z"),
        end: Date.parse("2026-11-05T03:00:00Z"),
        sport: "basketball",
        channels: [],
      },
      scores,
    );
    expect(match?.id).toBe("401");
  });
});
