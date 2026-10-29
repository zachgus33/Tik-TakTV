import ConnectionPanel from "./ConnectionPanel";
import { useEffect, useState } from "react";
import {
  Blocks,
  CheckCircle2,
  ExternalLink,
  Globe2,
  LibraryBig,
  KeyRound,
  Palette,
  PlayCircle,
  Plus,
  Radio,
  ShieldCheck,
  Activity,
  ArrowDown,
  ArrowUp,
  Download,
  LockKeyhole,
  Trash2,
  UsersRound,
} from "lucide-react";
import { connectProvider, installAddon, parsePlaylist, safeUrl } from "./api";
import { storeProvider, save } from "./storage";
import type { Addon, Item, Provider } from "./types";
import { type Collection, type Transfer, addonUrls } from "./collections";
import { installMany, mergeAddons } from "./addon-import";
import { validateTorboxKey } from "./torbox";
import { validateRealDebridKey } from "./realdebrid";
import DataTools from "./DataTools";
import {
  friendAccessStatus,
  publishFriendSetup,
  redeemFriendSetup,
} from "./connection";
import type { HomeCatalogSetting } from "./account";
import CatalogManager from "./CatalogManager";
import CollectionManager from "./CollectionManager";
import HealthPanel from "./HealthPanel";
import DownloadCenter from "./DownloadCenter";
import PrivacyStatus from "./PrivacyStatus";
import { streamPreferences } from "./stream-selection";

