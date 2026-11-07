import { serviceRequest } from "./connection";

const preferenceKey = "tiktak:usage-analytics";
const visitorKey = "tiktak:usage-visitor";
const sessionKey = "tiktak:usage-session";
const endpoint = "https://api.tiktaktv.me/analytics/heartbeat";
let lastInteraction = Date.now();
let embeddedMediaPlaying = false;

type PlaybackMetricEvent = "opened" | "started" | "failed" | "ended" | "closed";

type MediaActivityDetail = {
  active?: boolean;
  event?: PlaybackMetricEvent;
  playbackId?: string;
  durationSeconds?: number;
};

type PlaybackTimer = {
  activeAt: number;
  seconds: number;
  started: boolean;
  finished: boolean;
};

const playbackTimers = new Map<string, PlaybackTimer>();

export type UsageSummary = {
  activeNow: number;
  today: number;
  sevenDays: number;
  thirtyDays: number;
  allTime: number;
  visits: number;
  platforms: Record<string, number>;
  accounts: {
    activeNow: number;
    onlineNow: number;
    today: number;
    sevenDays: number;
    thirtyDays: number;
    allTime: number;
    signupsToday: number;
    signupsSevenDays: number;
    signupsThirtyDays: number;
    returning: number;
    sessionsPerAccount: number;
    averageSessionMinutes: number;
    retention: Record<
      "day1" | "day7" | "day30",
      { eligible: number; returned: number; rate: number | null }
    >;
  };
  playback?: {
    opened: number;
    started: number;
    failed: number;
    ended: number;
    closed: number;
    sessionsWithPlayback: number;
    successRate: number | null;
    averageDurationMinutes: number;
    totalDurationHours: number;
    durationSamples: number;
    durationBuckets: Record<
      "under1m" | "oneTo5m" | "fiveTo15m" | "fifteenTo30m" | "thirtyPlus",
      number
    >;
    byPlatform: Record<
      string,
      {
        opened: number;
        started: number;
        failed: number;
        durationSamples: number;
      }
    >;
    byRelease: Record<
      string,
      {
        opened: number;
        started: number;
        failed: number;
        durationSamples: number;
      }
    >;
    measurementStartedAt: number | null;
  };
  definitions?: {
    version: number;
    timezone: string;
    signedIn: string;
    returning: string;
    session: string;
    averageSession: string;
    retention: string;
    device: string;
    platform: string;
    visit: string;
    playback?: string;
  };
  generatedAt: number;
};

function productionSite() {
  return ["tiktaktv.me", "www.tiktaktv.me"].includes(location.hostname);
}

function visitorId() {
  try {
    let value = localStorage.getItem(visitorKey);
    if (!value) {
      value = crypto.randomUUID().replaceAll("-", "");
      localStorage.setItem(visitorKey, value);
    }
    return value;
  } catch {
    return "";
  }
}

function sessionId() {
  try {
    let value = sessionStorage.getItem(sessionKey);
    if (!value) {
      value = crypto.randomUUID().replaceAll("-", "");
      sessionStorage.setItem(sessionKey, value);
    }
    return value;
  } catch {
    return "";
  }
}

function activelyUsingApp() {
  const nativeMediaPlaying = Array.from(
    document.querySelectorAll("video, audio"),
  ).some(
    (media) =>
      !(media as HTMLMediaElement).paused && !(media as HTMLMediaElement).ended,
  );
  return (
    embeddedMediaPlaying ||
    nativeMediaPlaying ||
    Date.now() - lastInteraction < 5 * 60_000
  );
}

function clientType() {
  const agent = navigator.userAgent;
  if (/TikTakTV-AndroidTV/i.test(agent)) return "android-tv";
  if (/TikTakTV-Android\//i.test(agent)) return "android-mobile";
  if (matchMedia("(display-mode: standalone)").matches) return "pwa";
  return /Android|iPhone|iPad|Mobile/i.test(agent)
    ? "web-mobile"
    : "web-desktop";
}

function clientRelease() {
  const match = navigator.userAgent.match(
    /TikTakTV-(?:AndroidTV|Android)\/([0-9.]+)/i,
  );
  return match?.[1]?.slice(0, 24) || "web";
}

export function usageAnalyticsEnabled() {
  try {
    return localStorage.getItem(preferenceKey) !== "0";
  } catch {
    return false;
  }
}

export function setUsageAnalyticsEnabled(enabled: boolean) {
  try {
    localStorage.setItem(preferenceKey, enabled ? "1" : "0");
  } catch {}
  window.dispatchEvent(new Event("usage-analytics-changed"));
}

async function anonymousHeartbeat() {
  if (!productionSite() || !usageAnalyticsEnabled()) return;
  const id = visitorId();
  if (!id) return;
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId: id, client: clientType() }),
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
    keepalive: true,
  }).catch(() => undefined);
}

function storedAccount() {
  try {
    const session = JSON.parse(
      localStorage.getItem("tiktak:account") ?? "null",
    );
    if (typeof session?.access_token !== "string") return null;
    return {
      createdAt:
        typeof session?.user?.created_at === "string"
          ? session.user.created_at
          : undefined,
    };
  } catch {
    return null;
  }
}

