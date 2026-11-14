import { beforeEach, describe, expect, it, vi } from "vitest";
import { traktCollection } from "../src/trakt-collections";

vi.mock("../src/TraktSettings", () => ({
  traktClientId: "test-client",
  traktAccessToken: vi.fn(async () => "profile-token"),
}));

describe("custom Trakt collection sources", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("loads movies from the selected list with the signed-in profile", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify([
      { movie: { title: "Example", year: 2024, ids: { imdb: "tt1234567", tmdb: 123 }, overview: "A film" } },
    ]), { status: 200 }));
    const items = await traktCollection({ provider: "trakt", traktListId: 123, mediaType: "movie", sortBy: "rank", sortHow: "asc" }, "Zach");
    expect(items).toMatchObject([{ id: "tt1234567", name: "Example", type: "movie", description: "A film" }]);
    expect(fetchMock.mock.calls[0][0]).toContain("/lists/123/items/movies?");
    expect((fetchMock.mock.calls[0][1]?.headers as Record<string, string>).Authorization).toBe("Bearer profile-token");
  });

  it("loads shows and reports private lists clearly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([
      { show: { title: "Series", ids: { tmdb: 456 } } },
    ]), { status: 200 })).mockResolvedValueOnce(new Response("", { status: 404 })).mockResolvedValueOnce(new Response("", { status: 404 }));
    const source = { provider: "trakt", traktListId: 456, mediaType: "tv" };
    expect(await traktCollection(source, "Zach")).toMatchObject([{ id: "tmdb:456", type: "series" }]);
    await expect(traktCollection(source, "Zach")).rejects.toThrow("unavailable or private");
  });

  it("falls back to an owner's private list and loads all reported pages", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ movie: { title: "First", ids: { imdb: "tt1111111" } } }]), { status: 200, headers: { "x-pagination-page-count": "2" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ movie: { title: "Second", ids: { imdb: "tt2222222" } } }]), { status: 200, headers: { "x-pagination-page-count": "2" } }));
    const items = await traktCollection({ provider: "trakt", traktListId: 789 }, "Zach");
    expect(items.map((item) => item.name)).toEqual(["First", "Second"]);
    expect(fetchMock.mock.calls[1][0]).toContain("/users/me/lists/789/items/movies?");
    expect(fetchMock.mock.calls[2][0]).toContain("page=2");
  });
});
