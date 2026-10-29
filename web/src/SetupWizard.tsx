import { useEffect, useMemo, useState } from "react";
import {
  Blocks,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Radio,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { Addon, Provider } from "./types";
import { runHealthChecks, type HealthResult } from "./reliability";

export default function SetupWizard(props: {
  profileName: string;
  addons: Addon[];
  catalogCount: number;
  torboxKey: string;
  realDebridKey: string;
  provider: Provider | null;
  onSettings: () => void;
  onComplete: () => void;
}) {
  const [step, setStep] = useState(0);
  const [checks, setChecks] = useState<HealthResult[]>([]);
  const [testing, setTesting] = useState(false);
  const [path, setPath] = useState<"synced" | "debrid" | "addon" | "browse">(
    props.torboxKey || props.realDebridKey
      ? "debrid"
      : props.addons.length
        ? "synced"
        : "browse",
  );
  const streamingAddons = useMemo(
    () =>
      props.addons.filter((addon) =>
        (addon.manifest.resources ?? []).some(
          (resource) =>
            (typeof resource === "string" ? resource : resource.name) ===
            "stream",
        ),
      ),
    [props.addons],
  );
  useEffect(() => {
    if (step !== 3 || checks.length) return;
    const controller = new AbortController();
    setTesting(true);
    void runHealthChecks({
      addons: props.addons,
      torboxKey: props.torboxKey,
      realDebridKey: props.realDebridKey,
      provider: props.provider,
      signal: controller.signal,
    })
      .then(setChecks)
      .finally(() => setTesting(false));
    return () => controller.abort();
  }, [step]);
  const ready = checks.filter((item) => item.status === "ready").length;
  return (
    <div className="setup-wizard-backdrop" role="presentation">
      <section
        className="setup-wizard"
        role="dialog"
        aria-modal="true"
        aria-labelledby="setup-title"
      >
        <button
          className="icon-button setup-close"
          onClick={props.onComplete}
          aria-label="Close setup"
        >
          <X />
        </button>
        <div
          className="setup-progress"
          aria-label={`Setup step ${step + 1} of 5`}
        >
          {[0, 1, 2, 3, 4].map((value) => (
            <span key={value} className={value <= step ? "active" : ""} />
          ))}
        </div>
        {step === 0 && (
          <>
            <Sparkles className="setup-hero-icon" />
            <span className="eyebrow">WELCOME TO TIKTAK TV</span>
            <h1 id="setup-title">
              Hi {props.profileName || "there"}. Let’s make sure you’re ready.
            </h1>
            <p>
              Your Nuvio profile has been synced. This quick check confirms your
              catalogs, streaming sources, and browser compatibility.
            </p>
            <div className="setup-summary">
              <article>
                <Blocks />
                <strong>{props.addons.length}</strong>
                <span>Add-ons imported</span>
              </article>
              <article>
                <Radio />
                <strong>{props.catalogCount}</strong>
                <span>Catalogs available</span>
              </article>
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <KeyRound className="setup-hero-icon" />
            <span className="eyebrow">HOW YOU WATCH</span>
            <h1 id="setup-title">Choose your setup path</h1>
            <p>
              TikTak TV uses your own Nuvio add-ons and provider accounts. It
              never gives a new account somebody else’s debrid or IPTV login.
            </p>
            <div className="setup-paths">
              <button
                className={path === "synced" ? "active" : ""}
                onClick={() => setPath("synced")}
              >
                <Blocks />
                <strong>Use my Nuvio setup</strong>
                <small>
                  Keep the add-ons and catalogs already synced to this profile.
                </small>
              </button>
              <button
                className={path === "debrid" ? "active" : ""}
                onClick={() => setPath("debrid")}
              >
                <KeyRound />
                <strong>Connect debrid</strong>
                <small>
                  Use your own TorBox or Real-Debrid account and configured
                  scraper.
                </small>
              </button>
              <button
                className={path === "addon" ? "active" : ""}
                onClick={() => setPath("addon")}
              >
                <Radio />
                <strong>Install an add-on</strong>
                <small>
                  Add a manifest URL, test it, and choose its source priority.
                </small>
              </button>
              <button
                className={path === "browse" ? "active" : ""}
                onClick={() => setPath("browse")}
              >
                <Sparkles />
                <strong>Browse catalogs first</strong>
                <small>
                  Explore metadata now and connect a streaming source later.
                </small>
              </button>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <KeyRound className="setup-hero-icon" />
            <span className="eyebrow">YOUR IMPORT</span>
            <h1 id="setup-title">Account configuration imported</h1>
            <div className="setup-list">
              <div>
                <CheckCircle2 />
                <span>
                  <strong>{props.addons.length} add-ons</strong>
                  <small>Installed from this Nuvio profile</small>
                </span>
              </div>
              <div>
                <CheckCircle2 />
                <span>
                  <strong>{streamingAddons.length} streaming sources</strong>
                  <small>Add-ons capable of returning playable results</small>
                </span>
              </div>
              <div
                className={
                  props.torboxKey || props.realDebridKey ? "" : "warning"
                }
              >
                <KeyRound />
                <span>
                  <strong>
                    {props.torboxKey
                      ? "TorBox connected"
                      : props.realDebridKey
                        ? "Real-Debrid connected"
                        : "Debrid not connected"}
                  </strong>
                  <small>
                    {props.torboxKey || props.realDebridKey
                      ? "Personal credentials restored securely"
                      : "You can connect one in Settings or use a configured streaming add-on"}
                  </small>
                </span>
              </div>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <ShieldCheck className="setup-hero-icon" />
            <span className="eyebrow">DEVICE CHECK</span>
            <h1 id="setup-title">
              {testing ? "Testing your setup…" : `${ready} checks ready`}
            </h1>
            <div className="setup-checks">
              {testing && <span className="spinner" />}
              {checks.map((check) => (
                <div key={check.id} className={check.status}>
                  <CheckCircle2 />
                  <span>
                    <strong>{check.label}</strong>
                    <small>{check.detail}</small>
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <CheckCircle2 className="setup-hero-icon ready" />
            <span className="eyebrow">READY TO STREAM</span>
            <h1 id="setup-title">
              {streamingAddons.length
                ? "Your profile is ready"
                : "Catalogs are ready"}
            </h1>
            <p>
              {streamingAddons.length
                ? "Press Play best stream on any title. TikTak TV will rank sources by quality and seeders, then automatically fall back if the first compatible source fails."
                : "You can browse now. Install a streaming add-on and connect its required provider before pressing Play best stream."}
            </p>
            <div className="setup-ready-note">
              <ShieldCheck />
              <span>
                Your credentials stay attached to your Nuvio account and are
                never shared with other website users.
              </span>
            </div>
          </>
        )}
        <footer>
          <button onClick={props.onSettings}>Review settings</button>
          {step > 0 && (
            <button onClick={() => setStep((value) => value - 1)}>Back</button>
          )}
          <button
            className="primary"
            onClick={() =>
              step === 4 ? props.onComplete() : setStep((value) => value + 1)
            }
            disabled={step === 3 && testing}
          >
            {step === 4 ? (
              "Start watching"
            ) : (
              <>
                Continue <ChevronRight size={17} />
              </>
            )}
          </button>
        </footer>
      </section>
    </div>
  );
}
