import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSkipSegmentCache,
  introDbSkipSegments,
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
});
