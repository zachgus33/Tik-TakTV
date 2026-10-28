import {
  getService,
  prepareDownload,
  refreshPlaybackEndpoint,
} from "./connection";
import { storeProvider } from "./storage";
import {
  account,
  loadSetup,
  ensureProfiles,
  unlock,
  type HomeCatalogSetting,
  type Profile,
  type Setup,
} from "./account";
import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Dices,
  Download,
  Film,
  Heart,
  Home,
  Library,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  UserRound,
  Sparkles,
  Star,
  Tv,
  Trash2,
  X,
} from "lucide-react";
import {
  addonDetail,
  addonStreams,
  catalog,
  categories,
  defaultAddon,
  defaultAddons,
  epg,
  providerDetail,
  providerItems,
  safeUrl,
  streamUrl,
} from "./api";
import { readLiveCache, writeLiveCache } from "./live-cache";
import { cleanItem, getProvider, read, save, useStored } from "./storage";
import {
  itemKey,
  type Addon,
  type Category,
  type Episode,
  type Item,
  type Kind,
  type Programme,
  type Progress,
  type Provider,
  type Stream,
} from "./types";
import type { Playback } from "./Player";
import { useGuide } from "./useGuide";
import {
  type Collection,
  type Transfer,
  mergeCollections,
  mergeItems,
} from "./collections";
import { installMany, mergeAddons } from "./addon-import";
import { prepareTorbox, torboxLink, type TorboxFile } from "./torbox";
import { resolveRealDebrid } from "./realdebrid";
import { DEFAULT_TMDB_KEY } from "./config";
import {
  autoplayStreams,
  compatibilityPlaybackMode,
  directStream,
  debridStream,
  needsCompatibilityTranscode,
  rankedStreams,
  streamQuality,
  seeders,
} from "./stream-selection";
import type { FriendTemplate } from "./Settings";
import { settingMatchesChoice } from "./catalog-settings";
import { joinParty } from "./watch-party";

const Player = lazy(() => import("./Player"));
const Settings = lazy(() => import("./Settings"));

const futureAvailability = new Map<string, boolean>();

async function hideUnavailableFutureTitles(
  rows: { title: string; items: Item[] }[],
  addons: Addon[],
  signal: AbortSignal,
) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const candidates = rows
    .flatMap((row) => row.items)
    .filter((item) => {
      const year = Number.parseInt(item.year ?? "", 10);
      return Number.isFinite(year) && year >= currentYear;
    });
  for (let offset = 0; offset < candidates.length; offset += 6) {
    await Promise.allSettled(
      candidates.slice(offset, offset + 6).map(async (original) => {
        const key = itemKey(original);
        if (futureAvailability.has(key) || signal.aborted) return;
        let item = original;
        if (!item.released && Number(item.year) === currentYear)
          item = (await addonDetail(item, signal)).item;
        const released = item.released ? new Date(item.released) : null;
        const isFuture = released
          ? Number.isFinite(released.valueOf()) && released > now
          : Number(item.year) > currentYear;
        if (!isFuture) {
          futureAvailability.set(key, true);
          return;
        }
        const result = await addonStreams(addons, item, item.id, signal);
        futureAvailability.set(key, result.streams.length > 0);
      }),
    );
  }
  return rows.map((row) => ({
    ...row,
    items: row.items.filter(
      (item) => futureAvailability.get(itemKey(item)) !== false,
    ),
  }));
}

const liveRegions = [
  ["US", "ðŸ‡ºðŸ‡¸", "United States", /^(US)\||UNITED STATES/i],
  ["CA", "ðŸ‡¨ðŸ‡¦", "Canada", /^(CA)\||CANADA/i],
  ["GB", "ðŸ‡¬ðŸ‡§", "United Kingdom", /^(UK)\||UNITED KINGDOM/i],
  ["IE", "ðŸ‡®ðŸ‡ª", "Ireland", /^(IR)\|.*IRELAND|IRELAND/i],
  ["FR", "ðŸ‡«ðŸ‡·", "France", /^(FR)\||FRANCE/i],
  ["ES", "ðŸ‡ªðŸ‡¸", "Spain", /^(ES)\||SPAIN|ESPAÃ‘A/i],
  ["DE", "ðŸ‡©ðŸ‡ª", "Germany", /^(DE)\||GERMANY/i],
  ["IT", "ðŸ‡®ðŸ‡¹", "Italy", /^(IT)\||ITALY/i],
  ["PT", "ðŸ‡µðŸ‡¹", "Portugal", /^(PT)\||PORTUGAL/i],
  ["NL", "ðŸ‡³ðŸ‡±", "Netherlands", /^(NL)\||NETHERLAND/i],
  ["BE", "ðŸ‡§ðŸ‡ª", "Belgium", /^(BE)\||BELGIUM/i],
  ["CH", "ðŸ‡¨ðŸ‡­", "Switzerland", /^(CH)\||SWITZERLAND/i],
  ["AT", "ðŸ‡¦ðŸ‡¹", "Austria", /^(AT)\||AUSTRIA/i],
  ["PL", "ðŸ‡µðŸ‡±", "Poland", /^(PL)\||POLAND/i],
  ["GR", "ðŸ‡¬ðŸ‡·", "Greece", /^(GR)\||GREECE/i],
  ["CZ", "ðŸ‡¨ðŸ‡¿", "Czechia", /^(CZ)\||CZECH/i],
  ["SE", "ðŸ‡¸ðŸ‡ª", "Sweden", /^SWEDEN|SWEDEN/i],
  ["NO", "ðŸ‡³ðŸ‡´", "Norway", /^NORWAY|NORWAY/i],
  ["DK", "ðŸ‡©ðŸ‡°", "Denmark", /^DENMARK|DENMARK/i],
  ["FI", "ðŸ‡«ðŸ‡®", "Finland", /^(FI)\||FINLAND/i],
  ["AU", "ðŸ‡¦ðŸ‡º", "Australia", /^(AU)\||AUSTRALIA/i],
  ["NZ", "ðŸ‡³ðŸ‡¿", "New Zealand", /^(NZ)\||NEW ZEALAND/i],
  ["BR", "ðŸ‡§ðŸ‡·", "Brazil", /^(BR)\||BRAZIL/i],
  ["TR", "ðŸ‡¹ðŸ‡·", "TÃ¼rkiye", /^(TR)\||TURK/i],
  ["IL", "ðŸ‡®ðŸ‡±", "Israel", /^(IS)\||ISRAEL/i],
  ["IN", "ðŸ‡®ðŸ‡³", "India", /^ASIA\s*\|.*INDIA|INDIA/i],
] as const;

function liveRegion(name: string) {
  return liveRegions.find(([, , , pattern]) => pattern.test(name))?.[0] ?? "";
}

