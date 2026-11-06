import { describe, expect, it } from "vitest";
import { closestTitleCorrection } from "../src/smart-search";

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
});
