import { useState } from "react";
import {
  downloadJson,
  downloadText,
  parseCollections,
  mergeCollections,
  parseTransfer,
  type Collection,
  type Transfer,
} from "./collections";
import { cleanItem, read } from "./storage";
import type { Addon, Item, Progress, Provider } from "./types";
import type { HomeCatalogSetting } from "./account";
import {
  decryptSetup,
  encryptSetup,
  type SecureSetup,
} from "./encrypted-backup";

export default function DataTools(props: {
  addons: Addon[];
  collections: Collection[];
  library: Item[];
  provider: Provider | null;
  torboxKey: string;
  realDebridKey: string;
  autoplay: boolean;
  homeCatalogs: HomeCatalogSetting[];
  tmdbKey: string;
  onCollections: (collections: Collection[]) => void;
  onRestore: (transfer: Transfer) => Promise<string>;
  onSecureRestore: (setup: SecureSetup) => Promise<string>;
}) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const transfer = (): Transfer => ({
    format: "nuvio-enhanced-web",
    version: 1,
    addons: props.addons.map((addon) => `${addon.base}/manifest.json`),
    collections: props.collections,
    library: props.library.map(cleanItem),
    progress: read<Progress[]>("progress", []),
  });
  function importCollections(payload: string) {
    setError("");
    setStatus("");
    try {
      const incoming = parseCollections(payload);
      props.onCollections(mergeCollections(props.collections, incoming));
      setStatus(`Imported ${incoming.length} collections. Open My library to browse or edit them.`);
      setText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Import failed.");
    }
  }
  return (
    <section className="settings-card">
      <h2>Your Nuvio setup</h2>
      <p>
        Bring over Nuvio collection JSON and configured add-ons. Sign in to your
        Nuvio account for automatic profile sync, or use these manual tools.
      </p>
      {error && <div className="error" role="alert">{error}</div>}
      {status && <div className="success" role="status">{status}</div>}
      <div className="actions">
        <label className="button file-button">
          Import collections
          <input
            aria-label="Import collections file"
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 5_000_000) {
                setError("Choose a JSON file smaller than 5 MB.");
                return;
              }
              importCollections(await file.text());
            }}
          />
        </label>
        <button onClick={() => downloadJson("nuvio-collections.json", props.collections)}>
          Export collections
        </button>
      </div>
      <details>
        <summary>Paste collection JSON</summary>
        <label>
          Collection JSON
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder='[{"id":"...","title":"...","folders":[]}]'
            rows={6}
          />
        </label>
        <button onClick={() => importCollections(text)} disabled={!text.trim()}>
          Import pasted collections
        </button>
      </details>
      <p className="hint">
        Native Nuvio collection folders are supported. TMDB sources use the API
        key from your Nuvio profile or Settings. Trakt sources need a matching
        installed catalog add-on.
      </p>

      <h3>Encrypted full backup</h3>
      <p>
        Includes add-ons, collections, favorites, progress, playback settings,
        debrid keys, TMDB key, and your optional Live TV login. Encryption runs
        in this browser. The passphrase cannot be recovered.
      </p>
      <div className="settings-grid">
        <label>
          Backup passphrase
          <input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            placeholder="At least 12 characters"
          />
        </label>
        <label>
          Confirm passphrase
          <input
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
      </div>
      <div className="actions">
        <button
          disabled={busy || passphrase.length < 12}
          onClick={() => void (async () => {
            setError("");
            setStatus("");
            if (passphrase !== confirmation) {
              setError("The backup passphrases do not match.");
              return;
            }
            setBusy(true);
            try {
              const encrypted = await encryptSetup({
                transfer: transfer(),
                provider: props.provider,
                torboxKey: props.torboxKey,
                realDebridKey: props.realDebridKey,
                autoplay: props.autoplay,
                homeCatalogs: props.homeCatalogs,
                tmdbKey: props.tmdbKey,
              }, passphrase);
              downloadText("tiktak-tv-encrypted-backup.json", encrypted);
              setStatus("Encrypted full backup downloaded.");
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "Backup failed.");
            } finally {
              setBusy(false);
            }
          })()}
        >
          {busy ? "Working…" : "Export encrypted full backup"}
        </button>
        <label className="button file-button">
          {busy ? "Restoring…" : "Restore encrypted backup"}
          <input
            aria-label="Restore encrypted backup file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              setStatus("");
              try {
                if (!passphrase) throw new Error("Enter the backup passphrase first.");
                if (file.size > 10_000_000) throw new Error("Choose a backup smaller than 10 MB.");
                setStatus(await props.onSecureRestore(
                  await decryptSetup(await file.text(), passphrase),
                ));
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : "Restore failed.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      <details>
        <summary>Legacy backup without credentials</summary>
        <p className="hint">
          This older format excludes debrid and Live TV credentials. Configured
          add-on URLs can still contain private tokens, so keep the file private.
        </p>
        <div className="actions">
          <button onClick={() => downloadJson("nuvio-web-backup.json", transfer())}>
            Export legacy backup
          </button>
          <label className="button file-button">
            Restore legacy backup
            <input
              aria-label="Restore web backup file"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                setError("");
                try {
                  setStatus(await props.onRestore(parseTransfer(await file.text())));
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Restore failed.");
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        </div>
      </details>
    </section>
  );
}
