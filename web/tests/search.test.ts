import { describe, expect, it } from "vitest";
import {
  closestTitleCorrection,
  correctionSearchProbes,
} from "../src/smart-search";

describe("smart title spelling", () => {
  it("corrects a close misspelling without changing the number of words", () => {
    expect(
      closestTitleCorrection("madame secretary", [
        "Madam Secretary",
        "Madame Web",
      ]),
    ).toBe("Madam Secretary");
    expect(
      closestTitleCorrection("madame secretery", ["Madam Secretary"]),
    ).toBe("Madam Secretary");
  });

  it("does not turn a broad search into a longer title", () => {
    expect(
      closestTitleCorrection("office", ["The Office", "Office Space"]),
    ).toBe("");
  });

  it("does not reinterpret a meaningfully different one-word title", () => {
    expect(closestTitleCorrection("batman", ["Batwoman"])).toBe("");
  });

  it("handles multiple mistakes and omitted connecting words", () => {
    expect(closestTitleCorrection("madm secretery", ["Madam Secretary"])).toBe(
      "Madam Secretary",
    );
    expect(closestTitleCorrection("oppenhiemer", ["Oppenheimer"])).toBe(
      "Oppenheimer",
    );
    expect(closestTitleCorrection("game thrones", ["Game of Thrones"])).toBe(
      "Game of Thrones",
    );
  });

  it("creates bounded title-service probes for unknown spellings", () => {
    expect(correctionSearchProbes("madm secretery")).toEqual([
      "secretery",
      "secre",
      "madm",
    ]);
  });
});
