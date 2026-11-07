import { describe, expect, it } from "vitest";
import { hasProductionAppRoot } from "./production-smoke-root.mjs";

describe("production app root detection", () => {
  it("accepts the original empty app root", () => {
    expect(hasProductionAppRoot('<div id="root"></div>')).toBe(true);
  });

  it("accepts the accessible loading fallback inside the app root", () => {
    expect(
      hasProductionAppRoot(`
        <div id="root">
          <main>Loading TikTak TV&hellip;</main>
        </div>
      `),
    ).toBe(true);
  });

  it("rejects pages without the TikTak TV app root", () => {
    expect(hasProductionAppRoot('<div id="root-cause"></div>')).toBe(false);
    expect(hasProductionAppRoot("<main>Service unavailable</main>")).toBe(false);
  });
});
