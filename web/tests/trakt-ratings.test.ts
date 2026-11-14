import { describe, expect, it, vi } from "vitest";
import { getTraktRating, setTraktRating, traktRatingIds } from "../src/trakt-ratings";
import type { Item } from "../src/types";

const movie: Item = { id: "tt0111161", name: "Shawshank", type: "movie", source: "addon" };
const storage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
});
storage.set("tiktak:trakt:Test", JSON.stringify({
  access_token: "viewer-token", refresh_token: "refresh", created_at: Date.now() / 1000, expires_in: 3600,
}));

describe("personal Trakt ratings", () => {
  it("uses stable IDs and rejects unrelated add-on IDs", () => {
    expect(traktRatingIds(movie.id)).toEqual({ imdb: "tt0111161" });
    expect(traktRatingIds("tmdb:278")).toEqual({ tmdb: 278 });
    expect(traktRatingIds("custom:278")).toBeNull();
  });

  it("reads and writes the connected viewer's rating", async () => {
    const requests: Array<{ url: string; body?: string; authorization: string | null }> = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      requests.push({ url, body: options?.body as string | undefined,
        authorization: new Headers(options?.headers).get("Authorization") });
      return new Response(options?.body
        ? JSON.stringify({ added: { movies: 1 } })
        : JSON.stringify([{ rating: 8, movie: { ids: { imdb: movie.id } } }]),
        { status: 200 });
    }));
    expect(await getTraktRating("Test", movie)).toBe(8);
    await setTraktRating("Test", movie, 9);
    expect(requests[0].authorization).toBe("Bearer viewer-token");
    expect(requests[1].url).toContain("/sync/ratings");
    expect(JSON.parse(requests[1].body!)).toEqual({ movies: [{ ids: { imdb: movie.id }, rating: 9 }] });
  });
});
