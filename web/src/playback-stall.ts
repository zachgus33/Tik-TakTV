export const PLAYBACK_STALL_TIMEOUT_MS = 8_000;

export function playbackNeedsRecovery(input: {
  now: number;
  lastAdvanceAt: number;
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  hidden: boolean;
}) {
  return (
    !input.paused &&
    !input.ended &&
    !input.seeking &&
    !input.hidden &&
    input.now - input.lastAdvanceAt >= PLAYBACK_STALL_TIMEOUT_MS
  );
}
