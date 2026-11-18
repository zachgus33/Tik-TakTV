import { describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMIT_FALLBACK_MS,
  AUTH_RATE_LIMIT_MAX_MS,
  authCooldownLabel,
  authErrorMessage,
  authRateLimitDelay,
} from "../src/auth-feedback";

describe("account authentication feedback", () => {
  it("preserves ordinary authentication errors", () => {
    expect(authRateLimitDelay(new Error("Invalid login credentials"))).toBe(0);
    expect(authErrorMessage(new Error("Invalid login credentials"))).toBe(
      "Invalid login credentials",
    );
  });

  it("turns provider throttling into a bounded retry delay", () => {
    const error = new Error("For security purposes, try again in 42 seconds.");
    expect(authRateLimitDelay(error)).toBe(42_000);
    expect(authErrorMessage(error)).toContain("42 seconds");
    expect(authRateLimitDelay(new Error("Too many requests"))).toBe(
      AUTH_RATE_LIMIT_FALLBACK_MS,
    );
  });

  it("renders a stable remaining cooldown", () => {
    expect(authCooldownLabel(15_100, 1_000)).toBe(15);
    expect(authCooldownLabel(1_000, 2_000)).toBe(0);
  });

  it("uses server retry hints without letting an invalid value lock the form", () => {
    expect(authRateLimitDelay({ message: "HTTP 429", retry_after: 7 })).toBe(
      7_000,
    );
    expect(
      authRateLimitDelay({
        message: "Too many requests",
        headers: new Headers({ "retry-after": "30" }),
      }),
    ).toBe(30_000);
    expect(authRateLimitDelay(new Error("Try again in 90 minutes"))).toBe(
      AUTH_RATE_LIMIT_MAX_MS,
    );
  });
});
