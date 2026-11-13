import { describe, expect, it } from "vitest";
import {
  closestTitleCorrection,
  correctionSearchProbes,
  hasRelevantTitle,
  normalizeSearchText,
  rankExactTitleFirst,
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

  it("places the interpreted exact title above related results", () => {
    expect(
      rankExactTitleFirst(
        [{ name: "Aegon's Conquest" }, { name: "Game of Thrones" }],
        "Game of Thrones",
      ).map((item) => item.name),
    ).toEqual(["Game of Thrones", "Aegon's Conquest"]);
  });

  it("keeps Arabic searches and ranks matching Arabic titles first", () => {
    expect(normalizeSearchText("أفلام عربية")).toBe("افلام عربية");
    expect(hasRelevantTitle("أفلام", ["أفضل أفلام عربية"])).toBe(true);
    expect(rankExactTitleFirst(
      [{ name: "Other movie" }, { name: "أفلام عربية" }],
      "أفلام عربية",
    )[0].name).toBe("أفلام عربية");
  });
});