export type FriendTemplate = {
  addons: Addon[];
  collections: Collection[];
  autoplay: boolean;
  homeCatalogs: HomeCatalogSetting[];
};

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
  realDebridKey: string;
  onRealDebridKey: (key: string) => void;
  autoplay: boolean;
  onAutoplay: (value: boolean) => void;
  playbackConnected: boolean;
  tmdbKey: string;
  onTmdbKey: (key: string) => void;
  friendTemplate: FriendTemplate;
  onFriendTemplate: (
    template: FriendTemplate,
    torboxKey: string,
  ) => Promise<void>;
  homeCatalogs: HomeCatalogSetting[];
  onHomeCatalogs: (value: HomeCatalogSetting[]) => void;
};
type SettingsSection =
  | "addons"
  | "collections"
  | "live"
  | "playback"
  | "health"
  | "downloads"
  | "privacy"
  | "general";

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
    description: "Player and debrid",
    icon: PlayCircle,
  },
  {
    id: "general",
    label: "General",
    description: "Appearance and data",
    icon: Palette,
  },
  {
    id: "health",
    label: "Health check",
    description: "Connections and codecs",
    icon: Activity,
  },
  {
    id: "downloads",
    label: "Downloads",
    description: "Activity and history",
    icon: Download,
  },
  {
    id: "privacy",
    label: "Privacy & status",
    description: "Data and services",
    icon: LockKeyhole,
  },
] as const;
export default function Settings(props: Props) {
  const [section, setSection] = useState<SettingsSection>("addons");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [remember, setRemember] = useState(false);
  const [sourcePreferences, setSourcePreferences] = useState(streamPreferences);
  const [friendStatus, setFriendStatus] = useState<{
    available: boolean;
    owner: boolean;
  } | null>(null);
  useEffect(() => {
    if (!props.playbackConnected) {
      setFriendStatus(null);
      return;
    }
    void friendAccessStatus()
      .then(setFriendStatus)
      .catch(() => setFriendStatus(null));
  }, [props.playbackConnected]);
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
              <div className="card-heading">
                <UsersRound />
                <div>
                  <h2>Friend setup</h2>
                  <p>Install the owner’s complete streaming configuration.</p>
                </div>
                {friendStatus?.available && (
                  <span className="badge connected">Available</span>
                )}
              </div>
              <p>
                Enter the private code to copy every configured add-on, catalog
                order, collection, filter, and playback preference to this Nuvio
                profile. TorBox access is granted through the encrypted TikTak
                TV service without revealing the owner key.
              </p>
              <form
                className="inline-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const code = String(new FormData(form).get("friendCode"));
                  void run("friend-redeem", async () => {
                    const result = await redeemFriendSetup<FriendTemplate>(
                      code.trim(),
                    );
                    await props.onFriendTemplate(
                      result.template,
                      result.torboxKey,
                    );
                    form.reset();
                    setSuccess(
                      "Friend setup installed and saved to this Nuvio profile.",
                    );
                  });
                }}
              >
                <label className="grow">
                  Friend code
                  <input
                    name="friendCode"
                    inputMode="numeric"
                    pattern="[0-9]{6,12}"
                    autoComplete="one-time-code"
                    placeholder="6–12 digit code"
                    required
                  />
                </label>
                <button disabled={!!busy || !props.playbackConnected}>
                  <KeyRound size={18} />
                  {busy === "friend-redeem" ? "Installing…" : "Install setup"}
                </button>
              </form>
              {!props.playbackConnected && (
                <p className="hint">
                  Connect the TikTak TV playback service above before entering a
                  friend code.
                </p>
              )}
              {friendStatus?.owner && (
                <details>
                  <summary>Owner controls</summary>
                  <p className="hint">
                    Publishing replaces the shared template and friend code.
                    Personal library items, watch history, profiles, and IPTV
                    credentials are excluded.
                  </p>
                  <form
                    className="inline-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const form = event.currentTarget;
                      const code = String(
                        new FormData(form).get("ownerFriendCode"),
                      ).trim();
                      void run("friend-publish", async () => {
                        const result = await publishFriendSetup(
                          code,
                          props.torboxKey,
                          props.friendTemplate as unknown as Record<
                            string,
                            unknown
                          >,
                        );
                        localStorage.removeItem("nuvio:torbox-key");
                        sessionStorage.removeItem("nuvio:torbox-key");
                        save("torbox-key", result.torboxKey);
                        props.onTorboxKey(result.torboxKey);
                        setFriendStatus({ available: true, owner: true });
                        form.reset();
                        setSuccess(
                          "Friend code updated with your current add-ons and catalog setup.",
                        );
                      });
                    }}
                  >
                    <label className="grow">
                      New friend code
                      <input
                        name="ownerFriendCode"
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]{6,12}"
                        autoComplete="new-password"
                        required
                      />
                    </label>
                    <button disabled={!!busy || !props.torboxKey}>
                      {busy === "friend-publish"
                        ? "Encrypting…"
                        : "Publish current setup"}
                    </button>
                  </form>
                  {!props.torboxKey && (
                    <p className="hint">
                      Connect your TorBox key below before publishing.
                    </p>
                  )}
                </details>
              )}
            </section>
            <section className="settings-card">
              <h2>Debrid playback</h2>
              <p>
                Install any compatible Stremio streaming add-on below. Connect
                your own TorBox or Real-Debrid key here so cached torrent
                results can be resolved securely for browser playback.
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
              <details className="source-preferences">
                <summary>Advanced source controls</summary>
                <div className="form-grid">
                  <label>
                    Maximum quality
                    <select
                      value={sourcePreferences.maxQuality}
                      onChange={(event) =>
                        setSourcePreferences((current) => ({
                          ...current,
                          maxQuality: Number(event.target.value),
                        }))
                      }
                    >
                      <option value="720">720p</option>
                      <option value="1080">1080p</option>
                      <option value="1440">1440p</option>
                      <option value="2160">4K</option>
                      <option value="4320">8K / no practical limit</option>
                    </select>
                  </label>
                  <label>
                    Maximum file size (GB, 0 for unlimited)
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={sourcePreferences.maxSizeGb}
                      onChange={(event) =>
                        setSourcePreferences((current) => ({
                          ...current,
                          maxSizeGb: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Codec preference
                    <select
                      value={sourcePreferences.codec}
                      onChange={(event) =>
                        setSourcePreferences((current) => ({
                          ...current,
                          codec: event.target.value === "h264" ? "h264" : "any",
                        }))
                      }
                    >
                      <option value="any">Any compatible codec</option>
                      <option value="h264">H.264 / AVC only</option>
                    </select>
                  </label>
                  <label>
                    Excluded terms (comma separated)
                    <input
                      value={sourcePreferences.excludedTerms.join(", ")}
                      placeholder="CAM, telesync, dubbed"
                      onChange={(event) =>
                        setSourcePreferences((current) => ({
                          ...current,
                          excludedTerms: event.target.value
                            .split(",")
                            .map((term) => term.trim())
                            .filter(Boolean),
                        }))
                      }
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(
                      "tiktak:stream-preferences",
                      JSON.stringify(sourcePreferences),
                    );
                    setSuccess(
                      "Source preferences saved for this browser profile.",
                    );
                  }}
                >
                  Save source controls
                </button>
                <p className="hint">
                  Ranking remains quality first and seeders second within these
                  limits. H.264 is the safest option for Safari and older TVs.
                </p>
              </details>
              {props.realDebridKey && (
                <div className="connection">
                  <strong>Real-Debrid connected</strong>
                  <button
                    onClick={() => {
                      localStorage.removeItem("nuvio:realdebrid-key");
                      sessionStorage.removeItem("nuvio:realdebrid-key");
                      props.onRealDebridKey("");
                    }}
                  >
                    Disconnect Real-Debrid
                  </button>
                </div>
              )}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const values = new FormData(form);
                  const key = String(values.get("realdebrid")).trim();
                  void run("realdebrid", async () => {
                    await validateRealDebridKey(key);
                    localStorage.removeItem("nuvio:realdebrid-key");
                    sessionStorage.removeItem("nuvio:realdebrid-key");
                    if (
                      !save(
                        "realdebrid-key",
                        key,
                        values.get("rememberRealDebrid")
                          ? localStorage
                          : sessionStorage,
                      )
                    )
                      throw new Error(
                        "Could not save the connection in this browser.",
                      );
                    props.onRealDebridKey(key);
                    form.reset();
                    setSuccess(
                      "Real-Debrid connected. Cached torrent results can now play.",
                    );
                  });
                }}
              >
                <label className="grow">
                  Real-Debrid API key
                  <input
                    name="realdebrid"
                    type="password"
                    autoComplete="off"
                    required
                    placeholder="From your Real-Debrid account settings"
                  />
                </label>
                <label className="check">
                  <input name="rememberRealDebrid" type="checkbox" />
                  Remember key on this device
                </label>
                <button disabled={!!busy}>
                  {busy === "realdebrid"
                    ? "Connecting…"
                    : "Connect Real-Debrid"}
                </button>
              </form>
              <p className="hint">
                TikTak TV only requests cached torrent files and secure download
                links. Your key belongs to your Nuvio setup and is never shared
                with unrelated site visitors.
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
                2160p/4K, 4320p/8K). The highest quality wins, then the highest
                reported seeder count. Episode files must match the selected
                season and episode. Unknown quality or ambiguous files stay in
                the picker. Safari may still require a tap on its video play
                button.
              </p>
            </section>
          </div>
          {section === "health" && (
            <HealthPanel
              addons={props.addons}
              torboxKey={props.torboxKey}
              realDebridKey={props.realDebridKey}
              provider={props.provider}
            />
          )}
          {section === "downloads" && <DownloadCenter />}
          {section === "privacy" && <PrivacyStatus />}
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
                {props.addons.map((a, index) => (
                  <div
                    className="addon"
                    key={a.base}
                    draggable
                    onDragStart={(event) =>
                      event.dataTransfer.setData(
                        "text/addon-index",
                        String(index),
                      )
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(
                        event.dataTransfer.getData("text/addon-index"),
                      );
                      if (!Number.isInteger(from) || from === index) return;
                      const next = [...props.addons];
                      const [moved] = next.splice(from, 1);
                      next.splice(index, 0, moved);
                      props.onAddons(next);
                    }}
                  >
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
                          ? "Streaming source"
                          : a.manifest.resources?.some(
                                (r) =>
                                  (typeof r === "string" ? r : r.name) ===
                                  "subtitles",
                              )
                            ? "Subtitle provider"
                            : "Catalog / metadata only"}{" "}
                        · {a.manifest.catalogs?.length ?? 0} catalogs ·{" "}
                        {(a.manifest.types ?? []).join(", ")}
                      </p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label={`${a.enabled === false ? "Enable" : "Disable"} ${a.manifest.name}`}
                      onClick={() =>
                        props.onAddons(
                          props.addons.map((addon, addonIndex) =>
                            addonIndex === index
                              ? { ...addon, enabled: addon.enabled === false }
                              : addon,
                          ),
                        )
                      }
                    >
                      {a.enabled === false ? "Off" : "On"}
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === 0}
                      aria-label={`Move ${a.manifest.name} up`}
                      onClick={() => {
                        const next = [...props.addons];
                        [next[index - 1], next[index]] = [
                          next[index],
                          next[index - 1],
                        ];
                        props.onAddons(next);
                      }}
                    >
                      <ArrowUp size={18} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={index === props.addons.length - 1}
                      aria-label={`Move ${a.manifest.name} down`}
                      onClick={() => {
                        const next = [...props.addons];
                        [next[index], next[index + 1]] = [
                          next[index + 1],
                          next[index],
                        ];
                        props.onAddons(next);
                      }}
                    >
                      <ArrowDown size={18} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!!busy}
                      aria-label={`Test ${a.manifest.name}`}
                      onClick={() =>
                        void run(`test-${index}`, async () => {
                          await installAddon(`${a.base}/manifest.json`);
                          setSuccess(`${a.manifest.name} is reachable.`);
                        })
                      }
                    >
                      <Activity size={18} />
                    </button>
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
            <CollectionManager
              collections={props.collections}
              onChange={props.onCollections}
              addons={props.addons}
              library={props.library}
            />
            <details className="advanced-catalog-settings">
              <summary>Advanced add-on Home rows</summary>
              <CatalogManager
                addons={props.addons}
                value={props.homeCatalogs}
                onChange={props.onHomeCatalogs}
              />
            </details>
            <section className="settings-card">
              <h2>TMDB collections</h2>
              <p>
                For streaming-service, studio and network collections. Nuvio
                profile sync can override TikTak TV's shared TMDB connection.
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
                    props.onTmdbKey(credential);
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
                    defaultValue={props.tmdbKey}
                    autoComplete="off"
                    required
                  />
                </label>
                <button disabled={!!busy}>
                  {busy === "tmdb" ? "Checking…" : "Connect TMDB"}
                </button>
              </form>
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
