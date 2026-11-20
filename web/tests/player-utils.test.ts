import { describe, expect, it } from "vitest";
import {
  cleanSubtitleText,
  normalizeWebVtt,
  runtimeSeconds,
  parseWebVttCues,
  shiftWebVtt,
} from "../src/player-utils";
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

  it("parses subtitle lines for TV-style synchronization", () => {
    expect(
      parseWebVttCues(
        "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello there\n\n00:04.500 --> 00:05.500\nGeneral <i>Kenobi</i>",
      ),
    ).toEqual([
      { startTime: 1, endTime: 3, text: "Hello there" },
      { startTime: 4.5, endTime: 5.5, text: "General Kenobi" },
    ]);
  });

  it("normalizes generated captions for centered single-line PWA playback", () => {
    const normalized = normalizeWebVtt(
      "WEBVTT\n\n00:00:01.000 --> 00:00:08.000 line:20% position:95% align:end\nTranscribed: Hello there\n\n00:00:03.000 --> 00:00:05.000\nGeneral Kenobi",
    );
    expect(normalized).not.toContain("Transcribed:");
    expect(normalized).not.toContain("position:");
    expect(normalized).not.toContain("align:end");
    expect(normalized).toContain("00:00:01.000 --> 00:00:02.960");
    expect(parseWebVttCues(normalized)).toEqual([
      { startTime: 1, endTime: 2.96, text: "Hello there" },
      { startTime: 3, endTime: 5, text: "General Kenobi" },
    ]);
  });

  it("caps stale generated cues so old dialogue fades before piling up", () => {
    const normalized = normalizeWebVtt(
      "WEBVTT\n\n00:00:10.000 --> 00:00:40.000\nA generated caption that lasts too long",
    );
    expect(normalized).toContain("00:00:10.000 --> 00:00:16.000");
  });

  it("cleans embedded-style timestamp tags and transcription labels", () => {
    expect(
      cleanSubtitleText(
        "<00:01:02.300><c.green>Transcribed: &quot;Centered&nbsp;text&quot;</c>",
      ),
    ).toBe('"Centered text"');
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
