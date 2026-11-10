import { describe, expect, it } from "vitest";
import {
  buildSportsEvents,
  classifySport,
  isInactiveSportsSlot,
  prioritizeLiveScoreEvents,
  standaloneScoreEvents,
} from "../src/SportsHub";
import type { ScoreEvent } from "../src/sports-scores";
import { matchScoreToGuideEvent } from "../src/sports-scores";
import type { Item, Programme } from "../src/types";

const channel = (id: string, name: string): Item => ({
  id,
  name,
  type: "live",
  source: "playlist",
  epgId: id,
});

describe("sports guide", () => {
  it("recognizes major sports from programmes and channel context", () => {
    expect(classifySport("Celtics vs Pistons", "NBA TV")).toBe("basketball");
    expect(classifySport("Formula 1 Grand Prix", "ESPN")).toBe("racing");
    expect(classifySport("Evening News", "Local 4")).toBeNull();
    expect(classifySport("News", "Super Tennis 4K")).toBeNull();
    expect(classifySport("Sendepause", "Sky Sport Bundesliga")).toBeNull();
    expect(
      classifySport(
        "Fox 5 News at 10",
        "FOX 5 Atlanta",
        "US local channels",
        "Local news, weather, and sports.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Basketball Wives",
        "VH1",
        "Entertainment",
        "A reality series about relationships.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Jingle Bell Run",
        "Hallmark",
        "Movies",
        "A bookworm is paired with a retired hockey star for a holiday race.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Stranger Than Fiction",
        "FilmBox One",
        "Movies",
        "Emma and Violet are drawn into a strange scheme.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Programmes de la nuit",
        "L'Equipe",
        "France",
        "A suivre, des rediffusions et documentaires. ".repeat(8) +
          "Programme TV Films Series Sports.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Every Sunday Afternoon",
        "NFL RedZone",
        "Sports",
        "Follow every NFL football game live.",
      ),
    ).toBe("football");
    expect(classifySport("Maine Cabin Masters", "Magnolia Network")).toBeNull();
    expect(
      classifySport("Metallica: Masters of Metal", "Fuse Music"),
    ).toBeNull();
    expect(classifySport("The Masters", "CBS Sports")).toBe("golf");
    expect(
      classifySport(
        "The Loud House",
        "Teen Nick",
        "Kids",
        "Lynn wants to win a basketball championship but gets drafted onto a terrible team.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Walker, Texas Ranger",
        "GET TV",
        "Entertainment",
        "Walker creates a midnight basketball league to prevent violence.",
      ),
    ).toBeNull();
    expect(
      classifySport(
        "Center Court",
        "Tennis Channel",
        "Sports",
        "Tennis action from around the world.",
      ),
    ).toBe("tennis");
  });

  it("combines the same event carried on multiple user channels", () => {
    const now = Date.now();
    const channels = [channel("one", "ESPN"), channel("two", "ABC")];
    const programme: Programme = {
      id: "game",
      title: "NBA: Celtics vs Pistons",
      description: "Live game",
      start: now - 10_000,
      end: now + 60_000,
    };
    const events = buildSportsEvents(channels, () => [programme], now);
    expect(events).toHaveLength(1);
    expect(events[0].channels).toHaveLength(2);
    expect(events[0].sport).toBe("basketball");
  });

  it("does not turn ordinary guide entries into sports events", () => {
    const now = Date.now();
    const events = buildSportsEvents(
      [channel("one", "Comedy Central")],
      () => [
        {
          id: "show",
          title: "Family Guy",
          description: "",
          start: now,
          end: now + 60_000,
        },
      ],
      now,
    );
    expect(events).toEqual([]);
  });

  it("filters explicit off-air and no-live-sport slates", () => {
    expect(
      isInactiveSportsSlot(
        "This is Ultra HD",
        "There is no live sport on this channel right now.",
      ),
    ).toBe(true);
    expect(isInactiveSportsSlot("Sendepause")).toBe(true);
    expect(isInactiveSportsSlot("Celtics vs Pistons")).toBe(false);
  });

  it("moves live events with real scores ahead of ordinary sports listings", () => {
    const now = Date.now();
    const events = [
      {
        id: "generic",
        title: "SportsCenter",
        description: "Sports news",
        start: now - 60_000,
        end: now + 60_000,
        sport: "other" as const,
        channels: [channel("news", "Sports Network")],
      },
      {
        id: "game",
        title: "Celtics vs Pistons",
        description: "Live NBA game",
        start: now - 60_000,
        end: now + 60_000,
        sport: "basketball" as const,
        channels: [channel("nba", "NBA TV")],
      },
    ];
    const scores: ScoreEvent[] = [
      {
        id: "nba-game",
        sport: "basketball",
        league: "nba",
        leagueName: "NBA",
        name: "Detroit Pistons at Boston Celtics",
        shortName: "DET @ BOS",
        start: now,
        state: "in",
        detail: "4th · 7:24",
        broadcasts: ["NBA TV"],
        teams: [
          {
            id: "bos",
            name: "Boston Celtics",
            shortName: "Celtics",
            abbreviation: "BOS",
            score: "99",
            home: true,
            winner: true,
          },
          {
            id: "det",
            name: "Detroit Pistons",
            shortName: "Pistons",
            abbreviation: "DET",
            score: "95",
            home: false,
            winner: false,
          },
        ],
      },
    ];

    const result = prioritizeLiveScoreEvents(events, scores, now);
    expect(result.liveScores.map((event) => event.id)).toEqual(["game"]);
    expect(result.remaining.map((event) => event.id)).toEqual(["generic"]);
    expect(result.scoreByEvent.get("game")?.teams[0].score).toBe("99");
  });

  it("shows current scores even when the guide has no matching channel", () => {
    const now = Date.now();
    const score = (
      id: string,
      sport: ScoreEvent["sport"],
      start: number,
      state: ScoreEvent["state"],
    ): ScoreEvent => ({
      id,
      sport,
      league: sport,
      leagueName: sport,
      name: id,
      shortName: id,
      start,
      state,
      detail: "Scheduled",
      broadcasts: [],
      teams: [],
    });
    const scores = [
      score("upcoming", "basketball", now + 60_000, "pre"),
      score("live", "basketball", now - 60_000, "in"),
      score("matched", "basketball", now, "in"),
      score("hockey", "hockey", now, "in"),
      score("old", "basketball", now - 13 * 60 * 60_000, "post"),
    ];

    expect(
      standaloneScoreEvents(
        scores,
        new Set(["matched"]),
        now,
        "basketball",
      ).map((event) => event.id),
    ).toEqual(["live", "upcoming"]);
  });

  it("finds streams when guide titles are generic but league and network match", () => {
    const now = Date.now();
    const espn = channel("espn2", "US| ESPN 2 HD");
    const event = {
      id: "nba-guide",
      title: "Live: NBA Basketball",
      description: "Live game coverage",
      start: now - 30 * 60_000,
      end: now + 2 * 60 * 60_000,
      sport: "basketball" as const,
      channels: [espn],
    };
    const score: ScoreEvent = {
      id: "ind-dal",
      sport: "basketball",
      league: "nba",
      leagueName: "National Basketball Association",
      name: "Indiana Pacers at Dallas Mavericks",
      shortName: "IND @ DAL",
      start: now,
      state: "in",
      detail: "4th",
      broadcasts: ["ESPN 2"],
      teams: [],
    };

    expect(matchScoreToGuideEvent(score, [event])?.channels).toEqual([espn]);
  });
});
