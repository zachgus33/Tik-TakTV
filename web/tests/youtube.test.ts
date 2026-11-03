import { describe, expect, it } from "vitest";
import { parseYouTubeSelection } from "../src/youtube";

describe("YouTube link parsing", () => {
  it("accepts video, short, music and playlist URLs", () => {
    expect(parseYouTubeSelection("https://youtu.be/dQw4w9WgXcQ")?.videoId).toBe(
      "dQw4w9WgXcQ",
    );
    expect(
      parseYouTubeSelection("https://www.youtube.com/shorts/dQw4w9WgXcQ")
        ?.videoId,
    ).toBe("dQw4w9WgXcQ");
    expect(
      parseYouTubeSelection(
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890",
      ),
    ).toMatchObject({ videoId: "dQw4w9WgXcQ", playlistId: "PL1234567890" });
  });

  it("rejects lookalike hosts and invalid identifiers", () => {
    expect(
      parseYouTubeSelection(
        "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
      ),
    ).toBeNull();
    expect(
      parseYouTubeSelection("https://youtube.com/watch?v=too-short"),
    ).toBeNull();
  });
});
