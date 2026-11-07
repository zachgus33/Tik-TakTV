import {
  CircleAlert,
  CircleCheck,
  BarChart3,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getService } from "./connection";
import {
  privateUsageSummary,
  setUsageAnalyticsEnabled,
  usageAnalyticsEnabled,
  type UsageSummary,
} from "./usage-analytics";

export default function PrivacyStatus({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) {
  const [service, setService] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [checkedAt, setCheckedAt] = useState("");
  const [analyticsEnabled, setAnalyticsEnabled] = useState(
    usageAnalyticsEnabled,
  );
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const checkService = useCallback(async () => {
    setService("checking");
    try {
      const response = await fetch("https://api.tiktaktv.me/healthz", {
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(8_000),
      });
      const result = response.ok ? await response.json() : null;
      setService(
        result?.ok === true && result?.version === 2 ? "online" : "offline",
      );
    } catch {
      setService("offline");
    } finally {
      setCheckedAt(
        new Intl.DateTimeFormat(undefined, {
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date()),
      );
    }
  }, []);
  useEffect(() => {
    void checkService();
    if (getService()?.account) void privateUsageSummary().then(setUsage);
  }, [checkService]);
  return (
    <div className="privacy-status">
      <section className="settings-card">
        <div className="card-heading">
          <ShieldCheck />
          <div>
            <h2>Privacy and credentials</h2>
            <p>How TikTak TV handles account and provider data.</p>
          </div>
        </div>
        <div className="privacy-grid">
          <article>
            <LockKeyhole />
            <div>
              <strong>Personal credentials</strong>
              <p>
                Debrid keys, configured add-on URLs, and IPTV credentials are
                scoped to your signed-in Nuvio account and profile and cached in
                this browser so playback works. TikTak TV never displays them to
                other users.
              </p>
            </div>
          </article>
          <article>
            <ServerCog />
            <div>
              <strong>Playback requests</strong>
              <p>
                Direct streams go from the provider to your browser. Sources
                needing conversion pass through your configured compatibility
                service.
              </p>
            </div>
          </article>
        </div>
        <p className="hint">
          Configured manifest URLs can contain private tokens. They are
          intentionally excluded from UI diagnostics and application logs.
        </p>
      </section>
      <section className="settings-card service-status-card">
        <div className="card-heading">
          <ServerCog />
          <div>
            <h2>Service status</h2>
            <p>A quick public-launch readiness summary.</p>
          </div>
          <span
            className={`badge ${navigator.onLine ? "connected" : "failed"}`}
          >
            {navigator.onLine ? "Website online" : "Offline"}
          </span>
        </div>
        <ul>
          <li>
            <span>Website</span>
            <strong>{location.origin}</strong>
          </li>
          <li>
            <span>Compatibility service</span>
            <strong className={service === "offline" ? "failed" : ""}>
              {service === "checking"
                ? "Checking…"
                : service === "online"
                  ? "Online · protocol v2"
                  : "Temporarily unavailable"}
            </strong>
          </li>
          <li>
            <span>Current profile</span>
            <strong>
              {getService() ? "Companion access ready" : "Direct play only"}
            </strong>
          </li>
          <li>
            <span>Browser storage</span>
            <strong>Available on this device</strong>
          </li>
          <li>
            <span>External monitor</span>
            <strong>GitHub · every 10 minutes</strong>
          </li>
        </ul>
        <button type="button" onClick={() => void checkService()}>
          {service === "checking" ? (
            <RefreshCw className="spin" />
          ) : service === "online" ? (
            <CircleCheck />
          ) : (
            <CircleAlert />
          )}
          {service === "checking"
            ? "Checking services…"
            : `Check again${checkedAt ? ` · ${checkedAt}` : ""}`}
        </button>
        <a
          href="https://github.com/zachgus33/Tik-TakTV/actions/workflows/production-smoke.yml"
          target="_blank"
          rel="noreferrer"
        >
          Production monitor <ExternalLink size={15} />
        </a>
      </section>
      <section className="settings-card">
        <div className="card-heading">
          <ShieldCheck />
          <div>
            <h2>Usage analytics</h2>
            <p>
              Help the owner understand whether TikTak TV works and gets used.
            </p>
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={analyticsEnabled}
            onChange={(event) => {
              setAnalyticsEnabled(event.target.checked);
              setUsageAnalyticsEnabled(event.target.checked);
            }}
          />
          <span>
            Share privacy-safe device and signed-in activity counts. Playback
            reports include only aggregate opens, starts, final errors, and time
            buckets by app type and release—never titles, channels, searches,
            provider details, credentials, or media URLs.
          </span>
        </label>
      </section>
      {usage && (
        <section className="settings-card usage-admin-card">
          <div className="card-heading">
            <BarChart3 />
            <div>
              <h2>Private usage dashboard</h2>
              <p>Visible only to the TikTak TV owner account.</p>
            </div>
            <button
              type="button"
              onClick={() => void privateUsageSummary().then(setUsage)}
              aria-label="Refresh private usage dashboard"
            >
              <RefreshCw size={18} />
            </button>
          </div>
          <div className="usage-metrics">
            <article>
              <strong>
                {usage.accounts.onlineNow ?? usage.accounts.activeNow}
              </strong>
              <span>Signed in online now</span>
            </article>
            <article>
              <strong>{usage.accounts.activeNow}</strong>
              <span>Actively using now</span>
            </article>
            <article>
              <strong>{usage.accounts.today}</strong>
              <span>Signed in · 24 hours</span>
            </article>
            <article>
              <strong>{usage.accounts.sevenDays}</strong>
              <span>Signed in · 7 days</span>
            </article>
            <article>
              <strong>{usage.accounts.thirtyDays}</strong>
              <span>Signed in · 30 days</span>
            </article>
            <article>
              <strong>{usage.accounts.allTime}</strong>
              <span>Accounts using TikTak TV</span>
            </article>
          </div>
          <h3 className="usage-section-title">Engagement</h3>
          <div className="usage-metrics usage-engagement">
            <article>
              <strong>{usage.accounts.returning ?? 0}</strong>
              <span>Returning accounts</span>
              <small>Seen on 2+ UTC dates</small>
            </article>
            <article>
              <strong>{usage.accounts.sessionsPerAccount ?? 0}</strong>
              <span>Sessions per account</span>
            </article>
            <article>
              <strong>{usage.accounts.averageSessionMinutes ?? 0}m</strong>
              <span>Average observed session</span>
            </article>
          </div>
          {usage.playback && (
            <>
              <h3 className="usage-section-title">Playback engagement</h3>
              <div className="usage-metrics usage-playback">
                <article>
                  <strong>{usage.playback.started}</strong>
                  <span>Successful playback starts</span>
                </article>
                <article>
                  <strong>{usage.playback.sessionsWithPlayback}</strong>
                  <span>Sessions with playback</span>
                </article>
                <article>
                  <strong>
                    {usage.playback.successRate == null
                      ? "—"
                      : `${usage.playback.successRate}%`}
                  </strong>
                  <span>Player open → start rate</span>
                </article>
                <article>
                  <strong>{usage.playback.failed}</strong>
                  <span>Final playback errors</span>
                </article>
                <article>
                  <strong>{usage.playback.averageDurationMinutes}m</strong>
                  <span>Average confirmed play time</span>
                </article>
                <article>
                  <strong>{usage.playback.totalDurationHours}h</strong>
                  <span>Total confirmed play time</span>
                </article>
              </div>
              <div
                className="usage-platforms usage-duration-buckets"
                aria-label="Playback duration buckets"
              >
                <span>&lt;1m {usage.playback.durationBuckets.under1m}</span>
                <span>1–5m {usage.playback.durationBuckets.oneTo5m}</span>
                <span>5–15m {usage.playback.durationBuckets.fiveTo15m}</span>
                <span>
                  15–30m {usage.playback.durationBuckets.fifteenTo30m}
                </span>
                <span>30m+ {usage.playback.durationBuckets.thirtyPlus}</span>
              </div>
              <small>
                {usage.playback.durationSamples} completed or closed
                embedded-player sessions measured
                {usage.playback.measurementStartedAt
                  ? ` since ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(usage.playback.measurementStartedAt))}`
                  : ""}
                . Paused time and external-player viewing are excluded.
              </small>
            </>
          )}
          <h3 className="usage-section-title">Retention</h3>
          <div className="usage-metrics usage-retention">
            {(["day1", "day7", "day30"] as const).map((period) => {
              const value = usage.accounts.retention?.[period];
              return (
                <article key={period}>
                  <strong>
                    {value?.rate == null ? "—" : `${value.rate}%`}
                  </strong>
                  <span>
                    {period === "day1"
                      ? "Day 1"
                      : period === "day7"
                        ? "Day 7"
                        : "Day 30"}{" "}
                    retention
                  </span>
                  <small>
                    {value?.returned ?? 0} returned · {value?.eligible ?? 0}{" "}
                    eligible
                  </small>
                </article>
              );
            })}
          </div>
          <h3 className="usage-section-title">New sign-ups using TikTak TV</h3>
          <div className="usage-metrics usage-signups">
            <article>
              <strong>{usage.accounts.signupsToday}</strong>
              <span>Last 24 hours</span>
            </article>
            <article>
              <strong>{usage.accounts.signupsSevenDays}</strong>
              <span>Last 7 days</span>
            </article>
            <article>
              <strong>{usage.accounts.signupsThirtyDays}</strong>
              <span>Last 30 days</span>
            </article>
          </div>
          <h3 className="usage-section-title">Anonymous traffic</h3>
          <div className="usage-metrics usage-traffic">
            <article>
              <strong>{usage.activeNow}</strong>
              <span>Devices active now</span>
            </article>
            <article>
              <strong>{usage.thirtyDays}</strong>
              <span>Devices · 30 days</span>
            </article>
            <article>
              <strong>{usage.allTime}</strong>
              <span>All-time devices</span>
            </article>
            <article>
              <strong>{usage.visits}</strong>
              <span>Total visits</span>
            </article>
          </div>
          <div className="usage-platforms">
            <Users size={19} />
            <span>Desktop web {usage.platforms["web-desktop"] ?? 0}</span>
            <span>Mobile web {usage.platforms["web-mobile"] ?? 0}</span>
            <span>Installed web app {usage.platforms.pwa ?? 0}</span>
            <span>Android phone {usage.platforms["android-mobile"] ?? 0}</span>
            <span>TV app {usage.platforms["android-tv"] ?? 0}</span>
          </div>
          <details className="usage-definitions">
            <summary>How these metrics are calculated</summary>
            <dl>
              <div>
                <dt>Signed-in activity</dt>
                <dd>
                  {usage.definitions?.signedIn ??
                    "Distinct privacy-safe account hashes with a heartbeat in each rolling time window."}
                </dd>
              </div>
              <div>
                <dt>Returning accounts</dt>
                <dd>
                  {usage.definitions?.returning ??
                    "Accounts observed on at least two UTC calendar dates in retained activity history."}
                </dd>
              </div>
              <div>
                <dt>Sessions</dt>
                <dd>
                  {usage.definitions?.session ??
                    "A browser tab or app session; a new tab or app restart can start another session."}
                </dd>
              </div>
              <div>
                <dt>Average session</dt>
                <dd>
                  {usage.definitions?.averageSession ??
                    "Heartbeat-observed foreground time per session; visible idle time can be included."}
                </dd>
              </div>
              <div>
                <dt>Retention</dt>
                <dd>
                  {usage.definitions?.retention ??
                    "Cumulative: eligible after N x 24 hours and returned after activity on or after UTC day N."}
                </dd>
              </div>
              <div>
                <dt>Devices and platforms</dt>
                <dd>
                  {usage.definitions?.device ??
                    "A pseudonymous browser or app installation ID that can change after storage is cleared or the app is reinstalled."}{" "}
                  {usage.definitions?.platform ??
                    "Platform totals cover device IDs active in the last 30 days."}
                </dd>
              </div>
              <div>
                <dt>Visits</dt>
                <dd>
                  {usage.definitions?.visit ??
                    "A device visit starts after at least 30 minutes without a heartbeat."}
                </dd>
              </div>
              <div>
                <dt>Playback engagement</dt>
                <dd>
                  {usage.definitions?.playback ??
                    "Aggregate embedded-player starts, final errors, and wall-clock time while media was actually playing; no titles, channels, or URLs are collected."}
                </dd>
              </div>
            </dl>
          </details>
          <small>
            Metric definitions v{usage.definitions?.version ?? 1} · Times and
            retention dates use {usage.definitions?.timezone ?? "UTC"}. No
            titles, searches, viewing history, emails, or raw account IDs are
            stored. Updated{" "}
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(usage.generatedAt))}
          </small>
        </section>
      )}
      <section className="settings-card public-launch-card">
        <div className="card-heading">
          <ShieldCheck />
          <div>
            <h2>Help, terms and feedback</h2>
            <p>Information for using TikTak TV responsibly.</p>
          </div>
        </div>
        <details>
          <summary>Quick setup</summary>
          <p>
            Sign in to Nuvio to sync your profiles, catalogs and add-ons. Add
            your own configured Torrentio or other streaming manifest, then
            enter your own TorBox or Real-Debrid key under Playback. Live TV
            requires your own Xtream or M3U provider.
          </p>
        </details>
        <details>
          <summary>Acceptable use and copyright</summary>
          <p>
            TikTak TV is a media client and does not host video. Only connect
            services and access media you are authorized to use. Add-on and
            provider operators are responsible for their own services and
            content. Stop using a source if you do not have permission to access
            it.
          </p>
        </details>
        <details>
          <summary>Privacy summary</summary>
          <p>
            Account configuration is synchronized through Nuvio and cached on
            this device. Playback reports omit stream URLs, manifest URLs,
            passwords and API keys. Clearing site data removes local caches.
          </p>
        </details>
        <button type="button" className="text-link" onClick={onOpenFeedback}>
          Send feedback or report a problem
        </button>
      </section>
    </div>
  );
}
