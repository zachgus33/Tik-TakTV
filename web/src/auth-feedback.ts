export const AUTH_RATE_LIMIT_FALLBACK_MS = 60_000;
export const AUTH_RATE_LIMIT_MAX_MS = 15 * 60_000;

function textOf(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function retryDelayFrom(error: unknown) {
  if (!error || typeof error !== "object") return 0;
  const value = error as Record<string, unknown>;
  const retryAfter = value.retry_after ?? value.retryAfter;
  if (typeof retryAfter === "number" && Number.isFinite(retryAfter))
    return retryAfter * 1_000;
  if (typeof retryAfter === "string" && /^\d+(?:\.\d+)?$/.test(retryAfter))
    return Number(retryAfter) * 1_000;
  const headers = value.headers;
  if (headers && typeof headers === "object" && "get" in headers) {
    const get = (headers as { get?: unknown }).get;
    if (typeof get === "function") {
      const retry = get.call(headers, "retry-after");
      if (typeof retry === "string" && /^\d+$/.test(retry))
        return Number(retry) * 1_000;
    }
  }
  return 0;
}

export function authRateLimitDelay(error: unknown) {
  const text = textOf(error);
  const explicitDelay = retryDelayFrom(error);
  if (
    !explicitDelay &&
    !/rate.?limit|too many requests|try again (?:in|after)|security purposes|http\s*429/i.test(
      text,
    )
  )
    return 0;
  const match =
    /(?:in|after)\s+(\d+)\s*(seconds?|secs?|s|minutes?|mins?|m)\b/i.exec(text);
  const textDelay = match
    ? Number(match[1]) * (/^m/i.test(match[2]) ? 60_000 : 1_000)
    : 0;
  return Math.min(
    AUTH_RATE_LIMIT_MAX_MS,
    Math.max(1_000, explicitDelay || textDelay || AUTH_RATE_LIMIT_FALLBACK_MS),
  );
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
