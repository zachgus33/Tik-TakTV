import { afterEach, describe, expect, it, vi } from "vitest";
import { titleExtras } from "../src/tmdb";
import type { Item } from "../src/types";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubTmdb(responses: Record<string, unknown>) {
  vi.stubGlobal("localStorage", {
    getItem: (name: string) => (name === "nuvio:tmdb-key" ? "test-key" : null),
  });
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/3/", "");
    return new Response(JSON.stringify(responses[path] ?? {}), {
      headers: { "Content-Type": "application/json" },
    });
  });
}

describe("TMDB title guidance", () => {
  it("loads the US movie certification with title extras", async () => {
    stubTmdb({
      "movie/278/recommendations": { results: [] },
      "movie/278/videos": { results: [] },
      "movie/278": {
        production_companies: [{ name: "Castle Rock Entertainment" }],
        release_dates: {
          results: [
            {
              iso_3166_1: "US",
              release_dates: [{ certification: "R" }],
            },
          ],
        },
      },
    });
    const movie: Item = {
      id: "tmdb:278",
      name: "The Shawshank Redemption",
      type: "movie",
      source: "addon",
    };

    await expect(titleExtras(movie)).resolves.toMatchObject({
      certification: "R",
      studios: ["Castle Rock Entertainment"],
    });
  });

  it("loads the US television content rating", async () => {
    stubTmdb({
      "tv/1668/recommendations": { results: [] },
      "tv/1668/videos": { results: [] },
      "tv/1668": {
        production_companies: [],
        content_ratings: {
          results: [{ iso_3166_1: "US", rating: "TV-14" }],
        },
      },
    });
    const series: Item = {
      id: "tmdb:1668",
      name: "Friends",
      type: "series",
      source: "addon",
    };

    await expect(titleExtras(series)).resolves.toMatchObject({
      certification: "TV-14",
    });
  });
});
