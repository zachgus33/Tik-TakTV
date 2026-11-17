import { describe, expect, it } from "vitest";
import {
  PLAYBACK_STALL_TIMEOUT_MS,
  playbackNeedsRecovery,
} from "../src/playback-stall";

const state = {
  now: PLAYBACK_STALL_TIMEOUT_MS,
  lastAdvanceAt: 0,
  paused: false,
  ended: false,
  seeking: false,
  hidden: false,
};

describe("playback stall recovery", () => {
  it("recovers an active video whose clock stopped advancing", () => {
    expect(playbackNeedsRecovery(state)).toBe(true);
  });

  it("does not interfere with pauses, seeking, hidden tabs, or normal progress", () => {
    expect(playbackNeedsRecovery({ ...state, paused: true })).toBe(false);
    expect(playbackNeedsRecovery({ ...state, seeking: true })).toBe(false);
    expect(playbackNeedsRecovery({ ...state, hidden: true })).toBe(false);
    expect(playbackNeedsRecovery({ ...state, lastAdvanceAt: 1 })).toBe(false);
  });
});
