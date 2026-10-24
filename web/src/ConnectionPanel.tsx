import { useState } from "react";
import { getService, serviceUrl, serviceRequest } from "./connection";
export default function ConnectionPanel() {
  const [connected, setConnected] = useState(!!getService());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <section className="settings-card">
      <h2>Playback service</h2>
      <p>
        For TorBox API access, add-ons that block browser requests, and IPTV
        streams that need a relay. This is your private service, separate from
        GitHub Pages.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {connected ? (
        <>
          <p role="status">
            Playback service connected. API requests can use the relay and video
            is routed through it.
          </p>
          <label>
            Playback compatibility
            <select
              defaultValue={getService()?.mode ?? "direct"}
              onChange={(e) => {
                localStorage.setItem(
                  "nuvio:playback-service",
                  JSON.stringify({ ...getService(), mode: e.target.value }),
                );
                window.dispatchEvent(new Event("connections-changed"));
              }}
            >
              <option value="direct">Relay original video (fastest)</option>
              <option value="remux">Remux to HLS with compatible audio</option>
              <option value="transcode">
                Convert to 720p H.264 (uses Pi CPU)
              </option>
            </select>
          </label>
          <p className="hint">
            Start with relay. For unsupported containers or audio, try remux.
            Conversion starts a live HLS session with limited seeking.
          </p>
          <button
            onClick={() => {
              localStorage.removeItem("nuvio:playback-service");
              setConnected(false);
              window.dispatchEvent(new Event("connections-changed"));
            }}
          >
            Disconnect playback service
          </button>
        </>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            setBusy(true);
            setError("");
            try {
              const config = {
                url: serviceUrl(String(data.get("url"))),
                token: String(data.get("token")).trim(),
              };
              const r = await serviceRequest(
                "/health",
                undefined,
                AbortSignal.timeout(10000),
                config,
              );
              if (!r.ok)
                throw new Error("Playback service did not accept this key.");
              const status = await r.json();
              if (status.ok !== true)
                throw new Error("This is not a compatible playback service.");
              localStorage.setItem(
                "nuvio:playback-service",
                JSON.stringify(config),
              );
              setConnected(true);
              window.dispatchEvent(new Event("connections-changed"));
              form.reset();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not connect.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Playback service URL
            <input
              name="url"
              type="url"
              placeholder="https://playback.your-domain.com"
              required
            />
          </label>
          <label>
            Playback service key
            <input name="token" type="password" autoComplete="off" required />
          </label>
          <button disabled={busy}>
            {busy ? "Checking service..." : "Connect playback service"}
          </button>
        </form>
      )}
    </section>
  );
}
