export const AUTH_RATE_LIMIT_FALLBACK_MS = 60_000;

function textOf(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function authRateLimitDelay(error: unknown) {
  const text = textOf(error);
  if (!/rate.?limit|too many requests|try again (?:in|after)|security purposes/i.test(text))
    return 0;
  const seconds = /(?:in|after)\s+(\d+)\s*(?:seconds?|secs?|s)\b/i.exec(text)?.[1];
  return seconds
    ? Math.max(1_000, Number(seconds) * 1_000)
    : AUTH_RATE_LIMIT_FALLBACK_MS;
}

export function authErrorMessage(error: unknown) {
  const text = textOf(error).trim();
  const delay = authRateLimitDelay(error);
  if (!delay) return text || "Could not complete sign-in. Please try again.";
  const seconds = Math.ceil(delay / 1_000);
  return `Sign-in is temporarily rate limited. Please wait ${seconds} second${seconds === 1 ? "" : "s"} before trying again.`;
}

export function authCooldownLabel(until: number, now = Date.now()) {
  const remaining = Math.max(0, until - now);
  return Math.ceil(remaining / 1_000);
}
