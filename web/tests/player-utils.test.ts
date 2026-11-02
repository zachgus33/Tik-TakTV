import { describe, expect, it } from "vitest";
import { runtimeSeconds, shiftWebVtt } from "../src/player-utils";
import { streamAudioLanguages } from "../src/stream-selection";

describe("player timing helpers", () => {
  it("shifts WebVTT cues later and clamps negative timestamps", () => {
    const source =
      "WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nHello\n\n00:05.000 --> 00:06.000\nWorld";
    expect(shiftWebVtt(source, 1.5)).toContain("00:00:02.500 --> 00:00:05.000");
    expect(shiftWebVtt(source, -2)).toContain("00:00:00.000 --> 00:00:01.500");
    expect(shiftWebVtt(source, 1)).toContain("00:06.000 --> 00:07.000");
  });

  it("normalizes common runtime formats", () => {
    expect(runtimeSeconds("46 min")).toBe(2760);
    expect(runtimeSeconds("1h 30m")).toBe(5400);
    expect(runtimeSeconds("01:30:00")).toBe(5400);
    expect(runtimeSeconds("2700")).toBe(2700);
    expect(runtimeSeconds("90")).toBe(5400);
  });
});

describe("stream audio language labels", () => {
  it("uses provider metadata and detects common title labels", () => {
    expect(
      streamAudioLanguages({
        name: "1080p Dual Audio English / Spanish",
        behaviorHints: { audioLanguages: ["Japanese"] },
      }),
    ).toEqual(["Japanese", "English", "Spanish", "Multiple"]);
  });

  it("does not invent a language when the add-on reports none", () => {
    expect(streamAudioLanguages({ name: "1080p WEB-DL" })).toEqual([]);
  });
});