function ProfileGate({
  onEnter,
  onGuest,
  skipSelection,
}: {
  onEnter: (setup: Setup, profile: Profile) => void;
  onGuest: () => void;
  skipSelection: boolean;
}) {
  const [list, setList] = useState<Profile[]>([]);
  const [email, setEmail] = useState("");
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  async function refresh() {
    const { data } = await account.auth.getSession();
    if (!data.session) {
      setEmail("");
      if (localStorage.getItem("tiktak:established-local") === "1") onGuest();
      return;
    }
    setEmail(data.session?.user.email ?? "");
    const available = data.session ? await ensureProfiles() : [];
    setList(available);
    if (data.session && skipSelection) {
      const remembered = Number(
        localStorage.getItem(`tiktak:profile:${data.session.user.id}`),
      );
      const preferred =
        available.find((item) => item.profile_index === remembered) ??
        available.find((item) => !item.pin_enabled);
      if (preferred && !preferred.pin_enabled) await enter(preferred);
    }
  }
  useEffect(() => {
    void refresh()
      .catch((e) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);
  async function enter(profile: Profile, pin = "") {
    setBusy(true);
    setError("");
    try {
      await unlock(profile, pin);
      const result = await loadSetup(profile);
      const { data } = await account.auth.getSession();
      if (data.session)
        localStorage.setItem(
          `tiktak:profile:${data.session.user.id}`,
          String(profile.profile_index),
        );
      sessionStorage.setItem("tiktak:profile-active", "1");
      onEnter(result.setup, profile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this profile.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="profile-gate">
      <div className="profile-gate-brand">
        TikTak TV<small>STREAM YOUR WORLD</small>
      </div>
      <section>
        <h1>{email ? "Who's watching?" : "Your entertainment, your way"}</h1>
        {!email && (
          <p className="profile-gate-intro">
            Sign in to restore your profiles and add-ons, or create a free Nuvio
            account to get started.
          </p>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="success" role="status">
            {notice}
          </div>
        )}
        {busy && !list.length ? (
          <Loading />
        ) : email ? (
          <>
            <div className="profile-choices">
              {list.map((profile, index) => (
                <button
                  key={profile.profile_index}
                  onClick={() =>
                    profile.pin_enabled
                      ? setPinProfile(profile)
                      : void enter(profile)
                  }
                  disabled={busy}
                >
                  <span
                    style={
                      {
                        "--profile-hue": `${(index * 83 + 275) % 360}`,
                      } as React.CSSProperties
                    }
                  >
                    {profile.name.trim().slice(0, 1).toUpperCase()}
                  </span>
                  <strong>{profile.name}</strong>
                  {profile.pin_enabled && <small>PIN required</small>}
                </button>
              ))}
            </div>
            {pinProfile && (
              <form
                className="profile-pin"
                onSubmit={(e) => {
                  e.preventDefault();
                  const pin = String(
                    new FormData(e.currentTarget).get("pin") ?? "",
                  );
                  void enter(pinProfile, pin);
                }}
              >
                <label>
                  Enter PIN for {pinProfile.name}
                  <input
                    autoFocus
                    name="pin"
                    type="password"
                    inputMode="numeric"
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Open profile
                </button>
                <button type="button" onClick={() => setPinProfile(null)}>
                  Cancel
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="profile-auth-card">
            <div
              className="profile-auth-tabs"
              role="tablist"
              aria-label="Account action"
            >
              <button
                type="button"
                className={authMode === "signin" ? "active" : ""}
                onClick={() => {
                  setAuthMode("signin");
                  setError("");
                  setNotice("");
                }}
              >
                Sign in
              </button>
              <button
                type="button"
                className={authMode === "signup" ? "active" : ""}
                onClick={() => {
                  setAuthMode("signup");
                  setError("");
                  setNotice("");
                }}
              >
                Create account
              </button>
            </div>
            <form
              className="profile-login"
              onSubmit={(e) => {
                e.preventDefault();
                const form = new FormData(e.currentTarget);
                const password = String(form.get("password") ?? "");
                if (
                  authMode === "signup" &&
                  password !== String(form.get("confirmPassword") ?? "")
                ) {
                  setError("Passwords do not match.");
                  return;
                }
                setBusy(true);
                setError("");
                setNotice("");
                const request =
                  authMode === "signup"
                    ? account.auth.signUp({
                        email: String(form.get("email") ?? "").trim(),
                        password,
                      })
                    : account.auth.signInWithPassword({
                        email: String(form.get("email") ?? "").trim(),
                        password,
                      });
                void request
                  .then(({ data, error }) => {
                    if (error) throw error;
                    if (authMode === "signup" && !data.session) {
                      setNotice(
                        "Account created. Check your email to confirm it, then sign in.",
                      );
                      setAuthMode("signin");
                      return;
                    }
                    return refresh();
                  })
                  .catch((e) => setError(e.message))
                  .finally(() => setBusy(false));
              }}
            >
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    authMode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={authMode === "signup" ? 8 : undefined}
                  required
                />
              </label>
              {authMode === "signup" && (
                <label>
                  Confirm password
                  <input
                    name="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </label>
              )}
              <button className="primary" disabled={busy}>
                {busy
                  ? "Please waitâ€¦"
                  : authMode === "signup"
                    ? "Create free account"
                    : "Sign in"}
              </button>
              {authMode === "signup" && (
                <p className="profile-auth-note">
                  Your account starts with Nuvio Catalog Addon, English
                  subtitles from OpenSubtitles v3, and shared TMDB metadata. Add
                  your preferred streaming source in Settings when you are ready
                  to watch.
                </p>
              )}
            </form>
          </div>
        )}
      </section>
    </main>
  );
}
const HomeCollections = lazy(() => import("./HomeCollections"));
const AccountPanel = lazy(() => import("./AccountPanel"));
type Page = "home" | "discover" | "live" | "library" | "account" | "settings";
const nav = [
  { id: "home", label: "Home", icon: Home },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "live", label: "Live TV", icon: Radio },
  { id: "library", label: "My library", icon: Library },
  { id: "account", label: "Account", icon: UserRound },
] as const;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "The source could not be loaded.";

function Art({
  item,
  wide = false,
  priority = false,
}: {
  item: Item;
  wide?: boolean;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = wide ? (item.background ?? item.poster) : item.poster;
  return src && !failed ? (
    <img
      src={src}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className={`art-fallback ${item.type === "live" ? "channel-art-fallback" : ""}`}
      aria-hidden="true"
    >
      {item.type === "live" ? <Tv /> : <Film />}
      <span>
        {item.type === "live"
          ? item.name
              .replace(/^\s*[^|]+\|\s*/, "")
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((word) => word[0])
              .join("")
              .toUpperCase()
          : item.name}
      </span>
    </div>
  );
}
function Card({
  item,
  onOpen,
  progress,
}: {
  item: Item;
  onOpen: (item: Item) => void;
  progress?: Progress;
}) {
  return (
    <button
      className={`media-card ${progress ? "continue-card" : ""}`}
      onClick={() => onOpen(item)}
    >
      <div className="poster">
        <Art item={item} wide={!!progress} />
        <span className="play-hover">
          <Play fill="currentColor" />
        </span>
        {item.rating && (
          <span className="rating">
            <Star size={11} fill="currentColor" />
            {Number(item.rating).toFixed(1)}
          </span>
        )}
        {progress && (
          <span className="progress-track">
            <span
              style={{
                width: `${Math.min(100, (progress.seconds / progress.duration) * 100)}%`,
              }}
            />
          </span>
        )}
      </div>
      <strong>{item.name}</strong>
      <span className="card-meta">
        {progress
          ? `${Math.max(1, Math.round((progress.duration - progress.seconds) / 60))} min left`
          : [
              item.year,
              item.type === "series"
                ? "Series"
                : item.type === "live"
                  ? "Live TV"
                  : "Movie",
            ]
              .filter(Boolean)
              .join(" Â· ")}
      </span>
    </button>
  );
}
function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Clapperboard />
      </div>
      <h2>{title}</h2>
      <p>{text}</p>
      {action && (
        <button className="primary" onClick={onAction}>
          <Plus size={18} />
          {action}
        </button>
      )}
    </div>
  );
}
function Loading() {
  return (
    <div className="loading" role="status">
      <span className="spinner" />
      Loading your libraryâ€¦
    </div>
  );
}
function Detail({
  initial,
  provider,
  addons,
  saved,
  toggleSave,
  onClose,
  onPlay,
  onSelectItem,
  onRemoveProgress,
  resume,
  torboxKey,
  realDebridKey,
  autoplay,
}: {
  initial: Item;
  provider: Provider | null;
  addons: Addon[];
  saved: boolean;
  toggleSave: (item: Item) => void;
  onClose: () => void;
  onPlay: (p: Playback) => void;
  onSelectItem: (item: Item) => void;
  onRemoveProgress: (item: Item) => void;
  resume?: Progress;
  torboxKey: string;
  realDebridKey: string;
  autoplay: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [item, setItem] = useState(initial);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [episode, setEpisode] = useState<Episode>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [streamsLoaded, setStreamsLoaded] = useState(false);
  const [downloadMode, setDownloadMode] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [credits, setCredits] = useState<import("./tmdb").Credit[]>([]);
  const [person, setPerson] = useState<{ name: string; items: Item[] } | null>(
    null,
  );
  const [files, setFiles] = useState<{
    torrentId: number;
    files: TorboxFile[];
    episode?: Episode;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const pendingDownloadWindow = useRef<Window | null>(null);
  const streamRequests = useRef(
    new Map<string, ReturnType<typeof addonStreams>>(),
  );
  function requestStreams(target: Item, id: string, signal?: AbortSignal) {
    const key = `${target.type}:${id}`;
    const existing = streamRequests.current.get(key);
    if (existing) return existing;
    const request = addonStreams(addons, target, id, signal).catch((error) => {
      streamRequests.current.delete(key);
      throw error;
    });
    streamRequests.current.set(key, request);
    return request;
  }
  useEffect(() => {
    ref.current?.showModal();
    const c = new AbortController();
    const request =
      initial.source === "addon"
        ? addonDetail(initial, c.signal).catch((error) => {
            if (
              c.signal.aborted ||
              initial.provider === defaultAddon.base ||
              !/^(?:tt\d+|tmdb:\d+)$/.test(initial.id)
            )
              throw error;
            return addonDetail(
              { ...initial, provider: defaultAddon.base },
              c.signal,
            );
          })
        : provider && provider.scope === initial.provider
          ? providerDetail(provider, initial, c.signal)
          : Promise.resolve({ item: initial, episodes: [] });
    request
      .then((result) => {
        setItem(result.item);
        setEpisodes(result.episodes);
        setSeason(result.episodes[0]?.season ?? null);
        if (result.item.source === "addon") {
          const preloadId =
            result.item.type === "movie" ? result.item.id : resume?.episode?.id;
          if (preloadId)
            void requestStreams(result.item, preloadId, c.signal).catch(
              () => undefined,
            );
        }
        if (result.item.type !== "live")
          void import("./tmdb")
            .then(async ({ peopleByName, titleCredits }) => {
              const rows = await titleCredits(result.item, c.signal).catch(
                () => [],
              );
              return rows.length || !result.item.cast?.length
                ? rows
                : peopleByName(result.item.cast, c.signal);
            })
            .then((rows) => {
              if (!c.signal.aborted) setCredits(rows);
            })
            .catch(() => undefined);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(message(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setBusy(false);
      });
    return () => {
      c.abort();
      controller.current?.abort();
    };
  }, [initial, provider]);
  async function chooseStream(
    stream: Stream,
    ep?: Episode,
    signal?: AbortSignal,
  ) {
    setError("");
    setFiles(null);
    const position =
      resume?.episode?.id === ep?.id ? resume?.seconds : undefined;
    if (directStream(stream)) {
      const compatibilityMode = getService()
        ? compatibilityPlaybackMode(stream)
        : undefined;
      onPlay({
        item,
        episode: ep,
        url: stream.url!,
        resume: position,
        mode: compatibilityMode,
        requestHeaders: (
          stream.behaviorHints?.proxyHeaders as
            { request?: Record<string, string> } | undefined
        )?.request,
        subtitleRequest: { addons, id: ep?.id ?? item.id },
        relay: debridStream(stream),
      });
      return;
    }
    if (!torboxKey && !realDebridKey)
      throw new Error(
        "Connect TorBox or Real-Debrid in Settings, or install a debrid-configured streaming add-on.",
      );
    if (!torboxKey) {
      const resolved = await resolveRealDebrid(
        realDebridKey,
        stream,
        ep,
        signal,
      );
      if (!signal?.aborted)
        onPlay({
          item,
          episode: ep,
          url: resolved.url,
          resume: position,
          subtitleRequest: { addons, id: ep?.id ?? item.id },
          mode:
            getService() && !/\.(?:mp4|m4v|webm)$/i.test(resolved.filename)
              ? "transcode"
              : undefined,
          relay: true,
        });
      return;
    }
    const prepared = await prepareTorbox(torboxKey, stream, ep, signal);
    if (signal?.aborted) return;
    if (!prepared.selected) {
      setFiles({ ...prepared, episode: ep });
      return;
    }
    const url = await torboxLink(
      torboxKey,
      prepared.torrentId,
      prepared.selected.id,
      signal,
    );
    if (!signal?.aborted) {
      const compatibilityMode =
        getService() && !/\.(?:mp4|m4v|webm)$/i.test(prepared.selected.name)
          ? "transcode"
          : undefined;
      onPlay({
        item,
        episode: ep,
        url,
        resume: position,
        subtitleRequest: { addons, id: ep?.id ?? item.id },
        mode: compatibilityMode,
      });
    }
  }
  function downloadFilename(ep?: Episode) {
    const clean = (value: string) =>
      value
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const suffix = ep
      ? ` - S${String(ep.season).padStart(2, "0")}E${String(ep.episode).padStart(2, "0")} - ${ep.name}`
      : "";
    return `${clean(item.name + suffix) || "TikTak TV download"}.mp4`;
  }
  async function startDownload(
    url: string,
    ep?: Episode,
    headers?: Record<string, string>,
    signal?: AbortSignal,
  ) {
    const filename = downloadFilename(ep);
    const downloadUrl = await prepareDownload(url, filename, headers, signal);
    if (signal?.aborted) return;
    const reservedWindow = pendingDownloadWindow.current;
    pendingDownloadWindow.current = null;
    if (reservedWindow && !reservedWindow.closed) {
      reservedWindow.location.replace(downloadUrl);
      setDownloadMode(false);
      return;
    }
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
    setDownloadMode(false);
  }
  async function chooseDownload(
    stream: Stream,
    ep?: Episode,
    signal?: AbortSignal,
  ) {
    setError("");
    setFiles(null);
    if (directStream(stream)) {
      await startDownload(
        stream.url!,
        ep,
        (
          stream.behaviorHints?.proxyHeaders as
            { request?: Record<string, string> } | undefined
        )?.request,
        signal,
      );
      return;
    }
    if (!torboxKey && !realDebridKey)
      throw new Error(
        "Connect TorBox or Real-Debrid in Settings, or choose an HTTPS stream from an installed add-on.",
      );
    if (!torboxKey) {
      const resolved = await resolveRealDebrid(
        realDebridKey,
        stream,
        ep,
        signal,
      );
      await startDownload(resolved.url, ep, undefined, signal);
      return;
    }
    const prepared = await prepareTorbox(torboxKey, stream, ep, signal);
    if (signal?.aborted) return;
    if (!prepared.selected) {
      setFiles({ ...prepared, episode: ep });
      return;
    }
    const url = await torboxLink(
      torboxKey,
      prepared.torrentId,
      prepared.selected.id,
      signal,
    );
    await startDownload(url, ep, undefined, signal);
  }
  async function manualStream(stream: Stream) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    try {
      if (downloadMode) await chooseDownload(stream, episode, c.signal);
      else await chooseStream(stream, episode, c.signal);
    } catch (e) {
      if (!c.signal.aborted) setError(message(e));
    } finally {
      if (!c.signal.aborted) setBusy(false);
    }
  }
  async function play(ep?: Episode, auto = autoplay, downloadBest = false) {
    setEpisode(ep);
    setError("");
    setStreams([]);
    setStreamsLoaded(false);
    setFiles(null);
    const position =
      resume && resume.episode?.id === ep?.id ? resume?.seconds : undefined;
    if (item.source === "xtream") {
      if (!provider || provider.scope !== item.provider) {
        setError("Connect the IPTV account for this title in Settings.");
        return;
      }
      onPlay({
        item,
        episode: ep,
        resume: position,
        mode: item.type === "live" && getService() ? "transcode" : undefined,
        hls: item.type === "live",
        url: streamUrl(
          provider,
          item.type,
          ep?.id ?? item.id,
          item.type === "live" && !getService()
            ? "m3u8"
            : (ep?.extension ?? item.extension),
        ),
      });
      return;
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setPreparing(auto || downloadBest);
    try {
      const result = await requestStreams(item, ep?.id ?? item.id, c.signal);
      if (c.signal.aborted) return;
      const hasDebrid = !!torboxKey || !!realDebridKey;
      const ranked = rankedStreams(result.streams, hasDebrid);
      const autoplayRanked = autoplayStreams(result.streams, hasDebrid);
      if (downloadBest) {
        if (ranked.length) await chooseDownload(ranked[0], ep, c.signal);
        else setDownloadMode(false);
      } else {
        if (auto && autoplayRanked.length) {
          try {
            await chooseStream(autoplayRanked[0], ep, c.signal);
          } catch (error) {
            if (!c.signal.aborted) {
              setStreams(result.streams);
              setStreamsLoaded(true);
            }
            throw error;
          }
        } else {
          setStreams(result.streams);
          setStreamsLoaded(true);
        }
      }
      if (!result.count)
        setError(
          result.installedStreaming
            ? "Your streaming add-ons do not support this title ID. Try the title from an IMDb-based catalog or refresh your installed manifests in Settings."
            : "No streaming add-on is installed in this browser profile. Sign in to Nuvio to sync your add-ons, or install a configured manifest in Settings. Localhost and your website have separate settings.",
        );
      else if (result.failed && !ranked.length)
        setError(
          `${result.failed} add-on${result.failed === 1 ? "" : "s"} could not be reached. Other results are shown below.`,
        );
    } catch (e) {
      if (!c.signal.aborted) {
        if (downloadBest) {
          setDownloadMode(false);
          pendingDownloadWindow.current?.close();
          pendingDownloadWindow.current = null;
        }
        setError(message(e));
      }
    } finally {
      if (!c.signal.aborted) {
        setBusy(false);
        setPreparing(false);
      }
    }
  }
  function download(ep?: Episode) {
    setDownloadMode(true);
    if (item.type === "series" && !ep) {
      setError(
        "Choose an episode below. TikTak TV will download its best available stream.",
      );
      return;
    }
    const appleTouchBrowser =
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (appleTouchBrowser) {
      pendingDownloadWindow.current?.close();
      pendingDownloadWindow.current = window.open("about:blank", "_blank");
      if (pendingDownloadWindow.current) {
        pendingDownloadWindow.current.opener = null;
        pendingDownloadWindow.current.document.title = "Preparing download";
        pendingDownloadWindow.current.document.body.textContent =
          "TikTak TV is preparing your MP4 download…";
      }
    }
    void play(ep, false, true);
  }
  const seasons = [...new Set(episodes.map((e) => e.season))];
  return (
    <dialog ref={ref} className="detail-dialog" onCancel={onClose}>
      {preparing && (
        <div className="detail-preparing" role="status" aria-live="polite">
          <span className="spinner" />
          <strong>
            {downloadMode ? "Preparing download" : `Preparing ${item.name}`}
          </strong>
          <span>
            {downloadMode
              ? "Choosing the best source and creating a compatible MP4…"
              : "Choosing the best source and opening the player…"}
          </span>
        </div>
      )}
      <button
        autoFocus
        className="icon-button close-detail"
        onClick={onClose}
        aria-label="Close details"
      >
        <X />
      </button>
      <div className="detail-art">
        <Art item={item} wide />
      </div>
      <div className="detail-content">
        <span className="eyebrow">
          {item.source === "xtream"
            ? "YOUR IPTV COLLECTION"
            : "DISCOVER SOMETHING GREAT"}
        </span>
        <h1>{item.name}</h1>
        <div className="metadata">
          {item.rating && (
            <span className="gold">
              <Star size={15} />
              {item.rating}
            </span>
          )}
          <span>{item.year}</span>
          <span>{item.type === "series" ? "Series" : "Movie"}</span>
          <span>{item.runtime}</span>
        </div>
        <p className="description">
          {item.description || "No synopsis is available for this title."}
        </p>
        <div className="chips">
          {item.genres?.map((g) => (
            <span key={g}>{g}</span>
          ))}
        </div>
        <div className="actions">
          {item.type !== "series" && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void play()}
            >
              <Play size={18} fill="currentColor" />
              {resume
                ? "Resume"
                : autoplay
                  ? "Play best stream"
                  : "Find streams"}
            </button>
          )}
          {resume?.episode && (
            <button
              className="primary"
              disabled={busy}
              onClick={() => void play(resume.episode)}
            >
              <Play size={18} />
              Resume S{resume.episode.season} E{resume.episode.episode}
            </button>
          )}
          {autoplay && item.source === "addon" && item.type === "movie" && (
            <button disabled={busy} onClick={() => void play(undefined, false)}>
              Find streams
            </button>
          )}
          {item.source === "addon" && (
            <button
              disabled={busy}
              className={downloadMode ? "selected" : undefined}
              onClick={() => download()}
            >
              <Download size={18} />
              Download
            </button>
          )}
          <button onClick={() => toggleSave(item)}>
            {saved ? <Check size={18} /> : <Plus size={18} />}{" "}
            {saved ? "In my library" : "My library"}
          </button>
          {resume && (
            <button
              className="remove-history"
              onClick={() => onRemoveProgress(item)}
            >
              <Trash2 size={18} />
              Remove from watch history
            </button>
          )}
        </div>
        {(credits.length > 0 || (item.cast?.length ?? 0) > 0) && (
          <section className="cast-section" aria-label="Cast">
            <h2>Starring</h2>
            <div className="cast-row">
              {(credits.length
                ? credits
                : (item.cast ?? []).map((name, index) => ({
                    id: index,
                    name,
                    role: "Cast",
                    photo: undefined,
                  }))
              ).map((person) => (
                <button
                  className="cast-person"
                  key={person.id}
                  onClick={() => {
                    setBusy(true);
                    void import("./tmdb")
                      .then(async ({ peopleByName, personCredits }) => {
                        const resolved = credits.length
                          ? person
                          : (await peopleByName([person.name]))[0];
                        if (!resolved)
                          throw new Error(
                            "This cast member could not be matched. Check the TMDB connection in Settings.",
                          );
                        return personCredits(resolved.id);
                      })
                      .then((items) => setPerson({ name: person.name, items }))
                      .catch((e) => setError(message(e)))
                      .finally(() => setBusy(false));
                  }}
                >
                  {person.photo ? (
                    <img src={person.photo} alt="" />
                  ) : (
                    <span>{person.name.slice(0, 1)}</span>
                  )}
                  <strong>{person.name}</strong>
                  <small>{person.role}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        {person && (
          <section
            className="person-credits"
            aria-label={`${person.name} filmography`}
          >
            <div>
              <div>
                <span className="eyebrow">FILMOGRAPHY</span>
                <h2>{person.name}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setPerson(null)}
                aria-label="Close filmography"
              >
                <X size={18} />
              </button>
            </div>
            <div className="person-credit-grid">
              {person.items.map((title) => (
                <button
                  key={itemKey(title)}
                  onClick={() => onSelectItem(title)}
                >
                  <Art item={title} />
                  <strong>{title.name}</strong>
                  <small>
                    {title.year} Â·{" "}
                    {title.type === "series" ? "Series" : "Movie"}
                  </small>
                </button>
              ))}
            </div>
          </section>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {busy && <Loading />}
        {files && (
          <div className="stream-results">
            <h2>Choose the video file</h2>
            <p className="muted">
              No unambiguous automatic match was found. Select the movie or
              episode you want.
            </p>
            {files.files
              .filter(
                (f) =>
                  f.mimetype?.startsWith("video/") ||
                  /\.(mp4|mkv|m4v|webm|avi|mov|ts)$/i.test(f.name),
              )
              .map((file) => (
                <button
                  key={file.id}
                  disabled={busy}
                  onClick={async () => {
                    controller.current?.abort();
                    const c = new AbortController();
                    controller.current = c;
                    setBusy(true);
                    setError("");
                    try {
                      const url = await torboxLink(
                        torboxKey,
                        files.torrentId,
                        file.id,
                        c.signal,
                      );
                      if (!c.signal.aborted) {
                        if (downloadMode)
                          await startDownload(
                            url,
                            files.episode,
                            undefined,
                            c.signal,
                          );
                        else
                          onPlay({
                            item,
                            episode: files.episode,
                            url,
                            resume:
                              resume?.episode?.id === files.episode?.id
                                ? resume?.seconds
                                : undefined,
                          });
                      }
                    } catch (e) {
                      if (!c.signal.aborted) setError(message(e));
                    } finally {
                      if (!c.signal.aborted) setBusy(false);
                    }
                  }}
                >
                  {downloadMode ? <Download size={18} /> : <Play size={18} />}
                  <span>{file.short_name ?? file.name}</span>
                </button>
              ))}
          </div>
        )}
        {item.type === "series" && episodes.length > 0 && (
          <div className="episode-section">
            <div className="row-heading">
              <h2>Episodes</h2>
              <select
                aria-label="Season"
                value={season ?? ""}
                onChange={(e) => setSeason(Number(e.target.value))}
              >
                {seasons.map((s) => (
                  <option key={s} value={s}>
                    Season {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="episodes">
              {episodes
                .filter((e) => e.season === season)
                .map((ep) => (
                  <button
                    key={ep.id}
                    disabled={busy}
                    onClick={() =>
                      downloadMode ? download(ep) : void play(ep)
                    }
                  >
                    <span className="episode-number">{ep.episode}</span>
                    <span>{ep.name}</span>
                    {downloadMode ? <Download size={18} /> : <Play size={18} />}
                  </button>
                ))}
            </div>
          </div>
        )}
        {!busy && item.type === "series" && !episodes.length && (
          <p className="muted">No episodes were returned by this source.</p>
        )}
        {streamsLoaded && (
          <div className="stream-results">
            <h2>
              {downloadMode ? "Choose a stream to download" : "Choose a stream"}
              {episode ? ` Â· Episode ${episode.episode}` : ""}
            </h2>
            {streams.length === 0 && (
              <p className="muted">No streams found. Try another source.</p>
            )}
            {streams.map((s, i) => {
              const playable =
                directStream(s) ||
                (!!s.infoHash && (!!torboxKey || !!realDebridKey));
              return (
                <button
                  key={i}
                  disabled={!playable || busy}
                  onClick={() => void manualStream(s)}
                >
                  {downloadMode ? <Download size={20} /> : <Play size={20} />}
                  <span>
                    <strong>{s.name ?? "Stream"}</strong>
                    <small>
                      {streamQuality(s)
                        ? `${streamQuality(s)}p`
                        : "Quality not reported"}
                      {seeders(s) >= 0 ? ` Â· ${seeders(s)} seeders` : ""}
                      {s.infoHash ? " Â· TorBox" : ""}
                    </small>
                    <span>
                      {s.title ??
                        (playable
                          ? "HTTPS video"
                          : s.infoHash
                            ? "Torrent source â€” requires a separate streaming server"
                            : "Not directly playable in a browser")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </dialog>
  );
}

export default function App() {
  const route = (): Page =>
    [...nav.map((item) => item.id), "settings"].includes(
      location.hash.slice(1) as Page,
    )
      ? (location.hash.slice(1) as Page)
      : "home";
  const [accountLoading, setAccountLoading] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [activeProfileView, setActiveProfileView] = useState<{
    name: string;
    image?: string;
    color?: string;
  } | null>(null);
  const [forceProfileSelection, setForceProfileSelection] = useState(false);
  const [page, setPage] = useState<Page>(route);
  const [provider, setProvider] = useState<Provider | null>(getProvider);
  const [addons, setAddons] = useStored<Addon[]>("addons", defaultAddons);
  const [library, setLibrary] = useStored<Item[]>("library", []);
  const [accent, setAccent] = useStored("accent", "#9b5cff");
  const [collections, setCollections] = useStored<Collection[]>(
    "collections",
    [],
  );
  const [autoplay, setAutoplay] = useStored("autoplay", true);
  const [skipProfileSelection, setSkipProfileSelection] = useStored(
    "skip-profile-selection",
    false,
  );
  const [torboxKey, setTorboxKey] = useState<string>(() =>
    read("torbox-key", read("torbox-key", ""), sessionStorage),
  );
  const [realDebridKey, setRealDebridKey] = useState<string>(() =>
    read("realdebrid-key", read("realdebrid-key", ""), sessionStorage),
  );
  const [tmdbKey, setTmdbKey] = useState(
    () => localStorage.getItem("nuvio:tmdb-key")?.trim() || DEFAULT_TMDB_KEY,
  );
  const [progress, setProgress] = useState<Progress[]>(() =>
    read("progress", []),
  );
  function loadAccountSetup(s: Setup) {
    if (s.playbackService)
      localStorage.setItem(
        "nuvio:playback-service",
        JSON.stringify(s.playbackService),
      );
    if (s.playbackService)
      window.dispatchEvent(new Event("connections-changed"));
    const accountTmdbKey = s.tmdbKey?.trim();
    const resolvedTmdbKey = accountTmdbKey || DEFAULT_TMDB_KEY;
    setTmdbKey(resolvedTmdbKey);
    localStorage.setItem("nuvio:tmdb-key", resolvedTmdbKey);
    setAddons(s.addons);
    const collectionSettings =
      s.homeCatalogs?.filter((x) => x.is_collection) ?? [];
    setCollections(
      s.collections.map((collection) => {
        const setting = collectionSettings.find(
          (x) => x.collection_id === collection.id,
        );
        return setting
          ? { ...collection, showOnHome: setting.enabled }
          : collection;
      }),
    );
    setLibrary(s.library);
    setProgress(s.progress);
    save("progress", s.progress);
    setProvider(s.provider);
    storeProvider(s.provider, true);
    setTorboxKey(s.torboxKey);
    save("torbox-key", s.torboxKey);
    sessionStorage.removeItem("nuvio:torbox-key");
    setRealDebridKey(s.realDebridKey);
    save("realdebrid-key", s.realDebridKey);
    sessionStorage.removeItem("nuvio:realdebrid-key");
    setAutoplay(s.autoplay);
    setHomeCatalogs(s.homeCatalogs ?? []);
  }
  const [playlist, setPlaylist] = useState<Item[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<Kind>("movie");
  const [source, setSource] = useState("catalogs");
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState("");
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [homeRows, setHomeRows] = useState<{ title: string; items: Item[] }[]>(
    [],
  );
  const [heroIndex, setHeroIndex] = useState(0);
  const [homeCatalogs, setHomeCatalogs] = useStored<HomeCatalogSetting[]>(
    "home-catalogs",
    [],
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision((n) => n + 1);
    window.addEventListener("connections-changed", changed);
    return () => window.removeEventListener("connections-changed", changed);
  }, []);
  useEffect(() => {
    const refresh = () => void refreshPlaybackEndpoint();
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  const [limit, setLimit] = useState(60);
  const [guideLimit, setGuideLimit] = useState(120);
  const [detail, setDetail] = useState<Item | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [activeChannel, setActiveChannel] = useState<Item | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [update, setUpdate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const partyAttemptedRef = useRef("");
  useEffect(() => {
    if (!profileReady || playback) return;
    const id = new URL(location.href).searchParams.get("party")?.trim() ?? "";
    if (!id || id === partyAttemptedRef.current) return;
    partyAttemptedRef.current = id;
    void joinParty(id).then(
      (session) => {
        setDetail(null);
        setPlayback({
          ...session.playback,
          prepared: true,
          resume: session.state.position,
          party: { id: session.id, host: session.host },
        });
        setToast(
          session.host
            ? "Watch Together room restored."
            : "Joined Watch Together. Playback will follow the host.",
        );
      },
      (e) => {
        partyAttemptedRef.current = "";
        setToast(
          e instanceof Error ? e.message : "Could not join Watch Together.",
        );
      },
    );
  }, [profileReady, playback]);
  const navigate = (next: Page) => {
    location.hash = next;
    setQuery("");
    setCategory("");
    setRegion("");
    setFavoritesOnly(false);
  };
  useEffect(() => {
    const handler = () => {
      setPage(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    const storage = () =>
      setToast(
        "Browser storage is full. Recent changes may not survive a reload.",
      );
    const updated = () => setUpdate(true);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    window.addEventListener("storage-full", storage);
    window.addEventListener("app-update", updated);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
      window.removeEventListener("storage-full", storage);
      window.removeEventListener("app-update", updated);
    };
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    setLimit(60);
  }, [page, deferredQuery, category, region, kind, source, favoritesOnly]);
  const catalogs = addons.flatMap((a) =>
    (a.manifest.catalogs ?? [])
      .filter(
        (c) =>
          c.type === kind &&
          !c.extra?.some((e) => e.isRequired && e.name !== "search"),
      )
      .map((c) => ({
        addon: a,
        catalog: c,
        key: `${a.base}|${c.type}|${c.id}`,
      })),
  );
  useEffect(() => {
    if (page !== "home") return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    const available = addons.flatMap((a) =>
      (a.manifest.catalogs ?? [])
        .filter(
          (cat) =>
            ["movie", "series"].includes(cat.type) &&
            !cat.extra?.some((e) => e.isRequired),
        )
        .map((cat) => ({ a, cat })),
    );
    const entries = homeCatalogs.length
      ? homeCatalogs
          .filter((setting) => setting.enabled && !setting.is_collection)
          .sort((a, b) => Number(a.order) - Number(b.order))
          .flatMap((setting) => {
            const match = available.find(({ a, cat }) =>
              settingMatchesChoice(setting, {
                key: `${a.base}|${cat.type}|${cat.id}`,
                addonId: a.manifest.id,
                addonName: a.manifest.name,
                catalogId: cat.id,
                catalogName: cat.name || a.manifest.name,
                type: cat.type,
              }),
            );
            return match
              ? [{ ...match, customTitle: setting.custom_title }]
              : [];
          })
      : available
          .slice(0, 14)
          .map((entry) => ({ ...entry, customTitle: undefined }));
    void Promise.allSettled(
      entries.map(async ({ a, cat, customTitle }) => ({
        title: customTitle || ((cat.name || a.manifest.name) as string) /*
          `${a.manifest.name} Â· ${cat.type === "movie" ? "Movies" : "Series"}`,
          */,
        items: await catalog(a, cat.type, cat.id, "", c.signal),
      })),
    ).then((results) => {
      if (c.signal.aborted) return;
      const rows = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      setHomeRows(rows);
      void hideUnavailableFutureTitles(rows, addons, c.signal).then(
        (filtered) => {
          if (!c.signal.aborted) setHomeRows(filtered);
        },
      );
      const rejected = results.find((r) => r.status === "rejected");
      if (rejected?.status === "rejected") setError(message(rejected.reason));
      setLoading(false);
    });
    return () => c.abort();
  }, [page, addons, homeCatalogs, revision]);
  useEffect(() => {
    if (
      !(page === "live" || (page === "discover" && source === "xtream")) ||
      !provider
    ) {
      setCategoryList([]);
      return;
    }
    const c = new AbortController();
    const type = page === "live" ? "live" : kind;
    const key = `categories:${provider.scope}:${type}`;
    let restored = false;
    void readLiveCache<Category[]>(key).then((cached) => {
      if (!c.signal.aborted && cached?.length) {
        restored = true;
        setCategoryList(cached);
      }
    });
    void categories(provider, type, c.signal)
      .then((result) => {
        if (!c.signal.aborted) {
          setCategoryList(result);
          void writeLiveCache(key, result);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted && !restored) setError(message(e));
      });
    return () => c.abort();
  }, [page, source, provider, kind, revision]);
  useEffect(() => {
    if (page !== "discover" && page !== "live") return;
    const c = new AbortController();
    setLoading(true);
    setError("");
    async function load() {
      const type = page === "live" ? "live" : kind;
      const cacheKey = provider
        ? `items:${provider.scope}:${type}:${category || "all"}`
        : "";
      let restored = false;
      try {
        let result: Item[] = [];
        if (page === "live" || source === "xtream") {
          if (provider) {
            const cached = await readLiveCache<Item[]>(cacheKey);
            if (cached?.length && !c.signal.aborted) {
              restored = true;
              setItems(
                page === "live"
                  ? [
                      ...cached,
                      ...playlist.filter(
                        (i) => !category || i.category === category,
                      ),
                    ]
                  : cached,
              );
              setLoading(false);
            } else if (!c.signal.aborted) {
              setItems(
                page === "live"
                  ? playlist.filter((i) => !category || i.category === category)
                  : [],
              );
            }
            result = await providerItems(provider, type, category, c.signal);
            if (!c.signal.aborted) void writeLiveCache(cacheKey, result);
          }
          if (page === "live")
            result = [
              ...result,
              ...playlist.filter((i) => !category || i.category === category),
            ];
        } else {
          const chosen =
            catalogs.find((x) => x.key === selectedCatalog) ?? catalogs[0];
          if (deferredQuery) {
            const searchable = catalogs.filter((entry) =>
              entry.catalog.extra?.some((extra) => extra.name === "search"),
            );
            if (searchable.length) {
              try {
                result = await Promise.any(
                  searchable.map(async (entry) => {
                    const matches = await catalog(
                      entry.addon,
                      kind,
                      entry.catalog.id,
                      deferredQuery,
                      c.signal,
                    );
                    if (!matches.length)
                      throw new Error("This catalog found no matches.");
                    return matches;
                  }),
                );
              } catch (failure) {
                if (c.signal.aborted) return;
                if (failure instanceof AggregateError) result = [];
                else throw failure;
              }
            }
          } else if (chosen) {
            result = await catalog(
              chosen.addon,
              kind,
              chosen.catalog.id,
              "",
              c.signal,
            );
          }
        }
        if (!c.signal.aborted) setItems(result);
      } catch (e) {
        if (!c.signal.aborted && !restored) setError(message(e));
      } finally {
        if (!c.signal.aborted) setLoading(false);
      }
    }
    const timer = setTimeout(
      () => void load(),
      page === "discover" && source === "catalogs" && deferredQuery ? 350 : 0,
    );
    return () => {
      clearTimeout(timer);
      c.abort();
    };
    // Catalog query depends on installed manifests, not the freshly mapped array.
  }, [
    page,
    source,
    provider,
    kind,
    category,
    selectedCatalog,
    addons,
    playlist,
    revision,
    page === "discover" && source === "catalogs" ? deferredQuery : "",
  ]);
  const saved = (item: Item) =>
    library.some((i) => itemKey(i) === itemKey(item));
  const toggleSave = (item: Item) =>
    setLibrary((old) =>
      old.some((i) => itemKey(i) === itemKey(item))
        ? old.filter((i) => itemKey(i) !== itemKey(item))
        : [...old, cleanItem(item)],
    );
  const open = (item: Item) => {
    if (item.type === "live") {
      if (item.source === "playlist") {
        const current = playlist.find((p) => itemKey(p) === itemKey(item));
        if (!current) {
          setToast("Import this playlist again to play its channels.");
          return;
        }
        setActiveChannel(current);
      } else setActiveChannel(item);
      navigate("live");
    } else setDetail(item);
  };
  const randomPick = () => {
    const choices = [
      ...new Map(
        homeRows
          .flatMap((row) => row.items)
          .filter((item) => item.type !== "live")
          .map((item) => [itemKey(item), item]),
      ).values(),
    ];
    if (!choices.length) {
      setToast(
        "Your catalogs are still loading. Try Random Pick again shortly.",
      );
      return;
    }
    const selected = choices[Math.floor(Math.random() * choices.length)];
    setDetail(selected);
  };
  const heroItems = useMemo(
    () =>
      [
        ...new Map(
          homeRows
            .flatMap((row) => row.items)
            .map((entry) => [itemKey(entry), entry]),
        ).values(),
      ].slice(0, 20),
    [homeRows],
  );
  const hero = heroItems[heroIndex % Math.max(heroItems.length, 1)];
  useEffect(() => {
    if (page !== "home" || heroItems.length < 2) return;
    const timer = window.setInterval(
      () => setHeroIndex((current) => (current + 1) % heroItems.length),
      8_000,
    );
    return () => window.clearInterval(timer);
  }, [page, heroItems.length]);
  useEffect(() => {
    if (heroIndex >= heroItems.length) setHeroIndex(0);
  }, [heroIndex, heroItems.length]);
  const regionOf = (item: Item) =>
    liveRegion(
      categoryList.find((entry) => entry.id === item.category)?.name ??
        item.category ??
        item.name,
    );
  const availableRegions = liveRegions.filter(([code]) =>
    items.some((item) => regionOf(item) === code),
  );
  const filtered = useMemo(
    () =>
      (page === "library" ? library : items).filter(
        (i) =>
          (!deferredQuery ||
            i.name
              .toLocaleLowerCase()
              .includes(deferredQuery.toLocaleLowerCase())) &&
          (!region || regionOf(i) === region) &&
          (!favoritesOnly || saved(i)),
      ),
    [deferredQuery, favoritesOnly, items, library, page, region],
  );
  const randomDiscoverPick = () => {
    const choices = filtered.filter((item) => item.type !== "live");
    if (!choices.length) {
      setToast(
        loading
          ? "These titles are still loading. Try Random Pick again shortly."
          : "There are no titles in the current selection to pick from.",
      );
      return;
    }
    setDetail(choices[Math.floor(Math.random() * choices.length)]);
  };
  const removeFromHistory = (item: Item) => {
    const next = progress.filter(
      (entry) => itemKey(entry.item) !== itemKey(item),
    );
    save("progress", next);
    setProgress(next);
    setToast(`${item.name} was removed from your watch history.`);
  };
  const guideState = useGuide(
    provider,
    page === "live" ? filtered : [],
    activeChannel,
    revision,
  );
  const guideChannels = useMemo(
    () =>
      filtered.filter((channel) =>
        guideState.get(channel).some((p) => p.end > guideState.now),
      ),
    [filtered, guideState.get, guideState.now],
  );
  useEffect(
    () => setGuideLimit(120),
    [region, category, favoritesOnly, deferredQuery],
  );
  const allCategories = [
    ...categoryList,
    ...Array.from(new Set(playlist.map((i) => i.category ?? "Other"))).map(
      (id) => ({ id, name: id }),
    ),
  ];
  function playChannel(item: Item) {
    if (item.source === "xtream") {
      if (!provider || provider.scope !== item.provider) {
        setToast("Connect this channelâ€™s IPTV account in Settings.");
        return;
      }
      setPlayback({
        item,
        url:
          item.url ??
          streamUrl(
            provider,
            "live",
            item.id,
            getService() ? (item.extension ?? "ts") : "m3u8",
          ),
        requestHeaders: { "User-Agent": "VLC/3.0.0 LibVLC/3.0.0" },
        mode: getService() ? "transcode" : undefined,
        hls: true,
      });
    } else if (item.url)
      setPlayback({
        item,
        url: item.url,
        mode: getService() ? "transcode" : undefined,
        hls: /\.m3u8(?:[?#]|$)/i.test(item.url) || !!getService(),
      });
  }
  async function restoreSetup(transfer: Transfer) {
    const installed = await installMany(transfer.addons);
    setAddons((previous) => mergeAddons(previous, installed.addons));
    setCollections((previous) =>
      mergeCollections(previous, transfer.collections),
    );
    setLibrary((previous) => mergeItems(previous, transfer.library));
    const mergedProgress = [
      ...new Map(
        [...progress, ...transfer.progress]
          .sort((a, b) => a.at - b.at)
          .map((p) => [itemKey(p.item), p]),
      ).values(),
    ]
      .sort((a, b) => b.at - a.at)
      .slice(0, 100);
    save("progress", mergedProgress);
    setProgress(mergedProgress);
    return `Restored ${installed.addons.length} add-ons, ${transfer.collections.length} collections and ${transfer.library.length} saved titles.${installed.failed ? ` ${installed.failed} add-ons could not be reached; reinstall those URLs separately.` : ""}`;
  }
  if (!profileReady)
    return (
      <ProfileGate
        skipSelection={skipProfileSelection && !forceProfileSelection}
        onGuest={() => setProfileReady(true)}
        onEnter={(setup, profile) => {
          setForceProfileSelection(false);
          setActiveProfileView({
            name: profile.name,
            image: profile.avatar_url ?? undefined,
            color: profile.avatar_color_hex,
          });
          loadAccountSetup(setup);
          location.hash = "home";
          setPage("home");
          setProfileReady(true);
        }}
      />
    );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="TikTak TV home">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          <span>
            TikTak<span className="brand-dot"> TV</span>
            <small>STREAM YOUR WORLD</small>
          </span>
        </a>
        <div className="nav-label">YOUR SPACE</div>
        <nav>
          {nav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              className={page === n.id ? "active" : ""}
              onClick={() => {
                setQuery("");
                setCategory("");
              }}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
              {n.id === "live" && <span className="live-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-status">
            <span
              className={provider ? "status-dot connected-dot" : "status-dot"}
            />
            <span>
              {provider
                ? provider.name || "IPTV connected"
                : "Your screen. Your sources."}
            </span>
          </div>
          <span className="version">TikTak TV Â· Web edition</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your entertainment<span>/</span>
            <strong>{nav.find((n) => n.id === page)?.label}</strong>
          </div>
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              if (page === "home") location.hash = "discover";
            }}
          >
            <Search size={18} />
            <input
              ref={searchRef}
              aria-label="Search titles or channels"
              placeholder={
                page === "live"
                  ? "Search channelsâ€¦"
                  : "Search movies, seriesâ€¦"
              }
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (page === "home") location.hash = "discover";
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={16} />
              </button>
            )}
          </form>
          <button
            className="profile-button"
            onClick={() => navigate("account")}
            aria-label="Open account"
          >
            {activeProfileView?.image ? (
              <img src={activeProfileView.image} alt="" />
            ) : (
              <span style={{ background: activeProfileView?.color }}>
                {activeProfileView?.name.slice(0, 1).toUpperCase() ?? "T"}
              </span>
            )}
          </button>
        </header>
        {offline && (
          <div className="banner" role="status">
            Youâ€™re offline. Your saved library is available; streaming needs a
            connection.
          </div>
        )}
        {update && (
          <div className="banner">
            An update is ready. Close all Nuvio tabs and reopen to install it
            safely after playback.
            <button
              onClick={() => setUpdate(false)}
              aria-label="Dismiss update"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <main id="main-content">
          {accountLoading && (
            <div className="account-loading" role="status">
              Loading your Nuvio profile...
            </div>
          )}
          {page === "home" && (
            <>
              {hero ? (
                <section className="hero">
                  <div className="hero-image">
                    <Art key={itemKey(hero)} item={hero} wide priority />
                  </div>
                  <div className="hero-content">
                    <span className="hero-tag">
                      <Sparkles size={14} /> YOUR NEXT GREAT WATCH
                    </span>
                    <h1>{hero.name}</h1>
                    <div className="metadata">
                      {hero.rating && (
                        <span className="gold">
                          <Star size={15} fill="currentColor" />
                          {hero.rating}
                        </span>
                      )}
                      <span>{hero.year}</span>
                      <span>{hero.type === "series" ? "Series" : "Movie"}</span>
                      <span className="badge">DISCOVER</span>
                    </div>
                    <p>
                      {hero.description ||
                        "Find a new favorite. Explore the details and discover streams from your connected sources."}
                    </p>
                    <div className="actions">
                      <button
                        className="primary"
                        onClick={() => setDetail(hero)}
                      >
                        <Play size={19} fill="currentColor" /> Explore title
                      </button>
                      <button
                        className="glass"
                        onClick={() => toggleSave(hero)}
                      >
                        {saved(hero) ? <Check size={18} /> : <Plus size={18} />}
                        My library
                      </button>
                    </div>
                  </div>
                  <div className="hero-footer">
                    <span>CURATED BY YOUR ADD-ONS</span>
                    <div className="hero-navigation">
                      <button
                        aria-label="Previous featured title"
                        onClick={() =>
                          setHeroIndex(
                            (heroIndex - 1 + heroItems.length) %
                              heroItems.length,
                          )
                        }
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span>
                        {String(heroIndex + 1).padStart(2, "0")}
                        <span className="hero-line" />
                        {String(heroItems.length).padStart(2, "0")}
                      </span>
                      <button
                        aria-label="Next featured title"
                        onClick={() =>
                          setHeroIndex((heroIndex + 1) % heroItems.length)
                        }
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                </section>
              ) : loading ? (
                <div className="hero skeleton">
                  <Loading />
                </div>
              ) : (
                <section className="welcome">
                  <span className="eyebrow">WELCOME TO NUVIO</span>
                  <h1>
                    A little less searching.
                    <br />A lot more watching.
                  </h1>
                  <p>
                    Movies, series, and live television. All your sources, in
                    one place.
                  </p>
                  <button
                    className="primary"
                    onClick={() => navigate("settings")}
                  >
                    <Plus size={18} />
                    Connect your sources
                  </button>
                </section>
              )}
              <div className="home-content">
                <section className="quick-strip">
                  <div className="quick-strip-copy">
                    <span className="quick-icon">
                      <Radio />
                    </span>
                    <div>
                      <strong>Your world, live.</strong>
                      <p>
                        {provider
                          ? "Your channels are ready when you are."
                          : "Connect your IPTV provider and tune in."}
                      </p>
                    </div>
                  </div>
                  <div className="quick-strip-actions">
                    <button onClick={randomPick}>
                      <Dices size={17} />
                      Random Pick
                    </button>
                    <button
                      onClick={() => navigate(provider ? "live" : "settings")}
                    >
                      {provider ? "Watch Live TV" : "Connect IPTV"}
                      <ArrowRight size={17} />
                    </button>
                  </div>
                </section>
                {error && (
                  <div className="error" role="alert">
                    {error}
                    <button onClick={() => setRevision((v) => v + 1)}>
                      Retry catalogs
                    </button>
                  </div>
                )}
                {progress.length > 0 && (
                  <section className="media-row">
                    <div className="row-heading">
                      <h2>Pick up where you left off</h2>
                      <button onClick={() => navigate("library")}>
                        My library
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="rail">
                      {progress.slice(0, 12).map((p) => (
                        <Card
                          key={itemKey(p.item)}
                          item={p.item}
                          progress={p}
                          onOpen={open}
                        />
                      ))}
                    </div>
                  </section>
                )}
                <Suspense fallback={null}>
                  <HomeCollections
                    collections={collections}
                    onChange={setCollections}
                    addons={addons}
                    library={library}
                    onOpen={open}
                  />
                </Suspense>
                {homeRows.map((row, i) => (
                  <section className="media-row" key={i}>
                    <div className="row-heading">
                      <h2>{row.title}</h2>
                      <button
                        onClick={() => {
                          setKind(
                            row.items[0]?.type === "series"
                              ? "series"
                              : "movie",
                          );
                          navigate("discover");
                        }}
                      >
                        Explore all
                        <ChevronRight size={16} />
                      </button>
                    </div>
                    <div className="rail">
                      {row.items.slice(0, 18).map((item) => (
                        <Card key={itemKey(item)} item={item} onOpen={open} />
                      ))}
                    </div>
                  </section>
                ))}
                <footer className="app-footer">
                  <span>Made for your next great watch.</span>
                  <button onClick={() => navigate("settings")}>
                    Manage sources
                    <ArrowRight size={14} />
                  </button>
                </footer>
              </div>
            </>
          )}
          {(page === "discover" || page === "library") && (
            <div className="page-content">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    {page === "library"
                      ? "KEEP THE GOOD ONES CLOSE"
                      : "SOMETHING FOR EVERY MOOD"}
                  </span>
                  <h1>{page === "library" ? "My library" : "Discover"}</h1>
                  <p>
                    {page === "library"
                      ? "Your favorites, saved on this device."
                      : "Find your next movie night. Or your next obsession."}
                  </p>
                </div>
                {page === "library" ? (
                  <Bookmark className="section-icon" />
                ) : (
                  <Compass className="section-icon" />
                )}
              </div>
              {page === "discover" && (
                <div className="filter-toolbar">
                  <div className="tabs">
                    <button
                      className={kind === "movie" ? "selected" : ""}
                      onClick={() => {
                        setKind("movie");
                        setCategory("");
                      }}
                    >
                      <Film size={16} />
                      Movies
                    </button>
                    <button
                      className={kind === "series" ? "selected" : ""}
                      onClick={() => {
                        setKind("series");
                        setCategory("");
                      }}
                    >
                      <Tv size={16} />
                      Series
                    </button>
                  </div>
                  <select
                    aria-label="Content source"
                    value={source}
                    onChange={(e) => {
                      setSource(e.target.value);
                      setCategory("");
                    }}
                  >
                    <option value="catalogs">Add-on catalogs</option>
                    <option value="xtream">My IPTV collection</option>
                  </select>
                  {source === "xtream" ? (
                    <select
                      aria-label="Category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">All categories</option>
                      {categoryList.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      aria-label="Catalog"
                      value={
                        catalogs.some((c) => c.key === selectedCatalog)
                          ? selectedCatalog
                          : (catalogs[0]?.key ?? "")
                      }
                      onChange={(e) => setSelectedCatalog(e.target.value)}
                    >
                      {catalogs.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.catalog.name ?? c.addon.manifest.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button onClick={randomDiscoverPick} disabled={loading}>
                    <Dices size={17} />
                    Random Pick
                  </button>
                </div>
              )}
              {page === "library" && progress.length > 0 && (
                <section className="media-row">
                  <div className="row-heading">
                    <h2>Continue watching</h2>
                    <button
                      onClick={() => {
                        save("progress", []);
                        setProgress([]);
                      }}
                    >
                      Clear history
                    </button>
                  </div>
                  <div className="rail">
                    {progress.map((p) => (
                      <Card
                        key={itemKey(p.item)}
                        item={p.item}
                        progress={p}
                        onOpen={open}
                      />
                    ))}
                  </div>
                  <h2>Saved titles & channels</h2>
                </section>
              )}
              {error && page === "discover" && (
                <div className="error" role="alert">
                  {error}
                  <button onClick={() => setRevision((v) => v + 1)}>
                    Retry
                  </button>
                </div>
              )}
              {loading && page === "discover" ? (
                <Loading />
              ) : !filtered.length ? (
                <Empty
                  title={
                    query
                      ? "Nothing found this time"
                      : page === "library"
                        ? "Your favorites belong here"
                        : source === "xtream" && !provider
                          ? "Connect your IPTV collection"
                          : "No titles to show"
                  }
                  text={
                    query
                      ? "Try another title or search a different catalog or category."
                      : page === "library"
                        ? "Tap My library on a title, or the heart on a channel, to keep it here."
                        : "Add a source in Settings to start exploring."
                  }
                  action={
                    !query && page !== "library" ? "Manage sources" : undefined
                  }
                  onAction={() => navigate("settings")}
                />
              ) : (
                <>
                  <p className="results-count">
                    {filtered.length.toLocaleString()}{" "}
                    {page === "library" ? "saved items" : "titles"}
                  </p>
                  <div className="media-grid">
                    {filtered.slice(0, limit).map((item) => (
                      <Card key={itemKey(item)} item={item} onOpen={open} />
                    ))}
                  </div>
                  {filtered.length > limit && (
                    <button
                      className="load-more"
                      onClick={() => setLimit((v) => v + 60)}
                    >
                      Show 60 more
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          {page === "live" && (
            <div className="page-content">
              <div className="section-title">
                <div>
                  <span className="eyebrow">
                    <span className="live-dot" /> HAPPENING RIGHT NOW
                  </span>
                  <h1>Live TV</h1>
                  <p>A front-row seat to your world.</p>
                </div>
                <button
                  className="icon-button"
                  onClick={() => setRevision((v) => v + 1)}
                  aria-label="Refresh channels"
                >
                  <RefreshCw size={19} />
                </button>
              </div>
              {!provider && !playlist.length ? (
                <Empty
                  title="Your channels, all together"
                  text="Connect an Xtream account or import an M3U playlist to watch live television."
                  action="Connect a source"
                  onAction={() => navigate("settings")}
                />
              ) : (
                <>
                  <div className="filter-toolbar">
                    <button
                      className={favoritesOnly ? "selected" : ""}
                      onClick={() => setFavoritesOnly((v) => !v)}
                    >
                      <Heart
                        size={16}
                        fill={favoritesOnly ? "currentColor" : "none"}
                      />
                      Favorites
                    </button>
                    <select
                      aria-label="Country or region"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    >
                      <option value="">ðŸŒ All countries</option>
                      {availableRegions.map(([code, flag, label]) => (
                        <option key={code} value={code}>
                          {flag} {label}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Channel category"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                    >
                      <option value="">All channels</option>
                      {allCategories.map((c, i) => (
                        <option key={`${c.id}-${i}`} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <span className="results-count">
                      {filtered.length.toLocaleString()} channels
                    </span>
                  </div>
                  <p className="guide-status" role="status">
                    {guideState.loading
                      ? "Loading your Xtream guide automatically..."
                      : guideState.count
                        ? `Guide ready - ${guideState.count.toLocaleString()} channel guides`
                        : "Loading available channel guides..."}
                    {guideState.fallback
                      ? " - Using per-channel guide data"
                      : ""}
                  </p>
                  {!loading && guideChannels.length > 0 && (
                    <section
                      className="tv-guide-grid"
                      aria-label="Live TV schedule"
                      onScroll={(event) => {
                        const element = event.currentTarget;
                        if (
                          element.scrollHeight -
                            element.scrollTop -
                            element.clientHeight <
                          300
                        )
                          setGuideLimit((value) =>
                            Math.min(value + 120, guideChannels.length),
                          );
                      }}
                    >
                      <div className="tv-guide-heading">
                        <div>
                          <span className="eyebrow">ON NOW</span>
                          <h2>Live guide</h2>
                        </div>
                        <span>
                          {guideChannels.length} channels with schedules
                        </span>
                      </div>
                      <div className="tv-guide-times">
                        <span>Channels</span>
                        {[0, 30, 60, 90].map((minutes) => (
                          <time key={minutes}>
                            {new Date(
                              guideState.now + minutes * 60_000,
                            ).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </time>
                        ))}
                      </div>
                      {guideChannels.slice(0, guideLimit).map((channel) => {
                        const shows = guideState
                          .get(channel)
                          .filter(
                            (p) =>
                              p.end > guideState.now &&
                              p.start < guideState.now + 2 * 60 * 60_000,
                          );
                        return (
                          <div
                            className="tv-guide-row"
                            key={`guide-${itemKey(channel)}`}
                          >
                            <button
                              className="tv-guide-channel"
                              onClick={() => playChannel(channel)}
                            >
                              <span className="tv-guide-channel-art">
                                <Art item={channel} />
                              </span>
                              <strong>{channel.name}</strong>
                              <span
                                className="tv-guide-favorite"
                                role="button"
                                tabIndex={0}
                                aria-label={`${saved(channel) ? "Unfavorite" : "Favorite"} ${channel.name}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleSave(channel);
                                }}
                                onKeyDown={(event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    toggleSave(channel);
                                  }
                                }}
                              >
                                <Heart
                                  size={16}
                                  fill={
                                    saved(channel) ? "currentColor" : "none"
                                  }
                                />
                              </span>
                            </button>
                            <div className="tv-guide-programmes">
                              {shows.length ? (
                                shows.map((programme) => (
                                  <button
                                    key={programme.id}
                                    className={
                                      programme.start <= guideState.now &&
                                      programme.end > guideState.now
                                        ? "on-now"
                                        : ""
                                    }
                                    style={{
                                      flexGrow: Math.max(
                                        15,
                                        (programme.end -
                                          Math.max(
                                            programme.start,
                                            guideState.now,
                                          )) /
                                          60_000,
                                      ),
                                    }}
                                    onClick={() => playChannel(channel)}
                                  >
                                    <strong>{programme.title}</strong>
                                    <small>
                                      {new Date(
                                        programme.start,
                                      ).toLocaleTimeString([], {
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}
                                    </small>
                                  </button>
                                ))
                              ) : (
                                <span className="tv-guide-empty">
                                  No programme information
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </section>
                  )}
                  {error && (
                    <div className="error" role="alert">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div
            className="page-content account-shell-page"
            hidden={page !== "account" && page !== "settings"}
          >
            <div className="account-page-header">
              <div>
                <span className="eyebrow">YOUR NUVIO</span>
                <h1>{page === "account" ? "Account" : "Settings"}</h1>
                <p>Manage your profile and everything connected to it.</p>
              </div>
              <div className="account-page-tabs">
                <button
                  className={page === "account" ? "active" : ""}
                  onClick={() => navigate("account")}
                >
                  <UserRound size={18} /> Profile
                </button>
                <button
                  className={page === "settings" ? "active" : ""}
                  onClick={() => navigate("settings")}
                >
                  <Settings2 size={18} /> Settings
                </button>
              </div>
            </div>
            <div hidden={page !== "account"}>
              <Suspense fallback={<Loading />}>
                <AccountPanel
                  setup={{
                    playbackService: getService(),
                    tmdbKey,
                    addons,
                    collections,
                    library,
                    progress,
                    provider,
                    torboxKey,
                    realDebridKey,
                    autoplay,
                    homeCatalogs,
                  }}
                  onLoad={loadAccountSetup}
                  onLoading={setAccountLoading}
                  skipProfileSelection={skipProfileSelection}
                  onSkipProfileSelection={setSkipProfileSelection}
                  onChangeUser={() => {
                    sessionStorage.removeItem("tiktak:profile-active");
                    setForceProfileSelection(true);
                    setProfileReady(false);
                  }}
                  onProfileUpdated={setActiveProfileView}
                />
              </Suspense>
            </div>
            {page === "settings" && (
              <Suspense fallback={<Loading />}>
                <Settings
                  provider={provider}
                  onProvider={(p) => {
                    setProvider(p);
                    setCategory("");
                    setActiveChannel(null);
                  }}
                  addons={addons}
                  onAddons={setAddons}
                  onPlaylist={setPlaylist}
                  onStream={(url) =>
                    setPlayback({
                      url,
                      item: {
                        id: crypto.randomUUID(),
                        name: "Direct stream",
                        type: /\.m3u8(?:[?#]|$)/i.test(url) ? "live" : "movie",
                        source: "playlist",
                        url,
                      },
                    })
                  }
                  accent={accent}
                  onAccent={setAccent}
                  collections={collections}
                  onCollections={setCollections}
                  library={library}
                  onRestore={restoreSetup}
                  torboxKey={torboxKey}
                  onTorboxKey={setTorboxKey}
                  realDebridKey={realDebridKey}
                  onRealDebridKey={setRealDebridKey}
                  autoplay={autoplay}
                  onAutoplay={setAutoplay}
                  playbackConnected={!!getService()}
                  tmdbKey={tmdbKey}
                  onTmdbKey={setTmdbKey}
                  friendTemplate={{
                    addons,
                    collections,
                    autoplay,
                    homeCatalogs,
                  }}
                  homeCatalogs={homeCatalogs}
                  onHomeCatalogs={setHomeCatalogs}
                  onFriendTemplate={async (
                    template: FriendTemplate,
                    friendTorboxKey: string,
                  ) => {
                    setAddons(template.addons);
                    setCollections(template.collections);
                    setAutoplay(template.autoplay);
                    setHomeCatalogs(template.homeCatalogs);
                    setTorboxKey(friendTorboxKey);
                    save("torbox-key", friendTorboxKey);
                    sessionStorage.removeItem("nuvio:torbox-key");
                    setRevision((value) => value + 1);
                  }}
                />
              </Suspense>
            )}
          </div>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {nav.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            onClick={() => {
              setQuery("");
              setCategory("");
            }}
            className={page === n.id ? "active" : ""}
            aria-current={page === n.id ? "page" : undefined}
          >
            <n.icon size={22} />
            <span>{n.label === "My library" ? "Library" : n.label}</span>
          </a>
        ))}
      </nav>
      {detail && (
        <Detail
          key={itemKey(detail)}
          initial={detail}
          provider={provider}
          addons={addons}
          torboxKey={torboxKey}
          realDebridKey={realDebridKey}
          autoplay={autoplay}
          saved={saved(detail)}
          toggleSave={toggleSave}
          onClose={() => setDetail(null)}
          onPlay={(next) => {
            setDetail(null);
            setPlayback(next);
          }}
          onSelectItem={setDetail}
          onRemoveProgress={removeFromHistory}
          resume={progress.find((p) => itemKey(p.item) === itemKey(detail))}
        />
      )}
      {playback && (
        <Suspense
          fallback={
            <div className="player-loading">
              <Loading />
            </div>
          }
        >
          <Player
            playback={playback}
            onClose={() => {
              const url = new URL(location.href);
              if (url.searchParams.has("party")) {
                url.searchParams.delete("party");
                history.replaceState(null, "", url);
                partyAttemptedRef.current = "";
              }
              setPlayback(null);
              setProgress(read("progress", []));
            }}
          />
        </Suspense>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
