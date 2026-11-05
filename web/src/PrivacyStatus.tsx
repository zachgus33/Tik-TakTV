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

export default function PrivacyStatus() {
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
    if (getService()?.account)
      void privateUsageSummary().then(setUsage);
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
            <h2>Anonymous usage</h2>
            <p>Help the owner understand how many devices use TikTak TV.</p>
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
            Share an anonymous heartbeat. It contains a hashed random device ID
            and app type, never your email, provider details, viewing activity,
            searches, or media URLs.
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
            <article><strong>{usage.accounts.onlineNow ?? usage.accounts.activeNow}</strong><span>Signed in online now</span></article>
            <article><strong>{usage.accounts.activeNow}</strong><span>Actively using now</span></article>
            <article><strong>{usage.accounts.today}</strong><span>Signed in · 24 hours</span></article>
            <article><strong>{usage.accounts.sevenDays}</strong><span>Signed in · 7 days</span></article>
            <article><strong>{usage.accounts.thirtyDays}</strong><span>Signed in · 30 days</span></article>
            <article><strong>{usage.accounts.allTime}</strong><span>Accounts using TikTak TV</span></article>
          </div>
          <h3 className="usage-section-title">Engagement</h3>
          <div className="usage-metrics usage-engagement">
            <article><strong>{usage.accounts.returning ?? 0}</strong><span>Returning accounts</span></article>
            <article><strong>{usage.accounts.sessionsPerAccount ?? 0}</strong><span>Sessions per account</span></article>
            <article><strong>{usage.accounts.averageSessionMinutes ?? 0}m</strong><span>Average session</span></article>
          </div>
          <h3 className="usage-section-title">Retention</h3>
          <div className="usage-metrics usage-retention">
            {(["day1", "day7", "day30"] as const).map((period) => {
              const value = usage.accounts.retention?.[period];
              return <article key={period}>
                <strong>{value?.rate == null ? "—" : `${value.rate}%`}</strong>
                <span>{period === "day1" ? "Day 1" : period === "day7" ? "Day 7" : "Day 30"} retention</span>
                <small>{value?.eligible ?? 0} eligible accounts</small>
              </article>;
            })}
          </div>
          <h3 className="usage-section-title">New sign-ups using TikTak TV</h3>
          <div className="usage-metrics usage-signups">
            <article><strong>{usage.accounts.signupsToday}</strong><span>Last 24 hours</span></article>
            <article><strong>{usage.accounts.signupsSevenDays}</strong><span>Last 7 days</span></article>
            <article><strong>{usage.accounts.signupsThirtyDays}</strong><span>Last 30 days</span></article>
          </div>
          <h3 className="usage-section-title">Anonymous traffic</h3>
          <div className="usage-metrics usage-traffic">
            <article><strong>{usage.activeNow}</strong><span>Devices active now</span></article>
            <article><strong>{usage.thirtyDays}</strong><span>Devices · 30 days</span></article>
            <article><strong>{usage.allTime}</strong><span>All-time devices</span></article>
            <article><strong>{usage.visits}</strong><span>Total visits</span></article>
          </div>
          <div className="usage-platforms">
            <Users size={19} />
            <span>Desktop web {usage.platforms["web-desktop"] ?? 0}</span>
            <span>Mobile web {usage.platforms["web-mobile"] ?? 0}</span>
            <span>Installed web app {usage.platforms.pwa ?? 0}</span>
            <span>Android phone {usage.platforms["android-mobile"] ?? 0}</span>
            <span>TV app {usage.platforms["android-tv"] ?? 0}</span>
          </div>
          <small>
            Account totals count distinct signed-in accounts. Active use includes recent remote, keyboard, touch, or playback activity. Session and retention data starts with this release. No titles, searches, viewing history, emails, or raw account IDs are stored. {" "}
            Updated {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(usage.generatedAt))}
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
        <a
          href="https://github.com/zachgus33/Tik-TakTV/issues/new"
          target="_blank"
          rel="noreferrer"
        >
          Send feedback or report a problem <ExternalLink size={15} />
        </a>
      </section>
    </div>
  );
}
