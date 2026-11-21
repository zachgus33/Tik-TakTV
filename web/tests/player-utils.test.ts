import { describe, expect, it } from "vitest";
import {
  cleanSubtitleText,
  normalizeWebVtt,
  runtimeSeconds,
  hlsErrorTargetsSubtitles,
  parseWebVttCues,
  shiftWebVtt,
  subtitleLanguageName,
  subtitlePickerName,
  subtitleToWebVtt,
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

  it("uses readable language names when providers return generic labels", () => {
    expect(subtitleLanguageName("eng")).toBe("English");
    expect(subtitleLanguageName("es-MX")).toBe("Spanish");
    expect(subtitlePickerName("Addon", "eng")).toBe("English");
    expect(subtitlePickerName("1953559797", "spa")).toBe("Spanish");
    expect(subtitlePickerName("Forced", "eng")).toBe("English · Forced");
  });

  it("distinguishes subtitle failures from video-stream HLS failures", () => {
    expect(
      hlsErrorTargetsSubtitles({ details: "subtitleTrackLoadError" }),
    ).toBe(true);
    expect(
      hlsErrorTargetsSubtitles({
        details: "fragLoadError",
        frag: { type: "subtitle" },
      }),
    ).toBe(true);
    expect(hlsErrorTargetsSubtitles({ details: "fragLoadError" })).toBe(false);
  });

  it("normalizes SRT, ASS and TTML through the same mobile-style cue pipeline", () => {
    const srt = subtitleToWebVtt(
      "1\n00:00:01,000 --> 00:00:02,500\nSRT line",
      "captions.srt",
    );
    const ass = subtitleToWebVtt(
      "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:03.00,0:00:05.00,Default,,0,0,0,,{\\i1}ASS line{\\i0}",
      "captions.ass",
    );
    const ttml = subtitleToWebVtt(
      '<tt><body><p begin="6s" end="8.5s">TTML<br/>line</p></body></tt>',
      "captions.ttml",
    );
    expect(parseWebVttCues(srt)).toEqual([
      { startTime: 1, endTime: 2.5, text: "SRT line" },
    ]);
    expect(parseWebVttCues(ass)).toEqual([
      { startTime: 3, endTime: 5, text: "ASS line" },
    ]);
    expect(parseWebVttCues(ttml)).toEqual([
      { startTime: 6, endTime: 8.5, text: "TTML\nline" },
    ]);
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