async function accountHeartbeat() {
  const session = storedAccount();
  if (!productionSite() || !usageAnalyticsEnabled() || !session) return;
  await serviceRequest("/analytics/account", {
    client: clientType(),
    createdAt: session.createdAt,
    sessionId: sessionId(),
    active: activelyUsingApp(),
  }).catch(() => undefined);
}

async function playbackMetric(
  playbackId: string,
  event: PlaybackMetricEvent,
  durationSeconds?: number,
  keepalive = false,
) {
  const session = storedAccount();
  if (!productionSite() || !usageAnalyticsEnabled() || !session) return;
  const boundedDuration = Number.isFinite(durationSeconds)
    ? Math.max(0, Math.min(24 * 60 * 60, Math.round(durationSeconds ?? 0)))
    : undefined;
  await serviceRequest(
    "/analytics/playback",
    {
      client: clientType(),
      release: clientRelease(),
      sessionId: sessionId(),
      playbackId,
      event,
      ...(boundedDuration === undefined
        ? {}
        : { durationSeconds: boundedDuration }),
    },
    undefined,
    undefined,
    { keepalive },
  ).catch(() => undefined);
}

export function startUsageAnalytics() {
  if (!productionSite()) return () => undefined;
  const send = () => {
    if (document.visibilityState === "hidden" && !embeddedMediaPlaying) return;
    void anonymousHeartbeat();
    void accountHeartbeat();
  };
  const interacted = () => {
    lastInteraction = Date.now();
  };
  const mediaActivity = (event: Event) => {
    const detail = (event as CustomEvent<MediaActivityDetail>).detail ?? {};
    embeddedMediaPlaying = Boolean(detail.active);
    const playbackId = String(detail.playbackId ?? "");
    if (/^[A-Za-z0-9_-]{20,100}$/.test(playbackId)) {
      const existingTimer = playbackTimers.get(playbackId);
      if (
        !existingTimer &&
        (detail.event === "ended" || detail.event === "closed")
      )
        return;
      const timer = existingTimer ?? {
        activeAt: 0,
        seconds: 0,
        started: false,
        finished: false,
      };
      const stopTimer = () => {
        if (!timer.activeAt) return;
        timer.seconds += Math.max(0, (Date.now() - timer.activeAt) / 1000);
        timer.activeAt = 0;
      };
      if (detail.active && !timer.activeAt) timer.activeAt = Date.now();
      if (!detail.active) stopTimer();
      if (detail.event === "opened") void playbackMetric(playbackId, "opened");
      else if (detail.event === "started" && !timer.started) {
        timer.started = true;
        void playbackMetric(playbackId, "started");
      } else if (detail.event === "failed")
        void playbackMetric(playbackId, "failed");
      else if (
        (detail.event === "ended" || detail.event === "closed") &&
        !timer.finished
      ) {
        timer.finished = true;
        void playbackMetric(playbackId, detail.event, timer.seconds);
      }
      if (timer.finished) playbackTimers.delete(playbackId);
      else playbackTimers.set(playbackId, timer);
    } else if (detail.event)
      void playbackMetric(
        crypto.randomUUID().replaceAll("-", ""),
        detail.event,
        detail.durationSeconds,
      );
    if (embeddedMediaPlaying) {
      lastInteraction = Date.now();
      send();
    }
  };
  const pageLeaving = () => {
    const now = Date.now();
    for (const [playbackId, timer] of playbackTimers) {
      if (timer.finished) continue;
      if (timer.activeAt) {
        timer.seconds += Math.max(0, (now - timer.activeAt) / 1000);
        timer.activeAt = 0;
      }
      timer.finished = true;
      void playbackMetric(playbackId, "closed", timer.seconds, true);
    }
    playbackTimers.clear();
    embeddedMediaPlaying = false;
  };
  send();
  const timer = window.setInterval(send, 4 * 60_000);
  const visible = () => {
    if (document.visibilityState === "visible") send();
  };
  window.addEventListener("online", send);
  window.addEventListener("usage-analytics-changed", send);
  window.addEventListener("account-auth-changed", send);
  window.addEventListener("pointerdown", interacted, { passive: true });
  window.addEventListener("keydown", interacted);
  window.addEventListener("wheel", interacted, { passive: true });
  window.addEventListener("touchstart", interacted, { passive: true });
  window.addEventListener("tiktak-media-activity", mediaActivity);
  window.addEventListener("pagehide", pageLeaving);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", send);
    window.removeEventListener("usage-analytics-changed", send);
    window.removeEventListener("account-auth-changed", send);
    window.removeEventListener("pointerdown", interacted);
    window.removeEventListener("keydown", interacted);
    window.removeEventListener("wheel", interacted);
    window.removeEventListener("touchstart", interacted);
    window.removeEventListener("tiktak-media-activity", mediaActivity);
    window.removeEventListener("pagehide", pageLeaving);
    document.removeEventListener("visibilitychange", visible);
  };
}

export async function privateUsageSummary(): Promise<UsageSummary | null> {
  try {
    const response = await serviceRequest("/analytics/admin", {});
    if (!response.ok) return null;
    return (await response.json()) as UsageSummary;
  } catch {
    return null;
  }
}
