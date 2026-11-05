import { describe, expect, it } from "vitest";
import {
  buildSportsEvents,
  classifySport,
  isInactiveSportsSlot,
} from "../src/SportsHub";
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
});
