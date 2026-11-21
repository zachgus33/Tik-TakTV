import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSkipSegmentCache,
  introDbSkipSegments,
  skipSegments,
  submitIntroDbSegment,
} from "../src/skip-segments";

afterEach(() => {
  clearSkipSegmentCache();
  vi.unstubAllGlobals();
});

describe("IntroDB skip segments", () => {
  it("normalizes second and millisecond timing fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          intro: { start_sec: 12, end_sec: 88 },
          recap: { start_ms: 1_000, end_ms: 9_500 },
          outro: { start_sec: 1_200, end_sec: 1_260 },
        }),
      ),
    );
    await expect(introDbSkipSegments("tt1234567", 2, 4)).resolves.toEqual([
      { startTime: 12, endTime: 88, type: "intro", provider: "introdb" },
      { startTime: 1, endTime: 9.5, type: "recap", provider: "introdb" },
      {
        startTime: 1_200,
        endTime: 1_260,
        type: "outro",
        provider: "introdb",
      },
    ]);
  });

  it("does not query non-IMDb titles or invalid episodes", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(introDbSkipSegments("mal:123", 1, 1)).resolves.toEqual([]);
    await expect(introDbSkipSegments("tt1234567", 1, 0)).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("merges IntroDB, Anime-Skip and AniSkip by native provider priority", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        const url = request.url;
        if (url.includes("api.simkl.com/search/id"))
          return Response.json([{ type: "anime", ids: { simkl: 99 } }]);
        if (url.includes("api.simkl.com/anime/99"))
          return Response.json({ ids: { mal: 123, anilist: 456 } });
        if (url.includes("api.introdb.app/segments"))
          return Response.json({ intro: { start_sec: 10, end_sec: 80 } });
        if (url.includes("api.aniskip.com"))
          return Response.json({
            found: true,
            results: [
              {
                skipType: "op",
                interval: { startTime: 5, endTime: 70 },
              },
              {
                skipType: "ed",
                interval: { startTime: 1_200, endTime: 1_260 },
              },
            ],
          });
        if (url.includes("api.anime-skip.com/graphql")) {
          const body = JSON.parse(await request.text()) as { query: string };
          return body.query.includes("findShowsByExternalId")
            ? Response.json({
                data: { findShowsByExternalId: [{ id: "show-1" }] },
              })
            : Response.json({
                data: {
                  findEpisodesByShowId: [
                    {
                      season: "1",
                      number: "2",
                      timestamps: [
                        { at: 0, type: { name: "Recap" } },
                        { at: 25, type: { name: "Intro" } },
                        { at: 90, type: { name: "Credits" } },
                      ],
                    },
                  ],
                },
              });
        }
        return new Response(null, { status: 404 });
      }),
    );
    await expect(
      skipSegments("tt1234567", 1, 2, {
        animeSkipEnabled: true,
        animeSkipClientId: "client",
      }),
    ).resolves.toEqual([
      { startTime: 0, endTime: 25, type: "recap", provider: "anime-skip" },
      { startTime: 10, endTime: 80, type: "intro", provider: "introdb" },
      {
        startTime: 90,
        endTime: Number.MAX_SAFE_INTEGER,
        type: "outro",
        provider: "anime-skip",
      },
    ]);
  });

  it("submits IntroDB timing using the native payload", async () => {
    const requests: Request[] = [];
    const fetch = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return new Response(null, { status: 201 });
      },
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      submitIntroDbSegment("tt7654321", 3, 7, 12.5, 87, "intro", "secret"),
    ).resolves.toBe(true);
    const request = requests[0];
    expect(request.url).toBe("https://api.introdb.app/submit");
    expect(request.headers.get("authorization")).toBe("Bearer secret");
    await expect(request.json()).resolves.toMatchObject({
      imdb_id: "tt7654321",
      season: 3,
      episode: 7,
      start_sec: 12.5,
      end_sec: 87,
      start_ms: 12_500,
      end_ms: 87_000,
      segment_type: "intro",
    });
  });
});
