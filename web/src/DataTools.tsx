import { useState } from "react";
import {
  downloadJson,
  parseCollections,
  mergeCollections,
  parseTransfer,
  type Collection,
  type Transfer,
} from "./collections";
import { cleanItem, read } from "./storage";
import type { Addon, Item, Progress } from "./types";

export default function DataTools({
  addons,
  collections,
  library,
  onCollections,
  onRestore,
}: {
  addons: Addon[];
  collections: Collection[];
  library: Item[];
  onCollections: (c: Collection[]) => void;
  onRestore: (t: Transfer) => Promise<string>;
}) {
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  function importCollections(payload: string) {
    setError("");
    setStatus("");
    try {
      const incoming = parseCollections(payload);
      onCollections(mergeCollections(collections, incoming));
      setStatus(
        `Imported ${incoming.length} collections. Open My library to browse or edit them.`,
      );
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
    }
  }
  return (
    <section className="settings-card">
      <h2>Your Nuvio setup</h2>
      <p>
        Bring over Nuvio collection JSON and your configured add-ons. Changes
        here stay in this browser; this is not automatic Nuvio account sync.
      </p>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="success" role="status">
          {status}
        </div>
      )}
      <div className="actions">
        <label className="button file-button">
          Import collections
          <input
            aria-label="Import collections file"
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.size > 5_000_000) {
                setError("Choose a JSON file smaller than 5 MB.");
                return;
              }
              importCollections(await file.text());
            }}
          />
        </label>
        <button
          onClick={() => downloadJson("nuvio-collections.json", collections)}
        >
          Export collections
        </button>
      </div>
      <details>
        <summary>Paste collection JSON</summary>
        <label>
          Collection JSON
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder='[{"id":"...","title":"...","folders":[]}]'
            rows={6}
          />
        </label>
        <button onClick={() => importCollections(text)} disabled={!text.trim()}>
          Import pasted collections
        </button>
      </details>
      <p className="hint">
        In native Nuvio, export from collection management. Add-on catalog
        folders are supported. TMDB/Trakt source definitions are preserved but
        need an equivalent add-on catalog to load here. Nuvio Enhanced’s
        settings backup is a different format and does not contain the full
        library.
      </p>
      <h3>Move this web setup to another device</h3>
      <p>
        Export collections, add-on addresses, favorites and watch progress. IPTV
        passwords and the separate TorBox API key are excluded. Configured
        add-on URLs may contain TorBox tokens: keep the backup private.
      </p>
      <div className="actions">
        <button
          onClick={() =>
            downloadJson("nuvio-web-backup.json", {
              format: "nuvio-enhanced-web",
              version: 1,
              addons: addons.map((a) => `${a.base}/manifest.json`),
              collections,
              library: library.map(cleanItem),
              progress: read<Progress[]>("progress", []),
            } satisfies Transfer)
          }
        >
          Export web backup
        </button>
        <label className="button file-button">
          {busy ? "Restoring…" : "Restore web backup"}
          <input
            aria-label="Restore web backup file"
            type="file"
            accept=".json,application/json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setBusy(true);
              setError("");
              setStatus("");
              try {
                if (file.size > 10_000_000)
                  throw new Error("Choose a backup smaller than 10 MB.");
                setStatus(await onRestore(parseTransfer(await file.text())));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Restore failed.");
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
    </section>
  );
}
