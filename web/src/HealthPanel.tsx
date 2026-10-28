import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import type { Addon, Provider } from "./types";
import { runHealthChecks, type HealthResult } from "./reliability";

export default function HealthPanel(props: {
  addons: Addon[];
  torboxKey: string;
  realDebridKey: string;
  provider: Provider | null;
}) {
  const [results, setResults] = useState<HealthResult[]>([]);
  const [running, setRunning] = useState(false);
  const [checkedAt, setCheckedAt] = useState(0);
  const run = () => {
    const controller = new AbortController();
    setRunning(true);
    void runHealthChecks({ ...props, signal: controller.signal })
      .then((next) => {
        setResults(next);
        setCheckedAt(Date.now());
      })
      .finally(() => setRunning(false));
    return () => controller.abort();
  };
  useEffect(run, [
    props.addons,
    props.torboxKey,
    props.realDebridKey,
    props.provider,
  ]);
  return (
    <section className="settings-card health-panel">
      <div className="card-heading">
        <Activity />
        <div>
          <h2>Playback health</h2>
          <p>Test every connection needed to stream on this device.</p>
        </div>
        <button onClick={run} disabled={running}>
          <RefreshCw size={17} className={running ? "spin" : ""} />
          {running ? "Testing…" : "Run checks"}
        </button>
      </div>
      {checkedAt > 0 && (
        <p className="hint">
          Last checked{" "}
          {new Date(checkedAt).toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
      <div className="health-grid">
        {results.map((result) => {
          const Icon =
            result.status === "ready"
              ? CheckCircle2
              : result.status === "warning"
                ? TriangleAlert
                : XCircle;
          return (
            <article
              key={result.id}
              className={`health-result ${result.status}`}
            >
              <Icon />
              <div>
                <strong>{result.label}</strong>
                <p>{result.detail}</p>
                {result.fix && <small>{result.fix}</small>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
