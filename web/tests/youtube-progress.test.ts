import { describe, expect, it } from "vitest";
import {
  normalizeYouTubeProgress,
  youtubeProgressItem,
  youtubeVideoIdFromItem,
  youtubeVideoIdFromProgressRow,
} from "../src/youtube-progress";

describe("YouTube progress from TV", () => {
  it("recognizes a YouTube ID even when sync labels it as a movie", () => {
    expect(
      youtubeVideoIdFromProgressRow({
        content_id: "youtube:q6IgJuItFlw",
        content_type: "movie",
        video_id: "q6IgJuItFlw",
      }),
    ).toBe("q6IgJuItFlw");
    expect(youtubeVideoIdFromItem({ id: "tt1234567" })).toBeNull();
  });

  it("shows a thumbnail and a readable title instead of a raw ID", () => {
    const item = youtubeProgressItem("q6IgJuItFlw", undefined, []);
    expect(item.name).toBe("YouTube video");
    expect(item.poster).toBe(
      "https://i.ytimg.com/vi/q6IgJuItFlw/hqdefault.jpg",
    );
    expect(youtubeVideoIdFromItem(item)).toBe("q6IgJuItFlw");
  });

  it("uses the browser's known title and thumbnail when available", () => {
    const item = youtubeProgressItem("q6IgJuItFlw", undefined, [
      {
        videoId: "q6IgJuItFlw",
        title: "Example video",
        thumbnail: "https://example.com/thumb.jpg",
      },
    ]);
    expect(item.name).toBe("Example video");
    expect(item.poster).toBe("https://example.com/thumb.jpg");
  });

  it("repairs a previously cached raw-ID card without changing its timestamp", () => {
    const [entry] = normalizeYouTubeProgress(
      [
        {
          item: {
            id: "youtube:q6IgJuItFlw",
            name: "youtube:q6IgJuItFlw",
            type: "movie",
            source: "addon",
          },
          seconds: 47,
          duration: 300,
          at: 123,
        },
      ],
      [],
    );
    expect(entry.item.name).toBe("YouTube video");
    expect(entry.seconds).toBe(47);
    expect(entry.at).toBe(123);
  });
});
