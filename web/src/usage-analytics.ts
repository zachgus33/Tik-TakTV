import { serviceRequest } from "./connection";

const preferenceKey = "tiktak:usage-analytics";
const visitorKey = "tiktak:usage-visitor";
const endpoint = "https://api.tiktaktv.me/analytics/heartbeat";

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
    today: number;
    sevenDays: number;
    thirtyDays: number;
    allTime: number;
    signupsToday: number;
    signupsSevenDays: number;
    signupsThirtyDays: number;
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
  }).catch(() => undefined);
}

export function startUsageAnalytics() {
  if (!productionSite()) return () => undefined;
  const send = () => {
    void anonymousHeartbeat();
    void accountHeartbeat();
  };
  send();
  const timer = window.setInterval(send, 4 * 60_000);
  const visible = () => {
    if (document.visibilityState === "visible") send();
  };
  window.addEventListener("online", send);
  window.addEventListener("usage-analytics-changed", send);
  window.addEventListener("account-auth-changed", send);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", send);
    window.removeEventListener("usage-analytics-changed", send);
    window.removeEventListener("account-auth-changed", send);
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
