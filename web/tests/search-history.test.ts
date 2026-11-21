import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearch,
  removeSearch,
} from "../src/search-history";

afterEach(() => vi.unstubAllGlobals());

describe("profile search history", () => {
  it("keeps ten recent searches isolated by profile", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    for (let index = 0; index < 12; index += 1)
      recordSearch("Jay", `Movie ${index}`);
    recordSearch("Jay", "Movie 8");
    recordSearch("Guest", "Different title");
    expect(readSearchHistory("Jay")).toHaveLength(10);
    expect(readSearchHistory("Jay")[0]).toBe("Movie 8");
    expect(readSearchHistory("Guest")).toEqual(["Different title"]);
    expect(removeSearch("Jay", "Movie 8")).not.toContain("Movie 8");
    expect(clearSearchHistory("Jay")).toEqual([]);
  });
});
