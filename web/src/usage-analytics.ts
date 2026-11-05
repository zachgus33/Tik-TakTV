import { serviceRequest } from "./connection";

const preferenceKey = "tiktak:usage-analytics";
const visitorKey = "tiktak:usage-visitor";
const sessionKey = "tiktak:usage-session";
const endpoint = "https://api.tiktaktv.me/analytics/heartbeat";
let lastInteraction = Date.now();
let embeddedMediaPlaying = false;

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
    retention: Record<"day1" | "day7" | "day30", { eligible: number; returned: number; rate: number | null }>;
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
  } catch { return ""; }
}

function activelyUsingApp() {
  const nativeMediaPlaying = Array.from(document.querySelectorAll("video, audio"))
    .some((media) => !(media as HTMLMediaElement).paused && !(media as HTMLMediaElement).ended);
  return embeddedMediaPlaying || nativeMediaPlaying || Date.now() - lastInteraction < 5 * 60_000;
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
    const session = JSON.parse(localStorage.getItem("tiktak:account") ?? "null");
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
  if (!productionSite() || !session) return;
  await serviceRequest("/analytics/account", {
    client: clientType(),
    createdAt: session.createdAt,
    sessionId: sessionId(),
    active: activelyUsingApp(),
  }).catch(() => undefined);
}

export function startUsageAnalytics() {
  if (!productionSite()) return () => undefined;
  const send = () => {
    if (document.visibilityState === "hidden" && !embeddedMediaPlaying) return;
    void anonymousHeartbeat();
    void accountHeartbeat();
  };
  const interacted = () => { lastInteraction = Date.now(); };
  const mediaActivity = (event: Event) => {
    embeddedMediaPlaying = Boolean((event as CustomEvent<{ active?: boolean }>).detail?.active);
    if (embeddedMediaPlaying) {
      lastInteraction = Date.now();
      send();
    }
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
