import ConnectionPanel from "./ConnectionPanel";
import { useState } from "react";
import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  Globe2,
  LibraryBig,
  Palette,
  PlayCircle,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { connectProvider, installAddon, parsePlaylist, safeUrl } from "./api";
import { storeProvider, save } from "./storage";
import type { Addon, Item, Provider } from "./types";
import { type Collection, type Transfer, addonUrls } from "./collections";
import { installMany, mergeAddons } from "./addon-import";
import { validateTorboxKey } from "./torbox";
import DataTools from "./DataTools";

type Props = {
  provider: Provider | null;
  onProvider: (p: Provider | null) => void;
  addons: Addon[];
  onAddons: (a: Addon[]) => void;
  onPlaylist: (items: Item[]) => void;
  onStream: (url: string) => void;
  accent: string;
  onAccent: (value: string) => void;
  collections: Collection[];
  onCollections: (c: Collection[]) => void;
  library: Item[];
  onRestore: (t: Transfer) => Promise<string>;
  torboxKey: string;
  onTorboxKey: (key: string) => void;
  autoplay: boolean;
  onAutoplay: (value: boolean) => void;
  playbackConnected: boolean;
};
type SettingsSection =
  "addons" | "collections" | "live" | "playback" | "general";

const sections = [
  {
    id: "addons",
    label: "Add-ons",
    description: "Catalogs and sources",
    icon: Blocks,
  },
  {
    id: "collections",
    label: "Collections",
    description: "Home and metadata",
    icon: LibraryBig,
  },
  {
    id: "live",
    label: "Live TV",
    description: "IPTV and playlists",
    icon: Radio,
  },
  {
    id: "playback",
    label: "Playback",
    description: "Player and TorBox",
    icon: PlayCircle,
  },
  {
    id: "general",
    label: "General",
    description: "Appearance and data",
    icon: Palette,
  },
] as const;
export default function Settings(props: Props) {
  const [section, setSection] = useState<SettingsSection>("addons");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [remember, setRemember] = useState(false);
  async function run(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError("");
    setSuccess("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
    } finally {
      setBusy("");
    }
  }
  return (
    <div className="settings-page">
      <div className="section-title">
        <div>
          <span className="eyebrow">MAKE IT YOURS</span>
          <h1>Settings</h1>
          <p>Manage content sources, playback, and preferences.</p>
        </div>
        <ShieldCheck className="section-icon" />
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {success && (
        <div className="success" role="status">
          <CheckCircle2 size={20} />
          {success}
        </div>
      )}
      <div className="settings-shell">
        <nav className="settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              key={item.id}
              className={section === item.id ? "active" : ""}
              aria-current={section === item.id ? "page" : undefined}
              onClick={() => setSection(item.id)}
            >
              <item.icon size={19} />
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="settings-panels">
          <header className="settings-panel-heading">
            <span>{sections.find((item) => item.id === section)?.label}</span>
            <h2>{sections.find((item) => item.id === section)?.description}</h2>
          </header>
          <div hidden={section !== "playback"}>
            <ConnectionPanel restored={props.playbackConnected} />
            <section className="settings-card">
              <h2>Torrentio & TorBox playback</h2>
              <p>
                Paste your existing Torrentio manifest configured with TorBox in
                Add-ons below. Its resolved HTTPS streams play directly. For
                torrent info-hash results, connect a TorBox API key here.
              </p>
              {props.torboxKey && (
                <div className="connection">
                  <strong>TorBox connected</strong>
                  <button
                    onClick={() => {
                      localStorage.removeItem("nuvio:torbox-key");
                      sessionStorage.removeItem("nuvio:torbox-key");
                      props.onTorboxKey("");
                    }}
                  >
                    Disconnect TorBox
                  </button>
                </div>
              )}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const values = new FormData(form);
                  const key = String(values.get("torbox")).trim();
                  void run("torbox", async () => {
                    await validateTorboxKey(key);
                    localStorage.removeItem("nuvio:torbox-key");
                    sessionStorage.removeItem("nuvio:torbox-key");
                    if (
                      !save(
                        "torbox-key",
                        key,
                        values.get("rememberTorbox")
                          ? localStorage
                          : sessionStorage,
                      )
                    )
                      throw new Error(
                        "Could not save the connection in this browser.",
                      );
                    props.onTorboxKey(key);
                    form.reset();
                    setSuccess(
                      "TorBox connected. Cached torrent results can now play.",
                    );
                  });
                }}
              >
                <label className="grow">
                  TorBox API key
                  <input
                    name="torbox"
                    type="password"
                    autoComplete="off"
                    required
                    placeholder="From your TorBox account settings"
                  />
                </label>
                <label className="check">
                  <input name="rememberTorbox" type="checkbox" />
                  Remember key on this device
                </label>
                <button disabled={!!busy}>
                  {busy === "torbox" ? "Connecting…" : "Connect TorBox"}
                </button>
              </form>
              <p className="hint">
                The key reaches TorBox directly or through your private playback
                service. Nuvio account sync can save it with your setup. Playing
                a torrent can add its cached entry to your TorBox account. No
                uncached download is started.
              </p>
              <label className="check">
                <input
                  type="checkbox"
                  checked={props.autoplay}
                  onChange={(e) => props.onAutoplay(e.target.checked)}
                />
                Automatically play the best 720p-or-higher stream
              </label>
              <p className="hint">
                Quality is matched from add-on labels (720p, 1080p, 1440p,
                2160p/4K, 4320p/8K). Highest reported seeder count wins, then
                resolution. Episode files must match the selected season and
                episode. Unknown quality or ambiguous files stay in the picker.
                Safari may still require a tap on its video play button.
              </p>
            </section>
          </div>
          <div hidden={section !== "live"}>
            <section className="settings-card">
              <div className="card-heading">
                <Radio />
                <div>
                  <h2>Xtream IPTV</h2>
                  <p>Connect live channels, movies, and series.</p>
                </div>
                {props.provider && (
                  <span className="badge connected">Connected</span>
                )}
              </div>
              {props.provider && (
                <div className="connection">
                  <div>
                    <strong>{props.provider.name || "My IPTV"}</strong>
                    <p>{new URL(props.provider.server).hostname}</p>
                  </div>
                  <button
                    onClick={() => {
                      storeProvider(null, false);
                      props.onProvider(null);
                      setSuccess(
                        "Provider disconnected. Saved titles remain in your library.",
                      );
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void run("provider", async () => {
                    const p = await connectProvider({
                      name: String(f.get("name") || "My IPTV").trim(),
                      server: String(f.get("server")),
                      username: String(f.get("username")).trim(),
                      password: String(f.get("password")),
                    });
                    storeProvider(p, remember);
                    props.onProvider(p);
                    setSuccess(
                      "Connection verified. Your IPTV library is ready.",
                    );
                    form.reset();
                    setRemember(false);
                  });
                }}
              >
                <div className="form-grid">
                  <label>
                    Connection name
                    <input name="name" placeholder="My IPTV" maxLength={60} />
                  </label>
                  <label>
                    Server address
                    <input
                      name="server"
                      type="url"
                      defaultValue="https://vpn.trx-pro-iptvstore.cc"
                      placeholder="https://your-provider.com:443"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <label>
                    Username
                    <input
                      name="username"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                    />
                  </label>
                  <label>
                    Password
                    <input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </label>
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                  />{" "}
                  Remember this connection on this device
                </label>
                <p className="hint">
                  {remember
                    ? "Credentials will be stored in this browser, unencrypted. Use only on your own device."
                    : "By default, credentials are kept only for this browser tab’s session."}
                </p>
                <button className="primary" disabled={!!busy}>
                  {busy === "provider"
                    ? "Testing connection…"
                    : "Test & connect"}
                </button>
              </form>
              <details>
                <summary>Will my provider work in Safari?</summary>
                <p>
                  Your provider’s API needs HTTPS and CORS permission for this
                  site. Live TV requests HLS (.m3u8). H.264 video with AAC audio
                  has broad compatibility. A static host cannot convert
                  incompatible codecs, add forbidden request headers, or bypass
                  blocked API access. Test & connect verifies API access; actual
                  playback must be tested with a channel.
                </p>
              </details>
            </section>
          </div>
          <div hidden={section !== "addons"}>
            <section className="settings-card">
              <div className="card-heading">
                <Plus />
                <div>
                  <h2>Add-ons</h2>
                  <p>
                    Bring your Stremio catalogs and HTTPS streaming sources.
                  </p>
                </div>
              </div>
              <button
                disabled={!!busy}
                onClick={() =>
                  void run("refresh", async () => {
                    const result = await installMany(
                      props.addons.map((a) => a.base + "/manifest.json"),
                    );
                    props.onAddons(mergeAddons(props.addons, result.addons));
                    setSuccess(
                      result.failed
                        ? `Refreshed ${result.addons.length} manifests; ${result.failed} could not be reached. Existing add-ons were kept.`
                        : "All add-on manifests refreshed.",
                    );
                  })
                }
              >
                Refresh installed manifests
              </button>
              <div className="addon-list">
                {props.addons.map((a) => (
                  <div className="addon" key={a.base}>
                    <div className="addon-symbol">
                      <Globe2 />
                    </div>
                    <div>
                      <strong>{a.manifest.name}</strong>
                      <p>
                        {a.manifest.resources?.some((r) =>
                          typeof r === "string"
                            ? r === "stream"
                            : r.name === "stream",
                        )
                          ? "Streaming enabled"
                          : "Catalog / metadata only"}{" "}
                        ? {a.manifest.catalogs?.length ?? 0} catalogs ·{" "}
                        {(a.manifest.types ?? []).join(", ")}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${a.manifest.name}`}
                      onClick={() =>
                        props.onAddons(
                          props.addons.filter((x) => x.base !== a.base),
                        )
                      }
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const url = String(new FormData(form).get("manifest"));
                  void run("addon", async () => {
                    const addon = await installAddon(url);
                    props.onAddons([
                      ...props.addons.filter((a) => a.base !== addon.base),
                      addon,
                    ]);
                    setSuccess(`${addon.manifest.name} installed.`);
                    form.reset();
                  });
                }}
              >
                <label className="grow">
                  Manifest URL
                  <input
                    name="manifest"
                    placeholder="https://addon.example/manifest.json"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <button disabled={!!busy}>
                  {busy === "addon" ? "Installing…" : "Install add-on"}
                </button>
              </form>
              <details>
                <summary>Install several add-ons from Nuvio</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const input = String(new FormData(form).get("addons"));
                    void run("bulk", async () => {
                      const result = await installMany(addonUrls(input));
                      props.onAddons(mergeAddons(props.addons, result.addons));
                      setSuccess(
                        `${result.addons.length} add-ons installed.${result.failed ? ` ${result.failed} could not be reached. Retry those separately.` : ""}`,
                      );
                      if (!result.failed) form.reset();
                    });
                  }}
                >
                  <label>
                    Manifest URLs or add-ons JSON
                    <textarea
                      name="addons"
                      rows={5}
                      placeholder="One configured manifest URL per line"
                      required
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </label>
                  <button disabled={!!busy}>Install all add-ons</button>
                </form>
              </details>
              <p className="hint">
                Catalogs provide discovery, not video. Install your own
                streaming add-on for playback. Torrentio configured with TorBox
                returns HTTPS streams. Raw torrent results can be resolved with
                your TorBox key above. Native Cloudstream plug-ins cannot run in
                a browser.
              </p>
            </section>
          </div>
          <div hidden={section !== "collections"}>
            <section className="settings-card">
              <h2>TMDB collections</h2>
              <p>
                For streaming-service, studio and network collections. Nuvio
                profile sync imports your existing TMDB key.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const credential = String(
                    new FormData(form).get("tmdb"),
                  ).trim();
                  void run("tmdb", async () => {
                    const { validateTmdbCredential } = await import("./tmdb");
                    await validateTmdbCredential(credential);
                    localStorage.setItem("nuvio:tmdb-key", credential);
                    setSuccess(
                      "TMDB connected. Cast photos and filmographies are ready.",
                    );
                    form.reset();
                  });
                }}
              >
                <label>
                  TMDB API key
                  <input
                    name="tmdb"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
                <button disabled={!!busy}>
                  {busy === "tmdb" ? "Checking…" : "Connect TMDB"}
                </button>
              </form>
            </section>
            <section className="settings-card">
              <h2>Home collections</h2>
              <p>
                Choose which synced collections appear on Home. Hidden
                collections stay in your Nuvio account and can be turned back on
                here.
              </p>
              {props.collections.length ? (
                <div className="setting-list">
                  {props.collections.map((collection) => (
                    <label key={collection.id}>
                      <input
                        type="checkbox"
                        checked={collection.showOnHome !== false}
                        onChange={(event) =>
                          props.onCollections(
                            props.collections.map((item) =>
                              item.id === collection.id
                                ? { ...item, showOnHome: event.target.checked }
                                : item,
                            ),
                          )
                        }
                      />
                      {collection.title}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="hint">
                  Sign in to Nuvio or import collections first.
                </p>
              )}
            </section>
          </div>
          <div hidden={section !== "general"}>
            <DataTools
              addons={props.addons}
              collections={props.collections}
              library={props.library}
              onCollections={props.onCollections}
              onRestore={props.onRestore}
            />
          </div>
          <div hidden={section !== "live"}>
            <section className="settings-card">
              <div className="card-heading">
                <Globe2 />
                <div>
                  <h2>Playlists & direct streams</h2>
                  <p>Open your own M3U playlist or HTTPS video.</p>
                </div>
              </div>
              <label className="button file-button">
                Import M3U playlist
                <input
                  type="file"
                  accept=".m3u,.m3u8,text/plain,audio/x-mpegurl"
                  disabled={!!busy}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void run("playlist", async () => {
                      if (file.size > 15_000_000)
                        throw new Error(
                          "Choose a playlist smaller than 15 MB.",
                        );
                      const text = await file.text();
                      const digest = await crypto.subtle.digest(
                        "SHA-256",
                        new TextEncoder().encode(text),
                      );
                      const scope = Array.from(new Uint8Array(digest))
                        .map((v) => v.toString(16).padStart(2, "0"))
                        .join("");
                      const items = parsePlaylist(text, scope);
                      props.onPlaylist(items);
                      setSuccess(
                        `${items.length.toLocaleString()} HTTPS channels imported for this session.`,
                      );
                    });
                    e.target.value = "";
                  }}
                />
              </label>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const url = safeUrl(
                    new FormData(e.currentTarget).get("stream"),
                  );
                  if (!url) {
                    setError("Use a valid HTTPS video URL.");
                    return;
                  }
                  props.onStream(url);
                }}
              >
                <label className="grow">
                  Video URL
                  <input
                    name="stream"
                    type="url"
                    placeholder="https://example.com/video.m3u8"
                    required
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <button>Open stream</button>
              </form>
            </section>
          </div>
          <div hidden={section !== "general"}>
            <section className="settings-card">
              <h2>Appearance</h2>
              <p>Choose your accent.</p>
              <div className="swatches">
                {[
                  ["Violet", "#9b5cff"],
                  ["Ocean", "#397cff"],
                  ["Rose", "#ff5f9e"],
                  ["Emerald", "#57d67a"],
                  ["Crimson", "#ff5263"],
                ].map(([label, color]) => (
                  <button
                    key={color}
                    className={props.accent === color ? "selected" : ""}
                    onClick={() => props.onAccent(color)}
                    aria-label={`${label} accent`}
                    aria-pressed={props.accent === color}
                  >
                    <span style={{ background: color }} />
                    {label}
                  </button>
                ))}
              </div>
            </section>
            <section className="settings-card">
              <h2>At home on your home screen</h2>
              <p>
                On iPhone or iPad, open this site in Safari, tap Share, then Add
                to Home Screen. The interface is available offline; streaming
                still needs an internet connection.
              </p>
              <h3>About this fork</h3>
              <p>
                An independent GPL-3.0 web adaptation of Nuvio Mobile Enhanced.
                This version supports browser-compatible sources and
                TorBox-backed torrents. Native downloads, direct peer-to-peer
                torrent playback, Trakt sync, and AI features are not included.
              </p>
              <div className="actions">
                <a
                  href={
                    safeUrl(import.meta.env.VITE_SOURCE_URL) ??
                    "https://github.com/yesnt10/NuvioMobile-Enhanced"
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  Source code <ExternalLink size={14} />
                </a>
                <a
                  href={`${import.meta.env.BASE_URL}LICENSE.txt`}
                  target="_blank"
                  rel="noreferrer"
                >
                  GPL-3.0 license <ExternalLink size={14} />
                </a>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
