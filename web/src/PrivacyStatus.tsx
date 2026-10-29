import {
  CircleAlert,
  CircleCheck,
  ExternalLink,
  LockKeyhole,
  RefreshCw,
  ServerCog,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getService } from "./connection";

export default function PrivacyStatus() {
  const [service, setService] = useState<"checking" | "online" | "offline">(
    "checking",
  );
  const [checkedAt, setCheckedAt] = useState("");
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
