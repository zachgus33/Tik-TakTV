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

async function heartbeat() {
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

export function startUsageAnalytics() {
  if (!productionSite()) return () => undefined;
  const send = () => void heartbeat();
  send();
  const timer = window.setInterval(send, 4 * 60_000);
  const visible = () => {
    if (document.visibilityState === "visible") send();
  };
  window.addEventListener("online", send);
  window.addEventListener("usage-analytics-changed", send);
  document.addEventListener("visibilitychange", visible);
  return () => {
    clearInterval(timer);
    window.removeEventListener("online", send);
    window.removeEventListener("usage-analytics-changed", send);
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
