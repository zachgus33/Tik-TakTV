import {
  getService,
  queueDownload,
  refreshPlaybackEndpoint,
} from "./connection";
import { storeProvider } from "./storage";
import {
  account,
  avatars,
  avatarUrl,
  loadSetup,
  ensureProfiles,
  unlock,
  updateProfile,
  type Avatar,
  type HomeCatalogSetting,
  type Profile,
  type Setup,
} from "./account";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
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
  CheckCircle2,
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
  Trophy,
  Tv,
  Trash2,
  X,
  Youtube,
} from "lucide-react";
import {
  addonDetail,
  addonStreams,
  catalog,
  categories,
  defaultAddon,
  defaultAddons,
  clearSourceCache,
  epg,
  providerDetail,
  providerItems,
  safeUrl,
  streamUrl,
} from "./api";
import { readLiveCache, writeLiveCache } from "./live-cache";
import {
  activeProfileMatches,
  cleanItem,
  clearAccountStorage,
  clearProfileTransientStorage,
  getProvider,
  markActiveProfile,
  read,
  save,
  useStored,
} from "./storage";
import { WhatsNewPrompt } from "./WhatsNew";
import { notifyDueEpisodes } from "./episode-notifications";
import { KoFiWidget } from "./KoFiWidget";
import ChannelArt, { relayedArtwork } from "./ChannelArt";
import { beginProfileSync } from "./profile-sync";
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
  type WatchedItem,
} from "./types";
import {
  isEpisodeWatched,
  isWatched,
  markWatched,
  unmarkWatched,
} from "./watched";
import type { Playback } from "./Player";
import { findNextEpisode, writeNextEpisodeAutoAdvance } from "./next-episode";
import {
  getTraktRating,
  setTraktRating,
  traktRatingIds,
} from "./trakt-ratings";
import {
  getSimklRating,
  setSimklRating,
  simklRatingIds,
} from "./simkl-ratings";
import {
  simklAccessToken,
  anilistAccessToken,
} from "./ExternalTrackingSettings";
import { anilistMedia, anilistMediaRef, rateAniList } from "./anilist-tracking";
import { reconcileTraktCredential, traktAccessToken } from "./TraktSettings";
import {
  authCooldownLabel,
  authErrorMessage,
  authRateLimitDelay,
} from "./auth-feedback";
import {
  migrateLegacyTraktProfile,
  traktProfileIdentity,
  traktProfileIdentityFor,
} from "./trakt-profile";
import {
  normalizeYouTubeProgress,
  resolveYouTubeProgressTitle,
  youtubeProgressItem,
  youtubeProgressNeedsTitle,
  youtubeVideoIdFromItem,
  type YouTubePlaybackProgress,
  type YouTubeResumeRequest,
} from "./youtube-progress";
import { useGuide } from "./useGuide";
import SportsHub from "./SportsHub";
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
  sourcePickerStreams,
  streamQuality,
  streamAudioLanguages,
  streamAudioCodec,
  seeders,
  defaultStreamPreferences,
  normalizeStreamPreferences,
  saveStreamPreferences,
  streamPreferences,
  type StreamPreferences,
} from "./stream-selection";
import {
  readBingeGroup,
  readStreamLink,
  saveBingeGroup,
  saveStreamLink,
  streamContentKey,
} from "./enhanced-stream-cache";
import { streamBadgeNames } from "./stream-badges";
import {
  clearSearchHistory,
  readSearchHistory,
  recordSearch,
  removeSearch,
} from "./search-history";
import type { FriendTemplate } from "./Settings";
import { homeCatalogEntries } from "./catalog-settings";
import {
  closestTitleCorrection,
  correctionSearchProbes,
  hasRelevantTitle,
  rankExactTitleFirst,
  dedupeSearchTitles,
} from "./smart-search";

const tvInterface =
  new URLSearchParams(location.search).get("tv") === "1" ||
  /TikTakTV-AndroidTV/i.test(navigator.userAgent);
const initialGuideLimit = tvInterface ? 12 : 30;
import { joinParty } from "./watch-party";
import { streamCompatibility, updateDownloadJob } from "./reliability";
import {
  defaultNuvioWebSettings,
  normalizeNuvioWebSettings,
  readNuvioWebSettings,
  saveNuvioWebSettings,
  type NuvioWebSettings,
} from "./nuvio-web-settings";

const Player = lazy(() => import("./Player"));
const Settings = lazy(() => import("./Settings"));
const SetupWizard = lazy(() => import("./SetupWizard"));

const futureAvailability = new Map<string, boolean>();

function playbackSubtitleData(
  addons: Addon[],
  item: Item,
  videoId: string,
  stream: Stream,
  sourceUrl?: string,
): Pick<Playback, "subtitles" | "subtitleRequest"> {
  let filename = stream.behaviorHints?.filename;
  if (!filename && sourceUrl)
    try {
      filename = decodeURIComponent(
        new URL(sourceUrl).pathname.split("/").filter(Boolean).at(-1) ?? "",
      );
    } catch {}
  return {
    subtitles: (stream.subtitles ?? []).map((subtitle) => ({
      ...subtitle,
      source: "stream" as const,
    })),
    subtitleRequest: {
      addons,
      id: videoId,
      extras: {
        filename: filename || undefined,
        videoHash: stream.behaviorHints?.videoHash,
        videoSize: stream.behaviorHints?.videoSize,
      },
    },
  };
}

type StreamSearchResult = Awaited<ReturnType<typeof addonStreams>>;

function firstAutoplayResult(
  search: (
    onSource: (streams: Stream[], addon?: Addon) => void,
  ) => Promise<StreamSearchResult>,
  hasDebrid: boolean,
  installedOrder: string[],
  preferredBingeGroup?: string,
): Promise<{
  streams: Stream[];
  result?: StreamSearchResult;
  complete: Promise<StreamSearchResult>;
}> {
  const accumulated: Stream[] = [];
  const seen = new Set<string>();
  const preferences = streamPreferences();
  let timeoutElapsed = preferences.autoPlayTimeoutSeconds <= 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let settled = false;
  return new Promise((resolve, reject) => {
    let request!: Promise<StreamSearchResult>;
    const finish = (streams: Stream[], result?: StreamSearchResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({ streams, result, complete: request });
    };
    const rankedAccumulated = () =>
      autoplayStreams(
        accumulated,
        hasDebrid,
        installedOrder,
        preferredBingeGroup,
      );
    if (!timeoutElapsed)
      timeout = setTimeout(() => {
        timeoutElapsed = true;
        const selected = rankedAccumulated();
        if (selected.length) finish(selected);
      }, preferences.autoPlayTimeoutSeconds * 1000);
    request = search((streams) => {
      for (const stream of streams) {
        const key = `${stream.url ?? ""}|${stream.infoHash ?? ""}|${stream.fileIdx ?? ""}|${stream.title ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        accumulated.push(stream);
      }
      if (!timeoutElapsed) return;
      const selected = rankedAccumulated();
      if (selected.length) finish(selected);
    });
    request
      .then((result) =>
        finish(autoplayStreams(result.streams, hasDebrid), result),
      )
      .catch((error) => {
        if (timeout) clearTimeout(timeout);
        if (!settled) reject(error);
      });
  });
}

async function hideUnavailableFutureTitles<
  T extends { title: string; items: Item[] },
>(rows: T[], addons: Addon[], signal: AbortSignal) {
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
  ["US", "United States", /^(US)\||UNITED STATES/i],
  ["CA", "Canada", /^(CA)\||CANADA/i],
  ["GB", "United Kingdom", /^(UK)\||UNITED KINGDOM/i],
  ["IE", "Ireland", /^(IR)\|.*IRELAND|IRELAND/i],
  ["FR", "France", /^(FR)\||FRANCE/i],
  ["ES", "Spain", /^(ES)\||SPAIN|ESPAÑA/i],
  ["DE", "Germany", /^(DE)\||GERMANY/i],
  ["IT", "Italy", /^(IT)\||ITALY/i],
  ["PT", "Portugal", /^(PT)\||PORTUGAL/i],
  ["NL", "Netherlands", /^(NL)\||NETHERLAND/i],
  ["BE", "Belgium", /^(BE)\||BELGIUM/i],
  ["CH", "Switzerland", /^(CH)\||SWITZERLAND/i],
  ["AT", "Austria", /^(AT)\||AUSTRIA/i],
  ["PL", "Poland", /^(PL)\||POLAND/i],
  ["GR", "Greece", /^(GR)\||GREECE/i],
  ["CZ", "Czechia", /^(CZ)\||CZECH/i],
  ["SE", "Sweden", /^SWEDEN|SWEDEN/i],
  ["NO", "Norway", /^NORWAY|NORWAY/i],
  ["DK", "Denmark", /^DENMARK|DENMARK/i],
  ["FI", "Finland", /^(FI)\||FINLAND/i],
  ["AU", "Australia", /^(AU)\||AUSTRALIA/i],
  ["NZ", "New Zealand", /^(NZ)\||NEW ZEALAND/i],
  ["BR", "Brazil", /^(BR)\||BRAZIL/i],
  ["TR", "Türkiye", /^(TR)\||TURK/i],
  ["IL", "Israel", /^(IS)\||ISRAEL/i],
  ["IN", "India", /^ASIA\s*\|.*INDIA|INDIA/i],
] as const;

function regionFlag(code: string) {
  // Generate regional indicators at runtime so source-file encoding cannot corrupt flags.
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((letter) => 127397 + letter.charCodeAt(0)),
  );
}

function liveRegion(name: string) {
  return liveRegions.find(([, , pattern]) => pattern.test(name))?.[0] ?? "";
}

function localLiveRegion() {
  const locale = navigator.language.split("-")[1]?.toUpperCase() ?? "";
  return liveRegions.some(([code]) => code === locale) ? locale : "US";
}

type LandingPreview = "home" | "live" | "youtube" | "sports";

const landingPreviews: LandingPreview[] = ["home", "live", "youtube", "sports"];

export function nextLandingPreview(current: LandingPreview) {
  const index = landingPreviews.indexOf(current);
  return landingPreviews[(index + 1) % landingPreviews.length];
}

function ProfileGate({
  onEnter,
  onSetup,
  onSetupError,
  onGuest,
  skipSelection,
}: {
  onEnter: (profile: Profile, ownerId: string) => void;
  onSetup: (
    setup: Setup,
    profile: Profile,
    ownerId: string,
    warnings: string[],
  ) => void;
  onSetupError: (reason: unknown, profile: Profile, ownerId: string) => void;
  onGuest: () => void;
  skipSelection: boolean;
}) {
  const signupAvatarColors = [
    ["Violet", "#8E24AA"],
    ["Ocean", "#1565C0"],
    ["Forest", "#2E7D32"],
    ["Sunset", "#E65100"],
    ["Rose", "#C2185B"],
  ] as const;
  const [list, setList] = useState<Profile[]>([]);
  const [email, setEmail] = useState("");
  const [pinProfile, setPinProfile] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [preview, setPreview] = useState<LandingPreview>("home");
  const [previewPaused, setPreviewPaused] = useState(false);
  const [manualPreviewHold, setManualPreviewHold] = useState(false);
  const [pageVisible, setPageVisible] = useState(
    () => document.visibilityState === "visible",
  );
  const [notice, setNotice] = useState("");
  const [authCooldownUntil, setAuthCooldownUntil] = useState(() => {
    const saved = Number(sessionStorage.getItem("tiktak:auth-cooldown-until"));
    return Number.isFinite(saved) && saved > Date.now() ? saved : 0;
  });
  const [authNow, setAuthNow] = useState(() => Date.now());
  const [profileSetup, setProfileSetup] = useState<Profile | null>(null);
  const [avatarCatalog, setAvatarCatalog] = useState<Avatar[]>([]);
  const [profileName, setProfileName] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<Avatar>();
  const [signupProfileName, setSignupProfileName] = useState("");
  const [signupAvatarColor, setSignupAvatarColor] = useState("#8E24AA");
  useEffect(() => {
    const updateVisibility = () =>
      setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", updateVisibility);
    return () =>
      document.removeEventListener("visibilitychange", updateVisibility);
  }, []);
  useEffect(() => {
    if (!manualPreviewHold) return;
    const timeout = window.setTimeout(
      () => setManualPreviewHold(false),
      12_000,
    );
    return () => window.clearTimeout(timeout);
  }, [manualPreviewHold, preview]);
  useEffect(() => {
    if (
      email ||
      busy ||
      previewPaused ||
      manualPreviewHold ||
      !pageVisible ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const timeout = window.setTimeout(
      () => setPreview((current) => nextLandingPreview(current)),
      5_750,
    );
    return () => window.clearTimeout(timeout);
  }, [busy, email, manualPreviewHold, pageVisible, preview, previewPaused]);
  useEffect(() => {
    if (authCooldownUntil <= Date.now()) return;
    const interval = window.setInterval(() => setAuthNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [authCooldownUntil]);
  useEffect(() => {
    if (authCooldownUntil > Date.now()) return;
    sessionStorage.removeItem("tiktak:auth-cooldown-until");
  }, [authCooldownUntil, authNow]);
  const authCooldownSeconds = authCooldownLabel(authCooldownUntil, authNow);
  function selectPreview(next: LandingPreview) {
    setPreview(next);
    setManualPreviewHold(true);
  }
  async function refresh() {
    const { data } = await account.auth.getSession();
    window.dispatchEvent(new Event("account-auth-changed"));
    if (!data.session) {
      setEmail("");
      if (localStorage.getItem("tiktak:established-local") === "1") onGuest();
      return;
    }
    setEmail(data.session?.user.email ?? "");
    let pendingProfile: { name?: string; avatarColor?: string } | undefined;
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("tiktak:new-account-profile") ?? "null",
      ) as { email?: string; name?: string; avatarColor?: string } | null;
      if (
        saved &&
        saved.email?.toLowerCase() === data.session.user.email?.toLowerCase()
      )
        pendingProfile = { name: saved.name, avatarColor: saved.avatarColor };
    } catch {
      // A stale or malformed local handoff must never block sign-in.
    }
    const [available, availableAvatars] = data.session
      ? await Promise.all([
          ensureProfiles(pendingProfile),
          avatars().catch(() => []),
        ])
      : [[], [] as Avatar[]];
    setList(available);
    if (
      data.session &&
      sessionStorage.getItem("tiktak:new-account") === "1" &&
      available[0] &&
      !pendingProfile
    ) {
      setAvatarCatalog(availableAvatars);
      setProfileSetup(available[0]);
      setProfileName(available[0].name || "Home");
      setProfileAvatar(
        availableAvatars.find((avatar) => avatar.id === available[0].avatar_id),
      );
      return;
    }
    if (data.session && pendingProfile) {
      sessionStorage.removeItem("tiktak:new-account");
      sessionStorage.removeItem("tiktak:new-account-profile");
      setNotice("Your profile was created. Select it to enter TikTak TV.");
    }
    if (data.session && skipSelection) {
      const remembered = Number(
        localStorage.getItem(`tiktak:profile:${data.session.user.id}`),
      );
      const preferred =
        available.find((item) => item.profile_index === remembered) ??
        available.find((item) => !item.pin_enabled) ??
        available[0];
      if (preferred?.pin_enabled) setPinProfile(preferred);
      else if (preferred) await enter(preferred);
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
      const { data } = await account.auth.getSession();
      const ownerId = data.session?.user.id ?? "local";
      if (data.session)
        localStorage.setItem(
          `tiktak:profile:${data.session.user.id}`,
          String(profile.profile_index),
        );
      sessionStorage.setItem("tiktak:profile-active", "1");
      beginProfileSync(
        () => onEnter(profile, ownerId),
        () => loadSetup(profile, ownerId),
        (result) => onSetup(result.setup, profile, ownerId, result.warnings),
        (reason) => onSetupError(reason, profile, ownerId),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open this profile.");
    } finally {
      setBusy(false);
    }
  }
  async function finishProfileSetup() {
    if (!profileSetup || !profileName.trim()) return;
    setBusy(true);
    setError("");
    try {
      await updateProfile(profileSetup, {
        name: profileName.trim(),
        avatar: profileAvatar,
      });
      const updated: Profile = {
        ...profileSetup,
        name: profileName.trim(),
        avatar_id: profileAvatar?.id ?? profileSetup.avatar_id,
        avatar_url: profileAvatar
          ? avatarUrl(profileAvatar)
          : profileSetup.avatar_url,
        avatar_color_hex:
          profileAvatar?.bg_color ?? profileSetup.avatar_color_hex,
      };
      setList((current) =>
        current.map((profile) =>
          profile.profile_index === updated.profile_index ? updated : profile,
        ),
      );
      sessionStorage.removeItem("tiktak:new-account");
      setProfileSetup(null);
      await enter(updated);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not finish profile setup.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="profile-gate">
      <div className="profile-gate-brand">
        TikTak TV<small>STREAM YOUR WORLD</small>
      </div>
      {!email && !busy && (
        <aside className="profile-gate-story" aria-label="About TikTak TV">
          <span className="eyebrow">ONE HOME FOR EVERYTHING YOU WATCH</span>
          <h2>
            Your entertainment.
            <br />
            Beautifully organized.
          </h2>
          <p>
            Bring movies, series, live TV, YouTube, music, and your own media
            services together in a clean experience built for every screen.
          </p>
          <div
            className="profile-gate-preview"
            onMouseEnter={() => setPreviewPaused(true)}
            onMouseLeave={() => setPreviewPaused(false)}
            onFocusCapture={() => setPreviewPaused(true)}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node))
                setPreviewPaused(false);
            }}
          >
            <div className="profile-preview-window">
              <span className="profile-preview-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <img
                key={preview}
                className={`profile-preview-${preview}`}
                src={`/showcase/${preview}.png`}
                alt={
                  preview === "home"
                    ? "TikTak TV home screen with featured movies and continue watching"
                    : preview === "live"
                      ? "TikTak TV Live TV guide with channels and schedules"
                      : preview === "sports"
                        ? "TikTak TV Sports screen with live games, scores, and channel artwork"
                        : "TikTak TV YouTube screen with personalized video rows"
                }
              />
            </div>
            <div
              className="profile-preview-tabs"
              role="tablist"
              aria-label="See TikTak TV features"
            >
              <button
                className={preview === "home" ? "active" : ""}
                role="tab"
                aria-selected={preview === "home"}
                onClick={(event) => {
                  selectPreview("home");
                  if (event.detail > 0) event.currentTarget.blur();
                }}
              >
                <Film size={16} /> Movies & series
              </button>
              <button
                className={preview === "live" ? "active" : ""}
                role="tab"
                aria-selected={preview === "live"}
                onClick={(event) => {
                  selectPreview("live");
                  if (event.detail > 0) event.currentTarget.blur();
                }}
              >
                <Radio size={16} /> Live TV & guide
              </button>
              <button
                className={preview === "youtube" ? "active" : ""}
                role="tab"
                aria-selected={preview === "youtube"}
                onClick={(event) => {
                  selectPreview("youtube");
                  if (event.detail > 0) event.currentTarget.blur();
                }}
              >
                <Youtube size={16} /> YouTube & music
              </button>
              <button
                className={preview === "sports" ? "active" : ""}
                role="tab"
                aria-selected={preview === "sports"}
                onClick={(event) => {
                  selectPreview("sports");
                  if (event.detail > 0) event.currentTarget.blur();
                }}
              >
                <Trophy size={16} /> Sports & scores
              </button>
            </div>
          </div>
          <div className="profile-gate-points">
            <span>
              <Check size={17} /> Web, phone, Fire TV & Android TV
            </span>
            <span>
              <Check size={17} /> Your sources and accounts stay yours
            </span>
            <span>
              <Check size={17} /> Free account, no clutter
            </span>
          </div>
        </aside>
      )}
      <section>
        <h1>
          {pinProfile
            ? `Unlock ${pinProfile.name}`
            : email
              ? "Who's watching?"
              : "Your entertainment, your way"}
        </h1>
        {!email && (
          <p className="profile-gate-intro">
            Sign in to restore your profiles and add-ons, or create a free TikTakTV
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
        ) : profileSetup ? (
          <form
            className="profile-first-setup"
            onSubmit={(event) => {
              event.preventDefault();
              void finishProfileSetup();
            }}
          >
            <span className="eyebrow">FIRST PROFILE</span>
            <h2>Make TikTak TV yours</h2>
            <p>Choose the name and avatar that will appear on every device.</p>
            <label>
              Profile name
              <input
                autoFocus
                value={profileName}
                onChange={(event) => setProfileName(event.target.value)}
                maxLength={32}
                required
              />
            </label>
            {avatarCatalog.length > 0 && (
              <fieldset>
                <legend>Choose an avatar</legend>
                <div className="profile-avatar-picker">
                  {avatarCatalog.map((avatar) => (
                    <button
                      type="button"
                      key={avatar.id}
                      className={
                        profileAvatar?.id === avatar.id ? "selected" : ""
                      }
                      aria-pressed={profileAvatar?.id === avatar.id}
                      aria-label={`Use ${avatar.display_name} avatar`}
                      onClick={() => setProfileAvatar(avatar)}
                    >
                      <img src={avatarUrl(avatar)} alt="" />
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
            <button className="primary" disabled={busy || !profileName.trim()}>
              {busy ? "Saving profile…" : "Enter TikTak TV"}
            </button>
          </form>
        ) : email ? (
          <>
            {!pinProfile && (
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
            )}
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
                if (busy || authCooldownSeconds > 0) return;
                const form = new FormData(e.currentTarget);
                const password = String(form.get("password") ?? "");
                if (
                  authMode === "signup" &&
                  password !== String(form.get("confirmPassword") ?? "")
                ) {
                  setError("Passwords do not match.");
                  return;
                }
                const signUpProfile = {
                  name: signupProfileName.trim(),
                  avatarColor: signupAvatarColor,
                };
                if (authMode === "signup" && !signUpProfile.name) {
                  setError("Choose a profile name to create your account.");
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
                        options: {
                          data: {
                            profile_name: signUpProfile.name,
                            avatar_color_hex: signUpProfile.avatarColor,
                          },
                        },
                      })
                    : account.auth.signInWithPassword({
                        email: String(form.get("email") ?? "").trim(),
                        password,
                      });
                void request
                  .then(({ data, error }) => {
                    if (error) throw error;
                    if (authMode === "signup") {
                      sessionStorage.setItem("tiktak:new-account", "1");
                      sessionStorage.setItem(
                        "tiktak:new-account-profile",
                        JSON.stringify({
                          email: String(form.get("email") ?? "").trim(),
                          ...signUpProfile,
                        }),
                      );
                    }
                    if (authMode === "signup" && !data.session) {
                      setNotice(
                        "Account created. Check your email to confirm it, then sign in.",
                      );
                      setAuthMode("signin");
                      return;
                    }
                    return refresh();
                  })
                  .catch((e) => {
                    const delay = authRateLimitDelay(e);
                    if (delay) {
                      const until = Date.now() + delay;
                      sessionStorage.setItem(
                        "tiktak:auth-cooldown-until",
                        String(until),
                      );
                      setAuthCooldownUntil(until);
                      setAuthNow(Date.now());
                    }
                    setError(authErrorMessage(e));
                  })
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
                <>
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
                  <label>
                    Profile name
                    <input
                      value={signupProfileName}
                      onChange={(event) =>
                        setSignupProfileName(event.target.value)
                      }
                      maxLength={32}
                      autoComplete="nickname"
                      required
                    />
                  </label>
                  <fieldset className="signup-avatar-colors">
                    <legend>Choose an avatar color</legend>
                    <div>
                      {signupAvatarColors.map(([label, color]) => (
                        <button
                          type="button"
                          key={color}
                          className={
                            signupAvatarColor === color ? "selected" : ""
                          }
                          aria-pressed={signupAvatarColor === color}
                          aria-label={`Use ${label} avatar`}
                          onClick={() => setSignupAvatarColor(color)}
                          style={
                            { "--avatar-color": color } as React.CSSProperties
                          }
                        >
                          {signupProfileName.trim().slice(0, 1).toUpperCase() ||
                            "?"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                </>
              )}
              <button
                className="primary"
                disabled={busy || authCooldownSeconds > 0}
              >
                {busy
                  ? "Please wait…"
                  : authCooldownSeconds > 0
                    ? `Try again in ${authCooldownSeconds}s`
                    : authMode === "signup"
                      ? "Create free account"
                      : "Sign in"}
              </button>
              {authMode === "signup" && (
                <p className="profile-auth-note">
                  Your account starts with TikTakTV Catalog Addon, English
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
const YouTubeHub = lazy(() => import("./YouTubeHub"));
type Page =
  "home" | "discover" | "live" | "youtube" | "library" | "account" | "settings";
const nav = [
  { id: "home", label: "Home", icon: Home },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "live", label: "Live TV", icon: Radio },
  { id: "youtube", label: "YouTube", icon: Youtube },
  { id: "library", label: "My library", icon: Library },
  { id: "account", label: "Account", icon: UserRound },
] as const;
const message = (e: unknown) =>
  e instanceof Error ? e.message : "The source could not be loaded.";

function Art({
  item,
  wide = false,
  priority = false,
  guideArtwork,
}: {
  item: Item;
  wide?: boolean;
  priority?: boolean;
  guideArtwork?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = wide ? (item.background ?? item.poster) : item.poster;
  const [displaySrc, setDisplaySrc] = useState(
    src?.startsWith("http:") ? "" : (src ?? ""),
  );
  useEffect(() => {
    if (item.type === "live") return;
    let cancelled = false;
    setFailed(false);
    setDisplaySrc(src?.startsWith("http:") ? "" : (src ?? ""));
    if (src?.startsWith("http:"))
      void relayedArtwork(src).then(
        (url) => {
          if (!cancelled) setDisplaySrc(url);
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    return () => {
      cancelled = true;
    };
  }, [src, item.type]);
  if (item.type === "live")
    return <ChannelArt channel={item} guideArtwork={guideArtwork} />;
  return displaySrc && !failed ? (
    <img
      src={displaySrc}
      alt=""
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!src || displaySrc !== src) {
          setFailed(true);
          return;
        }
        void relayedArtwork(src).then(setDisplaySrc, () => setFailed(true));
      }}
    />
  ) : (
    <div className="art-fallback" aria-hidden="true">
      <Film />
      <span>{item.name}</span>
    </div>
  );
}
function Card({
  item,
  onOpen,
  progress,
  watched = false,
  upcoming = false,
}: {
  item: Item;
  onOpen: (item: Item) => void;
  progress?: Progress;
  watched?: boolean;
  upcoming?: boolean;
}) {
  const experienceSettings = readNuvioWebSettings();
  const continueStyle = progress
    ? experienceSettings.continueWatchingStyle
    : "card";
  return (
    <button
      className={`media-card ${progress ? `continue-card continue-${continueStyle}` : ""}${upcoming ? " continue-upcoming" : ""}`}
      onClick={() => onOpen(item)}
      onPointerEnter={() => {
        if (item.background) {
          const image = new Image();
          image.referrerPolicy = "no-referrer";
          image.src = item.background;
        }
      }}
      onFocus={() => {
        if (item.background) {
          const image = new Image();
          image.referrerPolicy = "no-referrer";
          image.src = item.background;
        }
      }}
    >
      <div className="poster">
        <Art item={item} wide={!!progress && continueStyle !== "poster"} />
        <span className="play-hover">
          <Play fill="currentColor" />
        </span>
        {item.rating && (
          <span className="rating">
            <Star size={11} fill="currentColor" />
            {Number(item.rating).toFixed(1)}
          </span>
        )}
        {watched && (
          <span className="card-watched-icon" aria-label="Watched">
            <CheckCircle2 size={17} />
          </span>
        )}
        {progress && experienceSettings.continueWatchingProgress && (
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
          ? upcoming
            ? `Upcoming${progress.episode?.released ? ` · ${new Date(progress.episode.released).toLocaleDateString()}` : ""}`
            : experienceSettings.continueWatchingRemainingTime
            ? `${Math.max(1, Math.round((progress.duration - progress.seconds) / 60))} min left`
            : "Continue watching"
          : [
              item.year,
              item.type === "series"
                ? "Series"
                : item.type === "live"
                  ? "Live TV"
                  : "Movie",
            ]
              .filter(Boolean)
              .join(" · ")}
      </span>
    </button>
  );
}

function organizeContinueWatching(
  entries: Progress[],
  settings: NuvioWebSettings,
) {
  const now = Date.now();
  const upcoming = entries.filter((entry) => {
    const released = entry.episode?.released;
    if (!released) return false;
    const timestamp = new Date(released).valueOf();
    return Number.isFinite(timestamp) && timestamp > now;
  });
  const upcomingKeys = new Set(upcoming.map((entry) => itemKey(entry.item)));
  const released = entries.filter(
    (entry) => !upcomingKeys.has(itemKey(entry.item)),
  );
  const visibleUpcoming = settings.continueWatchingShowUnaired ? upcoming : [];
  if (settings.continueWatchingSort === "split-upcoming")
    return { primary: released, upcoming: visibleUpcoming };
  if (settings.continueWatchingSort === "streaming")
    return { primary: [...released, ...visibleUpcoming], upcoming: [] };
  return {
    primary: entries.filter(
      (entry) =>
        !upcomingKeys.has(itemKey(entry.item)) ||
        settings.continueWatchingShowUnaired,
    ),
    upcoming: [],
  };
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
      Loading your library…
    </div>
  );
}
function PersonView({
  person,
  onClose,
  onSelect,
}: {
  person: import("./tmdb").PersonProfile;
  onClose: () => void;
  onSelect: (item: Item) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const released = person.titles.filter(
    (title) => title.releaseDate && title.releaseDate <= today,
  );
  const popular = [...released]
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, 16);
  const latest = [...released]
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .slice(0, 16);
  const upcoming = person.titles
    .filter((title) => title.releaseDate > today)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
    .slice(0, 16);
  const birthday = person.birthday
    ? new Date(`${person.birthday}T12:00:00`).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";
  const age = person.birthday
    ? Math.max(
        0,
        new Date(person.deathday ?? today).getFullYear() -
          new Date(person.birthday).getFullYear() -
          (new Date(person.deathday ?? today).toISOString().slice(5, 10) <
          person.birthday.slice(5, 10)
            ? 1
            : 0),
      )
    : null;
  const rows = [
    ["Popular", popular],
    ["Latest", latest],
    ["Upcoming", upcoming],
  ] as const;
  return (
    <div
      className="person-view"
      role="dialog"
      aria-modal="true"
      aria-label={`${person.name} filmography`}
    >
      <button
        className="person-back"
        onClick={onClose}
        aria-label="Back to title"
      >
        <ChevronLeft size={24} />
        <span>Back</span>
      </button>
      <header className="person-hero">
        {person.photo ? (
          <img src={person.photo} alt="" />
        ) : (
          <span>{person.name.slice(0, 1)}</span>
        )}
        <div>
          <span className="eyebrow">PERSON</span>
          <h1>{person.name}</h1>
          <p>
            {[
              birthday && `${birthday}${age != null ? ` (age ${age})` : ""}`,
              person.placeOfBirth,
              person.knownFor && `Known for ${person.knownFor}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      </header>
      {person.biography && (
        <p className="person-biography">{person.biography}</p>
      )}
      <div className="person-rows">
        {rows.map(([label, titles]) =>
          titles.length ? (
            <section key={label}>
              <h2>{label}</h2>
              <div className="person-title-row">
                {titles.map((title) => (
                  <button key={itemKey(title)} onClick={() => onSelect(title)}>
                    <Art item={title} />
                    <strong>{title.name}</strong>
                    <small>
                      {title.year ||
                        (label === "Upcoming" ? "Coming soon" : "")}
                    </small>
                  </button>
                ))}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Detail({
  initial,
  traktProfileName,
  provider,
  addons,
  saved,
  toggleSave,
  onClose,
  onPlay,
  onSelectItem,
  onTrailer,
  onRemoveProgress,
  onSetWatched,
  onOpenDownloads,
  watched,
  resume,
  torboxKey,
  realDebridKey,
  autoplay,
}: {
  initial: Item;
  traktProfileName: string;
  provider: Provider | null;
  addons: Addon[];
  saved: boolean;
  toggleSave: (item: Item) => void;
  onClose: () => void;
  onPlay: (p: Playback) => void;
  onSelectItem: (item: Item) => void;
  onTrailer: (videoId: string, title: string) => void;
  onRemoveProgress: (item: Item) => void;
  onSetWatched: (
    item: Item,
    episode: Episode | undefined,
    watched: boolean,
  ) => void;
  onOpenDownloads: () => void;
  watched: WatchedItem[];
  resume?: Progress;
  torboxKey: string;
  realDebridKey: string;
  autoplay: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const nuvioWebSettings = readNuvioWebSettings();
  const [item, setItem] = useState(initial);
  const [metaTab, setMetaTab] = useState<"overview" | "episodes" | "more">(
    "overview",
  );
  const [traktConnected, setTraktConnected] = useState(false);
  const [traktRating, setTraktRatingValue] = useState<number | null>(null);
  const [traktRatingBusy, setTraktRatingBusy] = useState(false);
  const [traktRatingError, setTraktRatingError] = useState("");
  const [simklConnected, setSimklConnected] = useState(false);
  const [simklRating, setSimklRatingValue] = useState<number | null>(null);
  const [simklRatingBusy, setSimklRatingBusy] = useState(false);
  const [simklRatingError, setSimklRatingError] = useState("");
  const [anilistConnected, setAnilistConnected] = useState(false);
  const [anilistRating, setAnilistRating] = useState<number | null>(null);
  const [anilistProgress, setAnilistProgress] = useState<number | null>(null);
  const [anilistRatingBusy, setAnilistRatingBusy] = useState(false);
  const [anilistRatingError, setAnilistRatingError] = useState("");
  useEffect(() => {
    let live = true;
    setTraktRatingValue(null);
    setTraktRatingError("");
    if (!traktProfileName || !traktRatingIds(item.id) || item.type === "live") {
      setTraktConnected(false);
      return;
    }
    void traktAccessToken(traktProfileName)
      .then(async (token) => {
        if (!live) return;
        setTraktConnected(!!token);
        if (token) {
          const rating = await getTraktRating(traktProfileName, item);
          if (live) setTraktRatingValue(rating);
        }
      })
      .catch((error) => {
        if (live) setTraktRatingError(message(error));
      });
    return () => {
      live = false;
    };
  }, [traktProfileName, item.id, item.type]);
  async function changeTraktRating(value: number | null) {
    setTraktRatingBusy(true);
    setTraktRatingError("");
    try {
      await setTraktRating(traktProfileName, item, value);
      setTraktRatingValue(value);
    } catch (error) {
      setTraktRatingError(message(error));
    } finally {
      setTraktRatingBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    setSimklRatingValue(null);
    setSimklRatingError("");
    if (!traktProfileName || !simklRatingIds(item.id) || item.type === "live") {
      setSimklConnected(false);
      return;
    }
    void simklAccessToken(traktProfileName)
      .then(async (token) => {
        if (!live) return;
        setSimklConnected(!!token);
        if (token) {
          const rating = await getSimklRating(traktProfileName, item);
          if (live) setSimklRatingValue(rating);
        }
      })
      .catch((error) => {
        if (live) setSimklRatingError(message(error));
      });
    return () => {
      live = false;
    };
  }, [traktProfileName, item.id, item.type]);
  async function changeSimklRating(value: number | null) {
    setSimklRatingBusy(true);
    setSimklRatingError("");
    try {
      await setSimklRating(traktProfileName, item, value);
      setSimklRatingValue(value);
    } catch (error) {
      setSimklRatingError(message(error));
    } finally {
      setSimklRatingBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    setAnilistConnected(false);
    setAnilistRating(null);
    setAnilistProgress(null);
    setAnilistRatingError("");
    if (
      !traktProfileName ||
      !anilistMediaRef(item.id) ||
      !anilistAccessToken(traktProfileName)
    )
      return;
    void anilistMedia(traktProfileName, item.id)
      .then((media) => {
        if (!live || !media) return;
        setAnilistConnected(true);
        setAnilistRating(media.mediaListEntry?.score || null);
        setAnilistProgress(media.mediaListEntry?.progress ?? 0);
      })
      .catch((error) => {
        if (live) setAnilistRatingError(message(error));
      });
    return () => {
      live = false;
    };
  }, [traktProfileName, item.id]);
  async function changeAnilistRating(value: number | null) {
    setAnilistRatingBusy(true);
    setAnilistRatingError("");
    try {
      await rateAniList(traktProfileName, item.id, value);
      setAnilistRating(value);
    } catch (error) {
      setAnilistRatingError(message(error));
    } finally {
      setAnilistRatingBusy(false);
    }
  }
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [episode, setEpisode] = useState<Episode>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [streamsLoaded, setStreamsLoaded] = useState(false);
  const [streamSummary, setStreamSummary] = useState("");
  const [streamSources, setStreamSources] = useState<
    {
      name: string;
      status: "loading" | "responded" | "failed" | "paused";
      streams: number;
      reason?: string;
    }[]
  >([]);
  const [downloadMode, setDownloadMode] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState(false);
  const [readyDownload, setReadyDownload] = useState<{
    url: string;
    filename: string;
    persistentUrl?: string;
  } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [credits, setCredits] = useState<import("./tmdb").Credit[]>([]);
  const [extras, setExtras] = useState<import("./tmdb").TitleExtras>({
    recommendations: [],
    trailers: [],
    studios: [],
  });
  const [person, setPerson] = useState<import("./tmdb").PersonProfile | null>(
    null,
  );
  const [files, setFiles] = useState<{
    torrentId: number;
    files: TorboxFile[];
    episode?: Episode;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const downloadJobId = useRef("");
  const streamRequests = useRef(
    new Map<string, ReturnType<typeof addonStreams>>(),
  );
  function requestStreams(
    target: Item,
    id: string,
    signal?: AbortSignal,
    onSource?: (streams: Stream[], addon: Addon) => void,
  ) {
    if (onSource)
      return addonStreams(addons, target, id, signal, (streams, addon) =>
        onSource(streams, addon),
      );
    const key = `${target.type}:${id}`;
    const existing = streamRequests.current.get(key);
    if (existing) return existing;
    const request = addonStreams(addons, target, id, signal).finally(() => {
      // A completed preload must not hide a later retry or a changed add-on
      // configuration behind a stale result.
      if (streamRequests.current.get(key) === request)
        streamRequests.current.delete(key);
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
        if (result.item.type !== "live") {
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
          void import("./tmdb")
            .then(({ titleExtras }) => titleExtras(result.item, c.signal))
            .then((next) => {
              if (!c.signal.aborted) {
                setExtras(next);
                if (next.certification)
                  setItem((current) => ({
                    ...current,
                    certification: next.certification,
                  }));
              }
            })
            .catch(() => undefined);
        }
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
    fallbackStreams: Stream[] = [],
    fallbackRequest?: Promise<Stream[]>,
  ) {
    setError("");
    setFiles(null);
    const position =
      resume?.episode?.id === ep?.id ? resume?.seconds : undefined;
    if (directStream(stream)) {
      saveStreamLink(streamContentKey(item, ep), stream);
      saveBingeGroup(item.id, stream.behaviorHints?.bingeGroup);
      const playbackForStream = (candidate: Stream): Playback => {
        const quality = streamQuality(candidate);
        const audio = streamAudioCodec(candidate);
        return {
          item,
          episode: ep,
          url: candidate.url!,
          resume: position,
          sourceLabel: candidate.name ?? candidate.addonName ?? "Stream",
          sourceAddonName: candidate.addonName,
          sourceAddonId: candidate.addonId,
          bingeGroup: candidate.behaviorHints?.bingeGroup,
          cacheKey: streamContentKey(item, ep),
          sourceBadges: streamBadgeNames(candidate, streamPreferences()),
          sourceDetail: [
            candidate.addonName && candidate.addonName !== candidate.name
              ? candidate.addonName
              : undefined,
            quality ? `${quality}p` : "Quality not reported",
            audio ? `Audio: ${audio.toUpperCase()}` : undefined,
            candidate.title,
          ]
            .filter(Boolean)
            .join(" · "),
          mode: getService() ? compatibilityPlaybackMode(candidate) : undefined,
          requestHeaders: (
            candidate.behaviorHints?.proxyHeaders as
              { request?: Record<string, string> } | undefined
          )?.request,
          ...playbackSubtitleData(
            addons,
            item,
            ep?.id ?? item.id,
            candidate,
            candidate.url,
          ),
          // Resolved debrid video is regular HTTPS media from the browser's
          // perspective. Try it directly first; Player switches to the
          // compatibility service only after a real playback failure.
          relay: false,
          compatibilityFallback: debridStream(candidate),
        };
      };
      onPlay({
        ...playbackForStream(stream),
        automaticFallbackCount: 2,
        alternatives: fallbackStreams
          .filter((candidate) => directStream(candidate))
          .slice(0, 49)
          .map(playbackForStream),
        alternativesRequest: fallbackRequest?.then((loaded) =>
          sourcePickerStreams(
            loaded,
            addons.map((addon) => addon.manifest.name),
          )
            .filter((candidate) => candidate.url !== stream.url)
            .slice(0, 250)
            .map(playbackForStream),
        ),
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
          ...playbackSubtitleData(
            addons,
            item,
            ep?.id ?? item.id,
            stream,
            resolved.url,
          ),
          mode: undefined,
          relay: false,
          compatibilityFallback: true,
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
      onPlay({
        item,
        episode: ep,
        url,
        resume: position,
        ...playbackSubtitleData(addons, item, ep?.id ?? item.id, stream, url),
        mode: undefined,
        compatibilityFallback: true,
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
    const preparation = await queueDownload(url, filename, headers, signal);
    if (signal?.aborted) return;
    if (preparation.status === "preparing" && preparation.statusPath) {
      if (downloadJobId.current)
        updateDownloadJob({
          id: downloadJobId.current,
          name: filename,
          status: "preparing",
          detail:
            "Preparing in the background. You can keep watching or browse TikTak and follow progress in Download Center.",
          at: Date.now(),
          statusPath: preparation.statusPath,
        });
      setDownloadMode(false);
      setReadyDownload(null);
      setDownloadNotice(true);
      return;
    }
    const downloadUrl = preparation.url;
    if (!downloadUrl) throw new Error("Invalid completed download response.");
    const service = getService();
    const persistentUrl = (() => {
      try {
        const candidate = new URL(downloadUrl);
        return service &&
          candidate.origin === new URL(service.url).origin &&
          /^\/media\/[A-Za-z0-9_-]+\/download\.mp4$/.test(candidate.pathname)
          ? candidate.href
          : undefined;
      } catch {
        return undefined;
      }
    })();
    setReadyDownload({ url: downloadUrl, filename, persistentUrl });
    const managerUrl = persistentUrl ?? downloadUrl;
    if (downloadJobId.current)
      updateDownloadJob({
        id: downloadJobId.current,
        name: filename,
        status: "ready",
        detail:
          "MP4 is ready. Use Download MP4 if the browser does not start it automatically.",
        at: Date.now(),
        url: managerUrl,
        statusPath: undefined,
      });
    setDownloadMode(false);
    // iOS PWAs cannot reliably open an asynchronously prepared file without
    // producing an about:blank tab. Keep the user in TikTak TV and let the
    // Download Center's explicit, user-initiated link open the MP4 instead.
    if (!appleTouchBrowser()) {
      handoffDownload(downloadUrl, filename);
      markDownloadStarted(filename, managerUrl);
    }
  }
  function markDownloadStarted(filename: string, url?: string) {
    if (!downloadJobId.current) return;
    updateDownloadJob({
      id: downloadJobId.current,
      name: filename,
      status: "started",
      detail:
        "Download requested. If it was blocked, use Download MP4 in the Download Center.",
      at: Date.now(),
      url,
    });
  }
  function handoffDownload(downloadUrl: string, filename: string) {
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = filename;
    link.rel = "noopener";
    document.body.append(link);
    link.click();
    link.remove();
  }
  function openReadyDownload(event: React.MouseEvent<HTMLAnchorElement>) {
    if (appleTouchBrowser()) {
      event.preventDefault();
      onOpenDownloads();
      return;
    }
    markDownloadStarted(readyDownload!.filename, readyDownload!.persistentUrl);
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
    setStreamSummary("Finding sources from your installed add-ons…");
    setStreamSources(
      addons
        .filter((addon) => addon.enabled !== false)
        .filter((addon) =>
          addon.manifest.resources?.some((resource) =>
            typeof resource === "string"
              ? resource === "stream"
              : resource.name === "stream" &&
                (!resource.types?.length ||
                  resource.types.includes(item.type)) &&
                (!resource.idPrefixes?.length ||
                  resource.idPrefixes.some((prefix) =>
                    (ep?.id ?? item.id).startsWith(prefix),
                  )),
          ),
        )
        .map((addon) => ({
          name: addon.manifest.name,
          status: "loading" as const,
          streams: 0,
        })),
    );
    setFiles(null);
    const position =
      resume && resume.episode?.id === ep?.id ? resume?.seconds : undefined;
    if (item.source === "xtream") {
      if (!provider || provider.scope !== item.provider) {
        setError("Connect the IPTV account for this title in Settings.");
        return;
      }
      const directLive: Playback = {
        item,
        episode: ep,
        resume: position,
        mode: item.type === "live" ? "direct" : undefined,
        hls: item.type === "live",
        url: streamUrl(
          provider,
          item.type,
          ep?.id ?? item.id,
          item.type === "live" ? "m3u8" : (ep?.extension ?? item.extension),
        ),
      };
      const service = getService();
      const insecureProvider = new URL(provider.server).protocol === "http:";
      onPlay(
        item.type === "live" && service && insecureProvider
          ? {
              ...directLive,
              url: streamUrl(
                provider,
                item.type,
                ep?.id ?? item.id,
                ep?.extension ?? item.extension ?? "ts",
              ),
              requestHeaders: { "User-Agent": "VLC/3.0.0 LibVLC/3.0.0" },
              mode: "transcode",
              hls: false,
              relay: true,
            }
          : item.type === "live" && service
            ? {
                ...directLive,
                automaticFallbackCount: 1,
                alternatives: [
                  {
                    ...directLive,
                    url: streamUrl(
                      provider,
                      item.type,
                      ep?.id ?? item.id,
                      ep?.extension ?? item.extension ?? "ts",
                    ),
                    mode: "transcode",
                    hls: false,
                    relay: true,
                  },
                ],
              }
            : directLive,
      );
      return;
    }
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(!downloadBest);
    setPreparing(auto);
    try {
      const hasDebrid = !!torboxKey || !!realDebridKey;
      let result: StreamSearchResult;
      if (auto && !downloadBest) {
        const preferences = streamPreferences();
        const cached = preferences.reuseLastLink
          ? readStreamLink(
              streamContentKey(item, ep),
              preferences.reuseLastLinkHours,
            )
          : undefined;
        if (cached) {
          const continuedSearch = requestStreams(
            item,
            ep?.id ?? item.id,
            c.signal,
          ).then((loaded) => loaded.streams);
          controller.current = null;
          await chooseStream(cached, ep, c.signal, [], continuedSearch);
          return;
        }
        const selection = await firstAutoplayResult(
          (onSource) =>
            requestStreams(item, ep?.id ?? item.id, c.signal, onSource),
          hasDebrid,
          addons.map((addon) => addon.manifest.name),
          readBingeGroup(item.id),
        );
        if (c.signal.aborted) return;
        if (selection.streams.length) {
          const ranked = [...selection.streams];
          if (nuvioWebSettings.streamSourcePinning) {
            const pinned = localStorage.getItem(
              `tiktak:pinned-source:${item.id}:${ep?.id ?? item.id}`,
            );
            if (pinned)
              ranked.sort(
                (left, right) =>
                  Number(
                    (right.name ?? right.addonName ?? "Stream") === pinned,
                  ) -
                  Number((left.name ?? left.addonName ?? "Stream") === pinned),
              );
          }
          // Playback can close the details dialog immediately. Transfer the
          // still-running add-on search to Player before that unmount cleanup
          // runs, otherwise slower providers (for example Debridio) disappear
          // from the manual source list.
          const keepDiscovering = nuvioWebSettings.backgroundStreamPrefetch;
          if (keepDiscovering) controller.current = null;
          await chooseStream(
            ranked[0],
            ep,
            c.signal,
            ranked.slice(1),
            keepDiscovering
              ? selection.complete.then((result) => result.streams)
              : undefined,
          );
          if (!keepDiscovering) c.abort();
          return;
        }
        if (!selection.result)
          throw new Error("No automatically playable stream was found.");
        result = selection.result;
      } else {
        result = await requestStreams(
          item,
          ep?.id ?? item.id,
          c.signal,
          (loaded, addon) => {
            if (c.signal.aborted || downloadBest) return;
            setStreams((current) =>
              sourcePickerStreams(
                [...current, ...loaded],
                addons.map((addon) => addon.manifest.name),
                hasDebrid,
              ),
            );
            setStreamsLoaded(true);
            setStreamSources((current) =>
              current.map((source) =>
                source.name === addon.manifest.name
                  ? {
                      ...source,
                      status: "responded" as const,
                      streams: loaded.length,
                    }
                  : source,
              ),
            );
          },
        );
      }
      if (c.signal.aborted) return;
      const incompatible = Math.max(
        0,
        result.installedStreaming - result.eligible,
      );
      setStreamSummary(
        `Queried ${result.count} of ${result.installedStreaming} enabled streaming add-ons` +
          `${result.quarantined ? `; ${result.quarantined} temporarily paused` : ""}` +
          `${result.failed ? `; ${result.failed} failed or timed out` : ""}` +
          `${incompatible ? `; ${incompatible} do not support this title ID/type` : ""}.`,
      );
      setStreamSources(result.sources);
      const downloadRanked = rankedStreams(result.streams, hasDebrid);
      const manualSources = sourcePickerStreams(
        result.streams,
        addons.map((addon) => addon.manifest.name),
        hasDebrid,
      );
      const autoplayRanked = autoplayStreams(
        result.streams,
        hasDebrid,
        addons.map((addon) => addon.manifest.name),
        readBingeGroup(item.id),
      );
      if (downloadBest) {
        if (downloadRanked.length)
          await chooseDownload(downloadRanked[0], ep, c.signal);
        else {
          setDownloadMode(false);
          if (downloadJobId.current)
            updateDownloadJob({
              id: downloadJobId.current,
              name: downloadFilename(ep),
              status: "failed",
              detail:
                "No eligible stream was found. Open Sources or check Playback health.",
              at: Date.now(),
            });
          setError("No eligible stream was found to download.");
        }
      } else {
        if (auto && autoplayRanked.length) {
          try {
            await chooseStream(
              autoplayRanked[0],
              ep,
              c.signal,
              autoplayRanked.slice(1),
            );
          } catch (error) {
            if (!c.signal.aborted) {
              setStreams(manualSources);
              setStreamsLoaded(true);
            }
            throw error;
          }
        } else {
          setStreams(manualSources);
          setStreamsLoaded(true);
        }
      }
      if (result.quarantined)
        setError(
          `${result.quarantined} streaming add-on${result.quarantined === 1 ? " is" : "s are"} temporarily paused after repeated failures. Open Settings → Health check to retry now.`,
        );
      else if (!result.count)
        setError(
          result.installedStreaming
            ? "Your streaming add-ons do not support this title ID. Try the title from an IMDb-based catalog or refresh your installed manifests in Settings."
            : "No streaming add-on is installed in this browser profile. Sign in to TikTakTV to sync your add-ons, or install a configured manifest in Settings. Localhost and your website have separate settings.",
        );
      else if (result.failed && !manualSources.length)
        setError(
          `${result.failed} add-on${result.failed === 1 ? "" : "s"} could not be reached. Other results are shown below.`,
        );
    } catch (e) {
      if (!c.signal.aborted) {
        if (downloadBest) {
          setDownloadMode(false);
          if (downloadJobId.current)
            updateDownloadJob({
              id: downloadJobId.current,
              name: downloadFilename(ep),
              status: "failed",
              detail: message(e),
              at: Date.now(),
            });
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
    setReadyDownload(null);
    if (item.type === "series" && !ep) {
      setError(
        "Choose an episode below. TikTak TV will download its best available stream.",
      );
      return;
    }
    downloadJobId.current = crypto.randomUUID();
    updateDownloadJob({
      id: downloadJobId.current,
      name: downloadFilename(ep),
      status: "preparing",
      detail: "Selecting the best 720p+ source and preparing an MP4.",
      at: Date.now(),
    });
    setDownloadNotice(true);
    void play(ep, false, true);
  }
  function appleTouchBrowser() {
    return (
      /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    );
  }
  const seasons = [...new Set(episodes.map((e) => e.season))];
  return (
    <dialog
      ref={ref}
      className="detail-dialog"
      aria-label={`${item.name} details`}
      onCancel={onClose}
    >
      {preparing && (
        <div
          className="detail-preparing"
          role="status"
          aria-live="polite"
          style={
            safeUrl(item.background)
              ? { backgroundImage: `url("${safeUrl(item.background)}")` }
              : undefined
          }
        >
          <div className="detail-preparing-shade" />
          <section>
            <span className="spinner" />
            <span className="eyebrow">
              {downloadMode ? "DOWNLOAD" : "NOW PLAYING"}
            </span>
            <strong>{downloadMode ? "Preparing download" : item.name}</strong>
            <span>
              {downloadMode
                ? "Choosing the best source and creating a compatible MP4…"
                : "Starting video…"}
            </span>
            {!downloadMode && (
              <button
                type="button"
                onClick={() => {
                  controller.current?.abort();
                  setPreparing(false);
                  setBusy(false);
                }}
              >
                Close
              </button>
            )}
          </section>
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
      <div
        className={`detail-content${nuvioWebSettings.metaTabLayout ? ` meta-tab-layout meta-tab-${metaTab}` : ""}`}
      >
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
          {nuvioWebSettings.showParentalGuide && item.certification && (
            <span className="parental-rating">{item.certification}</span>
          )}
        </div>
        {traktConnected && (
          <div className="trakt-rating" aria-label="Your Trakt rating">
            <strong>
              Your Trakt rating:{" "}
              {traktRating === null ? "Not rated" : `${traktRating}/10`}
            </strong>
            <div className="trakt-rating-choices">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={traktRatingBusy}
                    className={traktRating === value ? "selected" : undefined}
                    aria-label={`Rate ${value} out of 10 on Trakt`}
                    onClick={() => void changeTraktRating(value)}
                  >
                    {value}
                  </button>
                ),
              )}
              {traktRating !== null && (
                <button
                  type="button"
                  disabled={traktRatingBusy}
                  onClick={() => void changeTraktRating(null)}
                >
                  Remove rating
                </button>
              )}
            </div>
            {traktRatingError && <p role="alert">{traktRatingError}</p>}
          </div>
        )}
        {simklConnected && (
          <div className="trakt-rating" aria-label="Your Simkl rating">
            <strong>
              Your Simkl rating:{" "}
              {simklRating === null ? "Not rated" : `${simklRating}/10`}
            </strong>
            <div className="trakt-rating-choices">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={simklRatingBusy}
                    className={simklRating === value ? "selected" : undefined}
                    aria-label={`Rate ${value} out of 10 on Simkl`}
                    onClick={() => void changeSimklRating(value)}
                  >
                    {value}
                  </button>
                ),
              )}
              {simklRating !== null && (
                <button
                  type="button"
                  disabled={simklRatingBusy}
                  onClick={() => void changeSimklRating(null)}
                >
                  Remove rating
                </button>
              )}
            </div>
            {simklRatingError && <p role="alert">{simklRatingError}</p>}
          </div>
        )}
        {anilistConnected && (
          <div
            className="trakt-rating"
            aria-label="Your AniList anime progress and rating"
          >
            <strong>
              Your AniList progress: {anilistProgress ?? 0} episode
              {anilistProgress === 1 ? "" : "s"}
            </strong>
            <strong>
              Your AniList rating:{" "}
              {anilistRating === null ? "Not rated" : `${anilistRating}/10`}
            </strong>
            <div className="trakt-rating-choices">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (value) => (
                  <button
                    key={value}
                    type="button"
                    disabled={anilistRatingBusy}
                    className={anilistRating === value ? "selected" : undefined}
                    aria-label={`Rate ${value} out of 10 on AniList`}
                    onClick={() => void changeAnilistRating(value)}
                  >
                    {value}
                  </button>
                ),
              )}
              {anilistRating !== null && (
                <button
                  type="button"
                  disabled={anilistRatingBusy}
                  onClick={() => void changeAnilistRating(null)}
                >
                  Remove rating
                </button>
              )}
            </div>
            {anilistRatingError && <p role="alert">{anilistRatingError}</p>}
          </div>
        )}
        {nuvioWebSettings.metaSections.overview !== false && (
          <p className="description">
            {item.description || "No synopsis is available for this title."}
          </p>
        )}
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
              {resume ? "Resume" : autoplay ? "Play" : "Sources"}
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
          {item.type === "series" &&
            episodes.length > 0 &&
            nuvioWebSettings.randomEpisodeButton && (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void play(
                    episodes[Math.floor(Math.random() * episodes.length)],
                  )
                }
              >
                <Dices size={18} /> Random episode
              </button>
            )}
          {autoplay && item.source === "addon" && item.type === "movie" && (
            <button disabled={busy} onClick={() => void play(undefined, false)}>
              Sources
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
          {item.type !== "live" && (
            <button
              type="button"
              onClick={() =>
                onSetWatched(item, undefined, !isWatched(watched, item))
              }
            >
              <CheckCircle2 size={18} />
              {isWatched(watched, item) ? "Mark unwatched" : "Mark watched"}
            </button>
          )}
          {item.type !== "live" && isWatched(watched, item) && (
            <span className="title-watched-badge" aria-label="Watched">
              <CheckCircle2 size={18} /> Watched
            </span>
          )}
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
        {nuvioWebSettings.metaTabLayout && (
          <nav
            className="detail-tabs"
            aria-label="Title detail sections"
            role="tablist"
          >
            <button
              type="button"
              role="tab"
              className={metaTab === "overview" ? "active" : undefined}
              aria-selected={metaTab === "overview"}
              onClick={() => setMetaTab("overview")}
            >
              Overview
            </button>
            {item.type === "series" && (
              <button
                type="button"
                role="tab"
                className={metaTab === "episodes" ? "active" : undefined}
                aria-selected={metaTab === "episodes"}
                onClick={() => setMetaTab("episodes")}
              >
                Episodes
              </button>
            )}
            <button
              type="button"
              role="tab"
              className={metaTab === "more" ? "active" : undefined}
              aria-selected={metaTab === "more"}
              onClick={() => setMetaTab("more")}
            >
              More
            </button>
          </nav>
        )}
        {nuvioWebSettings.metaSections.cast !== false &&
          (credits.length > 0 || (item.cast?.length ?? 0) > 0) && (
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
                      .then(async ({ peopleByName, personProfile }) => {
                        const resolved = credits.length
                          ? person
                          : (await peopleByName([person.name]))[0];
                        if (!resolved)
                          throw new Error(
                            "This cast member could not be matched. Check the TMDB connection in Settings.",
                          );
                        return personProfile(resolved.id);
                      })
                      .then(setPerson)
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
          <PersonView
            person={person}
            onClose={() => setPerson(null)}
            onSelect={(title) => {
              setPerson(null);
              onSelectItem(title);
            }}
          />
        )}
        {error && (
          <div className="error" role="alert">
            {error}
            {error.startsWith("No streaming add-on") && (
              <button
                onClick={() => {
                  onClose();
                  location.hash = "settings";
                }}
              >
                Open setup and friend codes
              </button>
            )}
          </div>
        )}
        {streamSummary && (
          <div className="stream-search-summary" role="status">
            <p className="muted">{streamSummary}</p>
            {!!streamSources.length && (
              <details>
                <summary>Show queried add-ons</summary>
                <ul>
                  {streamSources.map((source, index) => (
                    <li key={`${source.name}-${index}`}>
                      <strong>{source.name}</strong>
                      <span>
                        {source.status === "responded"
                          ? `${source.streams} stream${source.streams === 1 ? "" : "s"}`
                          : source.status === "loading"
                            ? "Loading…"
                          : source.status === "paused"
                            ? "Temporarily paused"
                            : (source.reason ?? "Request failed")}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
        {readyDownload && (
          <div className="download-ready" role="status">
            <div>
              <strong>Your MP4 is ready</strong>
              <p>
                {appleTouchBrowser()
                  ? "Use View download manager, then tap Open MP4 / Save to Files when you are ready."
                  : "If your browser did not start automatically, download it here."}
              </p>
            </div>
            <a
              className="primary"
              href={readyDownload.url}
              download={readyDownload.filename}
              target={appleTouchBrowser() ? "_blank" : undefined}
              rel="noopener"
              onClick={openReadyDownload}
            >
              <Download size={18} />
              {appleTouchBrowser() ? "View download manager" : "Save MP4"}
            </a>
          </div>
        )}
        {downloadNotice && (
          <div
            className="download-queued-popup"
            role="dialog"
            aria-label="Download added"
          >
            <div>
              <strong>Download added</strong>
              <p>
                Preparation and any available MP4 action are in your download
                manager.
              </p>
            </div>
            <button className="primary" onClick={onOpenDownloads}>
              View download manager
            </button>
            <button onClick={() => setDownloadNotice(false)}>
              Continue browsing
            </button>
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
        {nuvioWebSettings.metaSections.episodes !== false &&
          item.type === "series" &&
          episodes.length > 0 && (
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
                .map((ep) => {
                  const episodeWatched = isEpisodeWatched(
                    watched,
                    item,
                    ep,
                    resume?.episode,
                  );
                  return (
                    <div
                      className={`episode-row${!episodeWatched && nuvioWebSettings.blurUnwatchedEpisodes ? " blur-unwatched" : ""}`}
                      key={ep.id}
                    >
                      <button
                        className="episode-play"
                        disabled={busy}
                        onClick={() =>
                          downloadMode ? download(ep) : void play(ep)
                        }
                      >
                        <span className="episode-number">{ep.episode}</span>
                        <span>{ep.name}</span>
                        {nuvioWebSettings.showEpisodeRatings && ep.rating && (
                          <span className="episode-rating">
                            <Star size={13} fill="currentColor" /> {ep.rating}
                          </span>
                        )}
                        <span className="episode-row-status">
                          {episodeWatched && (
                            <span className="episode-watched-badge">
                              <CheckCircle2 size={16} /> Watched
                            </span>
                          )}
                          {downloadMode ? (
                            <Download size={18} />
                          ) : (
                            <Play size={18} />
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="episode-watch-toggle"
                        disabled={busy}
                        aria-label={`Mark episode ${ep.episode} ${episodeWatched ? "unwatched" : "watched"}`}
                        onClick={() =>
                          onSetWatched(item, ep, !isWatched(watched, item, ep))
                        }
                      >
                        <CheckCircle2 size={17} />
                      </button>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
        {!busy && item.type === "series" && !episodes.length && (
          <p className="muted no-episodes">
            No episodes were returned by this source.
          </p>
        )}
        {nuvioWebSettings.metaSections.production !== false &&
          extras.studios.length > 0 && (
          <section className="detail-info-section">
            <h2>Production</h2>
            <div className="detail-chip-row">
              {extras.studios.map((studio) => (
                <span key={studio}>{studio}</span>
              ))}
            </div>
          </section>
        )}
        {nuvioWebSettings.metaSections.trailers !== false &&
          extras.trailers.length > 0 && (
          <section className="detail-trailer-section">
            <h2>Trailers</h2>
            <div className="detail-trailer-row">
              {extras.trailers.map((trailer) => (
                <button
                  key={trailer.id}
                  onClick={() => onTrailer(trailer.videoId, trailer.name)}
                >
                  <img
                    src={`https://i.ytimg.com/vi/${trailer.videoId}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                  />
                  <span>
                    <Play size={18} fill="currentColor" />
                    {trailer.name}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
        {nuvioWebSettings.metaSections.moreLikeThis !== false &&
          extras.recommendations.length > 0 && (
          <section className="detail-recommendations">
            <div className="row-heading">
              <h2>More like this</h2>
            </div>
            <div className="rail">
              {extras.recommendations.map((recommendation) => (
                <Card
                  key={itemKey(recommendation)}
                  item={recommendation}
                  onOpen={onSelectItem}
                />
              ))}
            </div>
          </section>
        )}
        {streamsLoaded && (
          <div className="stream-results">
            <h2>
              {downloadMode ? "Choose a stream to download" : "Choose a stream"}
              {episode ? ` · Episode ${episode.episode}` : ""}
            </h2>
            {streams.length === 0 && (
              <p className="muted">No streams found. Try another source.</p>
            )}
            {streams.map((s, i) => {
              const playable =
                directStream(s) ||
                (!!s.infoHash && (!!torboxKey || !!realDebridKey));
              const compatibility = streamCompatibility(s);
              const languages = streamAudioLanguages(s);
              return (
                <Fragment key={`${s.addonId ?? s.addonName ?? "stream"}:${i}`}>
                  {(i === 0 ||
                    streams[i - 1]?.addonName !== s.addonName) && (
                    <div className="stream-addon-heading">
                      <strong>{s.addonName ?? "Other sources"}</strong>
                      <span>
                        {
                          streams.filter(
                            (candidate) =>
                              candidate.addonName === s.addonName,
                          ).length
                        }
                      </span>
                    </div>
                  )}
                  <button
                    disabled={!playable || busy}
                    onClick={() => void manualStream(s)}
                  >
                    {downloadMode ? (
                      <Download size={20} />
                    ) : (
                      <Play size={20} />
                    )}
                    <span>
                      <strong>{s.name ?? "Stream"}</strong>
                      <em
                        className={`compatibility-badge ${compatibility.kind}`}
                        title={compatibility.detail}
                      >
                        {compatibility.label}
                      </em>
                      <small>
                        {streamQuality(s)
                          ? `${streamQuality(s)}p`
                          : "Quality not reported"}
                        {seeders(s) >= 0 ? ` · ${seeders(s)} seeders` : ""}
                        {s.infoHash ? " · Debrid" : ""}
                        {languages.length
                          ? ` · Audio: ${languages.join(", ")}`
                          : ""}
                      </small>
                      <span>
                        {s.title ??
                          (playable
                            ? "HTTPS video"
                            : s.infoHash
                              ? "Torrent source — connect a debrid resolver"
                              : "Not directly playable in a browser")}
                      </span>
                    </span>
                  </button>
                </Fragment>
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
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [profileSyncLoaded, setProfileSyncLoaded] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [activeProfileView, setActiveProfileView] = useState<{
    name: string;
    image?: string;
    color?: string;
  } | null>(null);
  const [setupWizardKey, setSetupWizardKey] = useState("");
  const [forceProfileSelection, setForceProfileSelection] = useState(false);
  const [page, setPage] = useState<Page>(route);
  const [collectionBrowsing, setCollectionBrowsing] = useState(false);
  const [provider, setProvider] = useState<Provider | null>(getProvider);
  const [epgUrl, setEpgUrl] = useStored("epg-url", "");
  const [addons, setAddons] = useStored<Addon[]>("addons", defaultAddons);
  const [library, setLibrary] = useStored<Item[]>("library", []);
  const [accent, setAccent] = useStored("accent", "#9b5cff");
  const [collections, setCollections] = useStored<Collection[]>(
    "collections",
    [],
  );
  const [autoplay, setAutoplay] = useStored("autoplay", true);
  const [sourcePreferences, setSourcePreferences] =
    useState<StreamPreferences>(streamPreferences);
  useEffect(() => {
    setAutoplay(sourcePreferences.autoPlayMode !== "manual");
  }, [sourcePreferences.autoPlayMode, setAutoplay]);
  useEffect(() => {
    const changed = () => setSourcePreferences(streamPreferences());
    window.addEventListener("tiktak:stream-preferences-changed", changed);
    return () =>
      window.removeEventListener(
        "tiktak:stream-preferences-changed",
        changed,
      );
  }, []);
  const [nuvioWebSettings, setNuvioWebSettings] =
    useState<NuvioWebSettings>(readNuvioWebSettings);
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
    normalizeYouTubeProgress(read("progress", [])),
  );
  const continueWatching = useMemo(
    () => organizeContinueWatching(progress, nuvioWebSettings),
    [
      progress,
      nuvioWebSettings.continueWatchingShowUnaired,
      nuvioWebSettings.continueWatchingSort,
    ],
  );
  const [watched, setWatched] = useState<WatchedItem[]>(() =>
    read("watched", []),
  );
  useEffect(() => {
    if (!profileReady || !nuvioWebSettings.episodeNotifications) return;
    let checking = false;
    const check = () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      void notifyDueEpisodes(
        progress,
        nuvioWebSettings.notificationLeadMinutes,
        activeProfileView?.name ?? "local",
      ).finally(() => {
        checking = false;
      });
    };
    check();
    const timer = window.setInterval(check, 60_000);
    const visible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [
    profileReady,
    progress,
    activeProfileView?.name,
    nuvioWebSettings.episodeNotifications,
    nuvioWebSettings.notificationLeadMinutes,
  ]);
  useEffect(() => {
    if (!profileReady) return;
    const missing = progress.filter(youtubeProgressNeedsTitle).slice(0, 30);
    if (!missing.length) return;
    let cancelled = false;
    void Promise.all(
      missing.map(async (entry) => {
        const videoId = youtubeVideoIdFromItem(entry.item)!;
        return {
          videoId,
          metadata: await resolveYouTubeProgressTitle(videoId),
        };
      }),
    ).then((resolved) => {
      if (cancelled) return;
      const byId = new Map(
        resolved
          .filter((entry) => entry.metadata)
          .map((entry) => [entry.videoId, entry.metadata!]),
      );
      if (!byId.size) return;
      setProgress((current) => {
        const updated = current.map((entry) => {
          if (!youtubeProgressNeedsTitle(entry)) return entry;
          const metadata = byId.get(youtubeVideoIdFromItem(entry.item)!);
          return metadata
            ? {
                ...entry,
                item: {
                  ...entry.item,
                  name: metadata.title,
                  poster: metadata.thumbnail || entry.item.poster,
                },
              }
            : entry;
        });
        save("progress", updated);
        return updated;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [profileReady, progress]);
  function loadAccountSetup(s: Setup, syncedTraktProfile = "") {
    // Failure history belongs to the previous browser profile and must never
    // suppress an add-on for a different Nuvio user.
    clearProfileTransientStorage();
    clearSourceCache();
    setRecentChannels([]);
    if (s.playbackService && !s.playbackService.account)
      localStorage.setItem(
        "nuvio:playback-service",
        JSON.stringify(s.playbackService),
      );
    else localStorage.removeItem("nuvio:playback-service");
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
    const restoredProgress = normalizeYouTubeProgress(s.progress);
    setProgress(restoredProgress);
    save("progress", restoredProgress);
    const restoredWatched = s.watched ?? [];
    setWatched(restoredWatched);
    save("watched", restoredWatched);
    if (s.trakt !== undefined)
      void reconcileTraktCredential(
        syncedTraktProfile ||
          traktProfileIdentity(activeProfileView?.name ?? ""),
        s.trakt,
      ).catch(() => undefined);
    setProvider(s.provider);
    storeProvider(s.provider, true);
    setEpgUrl(s.epgUrl ?? "");
    setTorboxKey(s.torboxKey);
    save("torbox-key", s.torboxKey);
    sessionStorage.removeItem("nuvio:torbox-key");
    setRealDebridKey(s.realDebridKey);
    save("realdebrid-key", s.realDebridKey);
    sessionStorage.removeItem("nuvio:realdebrid-key");
    const restoredSourcePreferences = normalizeStreamPreferences(
      s.streamPreferences ?? {
        ...sourcePreferences,
        autoPlayMode: s.autoplay ? sourcePreferences.autoPlayMode : "manual",
      },
    );
    saveStreamPreferences(restoredSourcePreferences);
    setSourcePreferences(restoredSourcePreferences);
    setAutoplay(restoredSourcePreferences.autoPlayMode !== "manual");
    const restoredNuvioWebSettings = normalizeNuvioWebSettings(
      s.nuvioWebSettings ?? nuvioWebSettings,
    );
    saveNuvioWebSettings(restoredNuvioWebSettings);
    setNuvioWebSettings(restoredNuvioWebSettings);
    setHomeCatalogs(s.homeCatalogs ?? []);
  }
  const [playlist, setPlaylist] = useState<Item[]>([]);
  const guidedPlaylist = useMemo(
    () => playlist.filter((item) => item.epgId?.trim()),
    [playlist],
  );
  const [query, setQuery] = useState("");
  const searchProfile = activeProfileView?.name ?? "local";
  const [recentSearches, setRecentSearches] = useState(() =>
    readSearchHistory("local"),
  );
  useEffect(() => {
    setRecentSearches(readSearchHistory(searchProfile));
  }, [searchProfile]);
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState<Kind>("movie");
  const [searchScope, setSearchScope] = useState<"all" | Kind>("all");
  const [searchSuggestion, setSearchSuggestion] = useState("");
  const [exactSearch, setExactSearch] = useState(false);
  const [source, setSource] = useState("catalogs");
  const [selectedCatalog, setSelectedCatalog] = useState("");
  const [category, setCategory] = useState("");
  const [region, setRegion] = useState(localLiveRegion);
  const [categoryList, setCategoryList] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [homeRows, setHomeRows] = useState<
    { title: string; items: Item[]; catalogKey: string }[]
  >([]);
  const loadedHomeRef = useRef<{
    addons: Addon[];
    homeCatalogs: HomeCatalogSetting[];
    revision: number;
    loadedAt: number;
  } | null>(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [heroPreview, setHeroPreview] = useState<{
    key: string;
    videoId: string;
  } | null>(null);
  const [heroPreviewSound, setHeroPreviewSound] = useState(false);
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
    // GitHub's unauthenticated contents API allows 60 requests/hour/IP.
    // Two-minute polling leaves capacity for failure and visibility refreshes.
    const timer = window.setInterval(refresh, 120_000);
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
  const [guideLimit, setGuideLimit] = useState(initialGuideLimit);
  const [liveView, setLiveView] = useState<"guide" | "sports">("guide");
  const [selectedGuide, setSelectedGuide] = useState<{
    channel: Item;
    programme: Programme;
  } | null>(null);
  const [detail, setDetail] = useState<Item | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [nextEpisode, setNextEpisode] = useState<Episode | null>(null);
  const nextEpisodeRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    setNextEpisode(null);
    if (playback?.item.type !== "series" || !playback.episode || playback.party)
      return;
    const controller = new AbortController();
    const item = playback.item;
    const current = playback.episode;
    const details =
      item.source === "addon"
        ? addonDetail(item, controller.signal).catch((error) => {
            if (
              controller.signal.aborted ||
              item.provider === defaultAddon.base ||
              !/^(?:tt\d+|tmdb:\d+)$/.test(item.id)
            )
              throw error;
            return addonDetail(
              { ...item, provider: defaultAddon.base },
              controller.signal,
            );
          })
        : item.source === "xtream" &&
            provider &&
            provider.scope === item.provider
          ? providerDetail(provider, item, controller.signal)
          : Promise.resolve({ item, episodes: [] });
    void details
      .then(({ episodes }) => {
        if (!controller.signal.aborted)
          setNextEpisode(findNextEpisode(episodes, current));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [playback?.item, playback?.episode, playback?.party, provider]);
  useEffect(() => () => nextEpisodeRequest.current?.abort(), []);
  async function playNextEpisode() {
    const current = playback;
    const episode = nextEpisode;
    if (!current || !episode || current.item.type !== "series") return;
    nextEpisodeRequest.current?.abort();
    const controller = new AbortController();
    nextEpisodeRequest.current = controller;
    const item = current.item;
    let next: Playback;
    if (item.source === "xtream") {
      if (!provider || provider.scope !== item.provider)
        throw new Error(
          "Reconnect the IPTV account for this series in Settings.",
        );
      next = {
        item,
        episode,
        url: streamUrl(provider, "series", episode.id, episode.extension),
      };
    } else if (item.source === "addon") {
      const selection = await firstAutoplayResult(
        (onSource) =>
          addonStreams(addons, item, episode.id, controller.signal, (streams) =>
            onSource(streams),
          ),
        !!torboxKey || !!realDebridKey,
        addons.map((addon) => addon.manifest.name),
        readBingeGroup(item.id),
      );
      if (controller.signal.aborted) return;
      const ranked = selection.streams;
      const candidate = ranked[0];
      if (!candidate?.url || !directStream(candidate))
        throw new Error(
          "No automatically playable stream was found for the next episode. Open the series details to choose a source.",
        );
      const toPlayback = (stream: Stream): Playback => ({
        item,
        episode,
        url: stream.url!,
        sourceLabel: stream.name ?? stream.addonName ?? "Stream",
        sourceAddonName: stream.addonName,
        sourceAddonId: stream.addonId,
        bingeGroup: stream.behaviorHints?.bingeGroup,
        cacheKey: streamContentKey(item, episode),
        sourceBadges: streamBadgeNames(stream, streamPreferences()),
        sourceDetail: stream.title,
        mode: getService() ? compatibilityPlaybackMode(stream) : undefined,
        requestHeaders: (
          stream.behaviorHints?.proxyHeaders as
            { request?: Record<string, string> } | undefined
        )?.request,
        ...playbackSubtitleData(addons, item, episode.id, stream, stream.url),
        relay: false,
        compatibilityFallback: debridStream(stream),
      });
      next = {
        ...toPlayback(candidate),
        automaticFallbackCount: 2,
        alternatives: ranked.slice(1, 50).filter(directStream).map(toPlayback),
        alternativesRequest: selection.complete.then((result) =>
          sourcePickerStreams(
            result.streams,
            addons.map((addon) => addon.manifest.name),
          )
            .filter((stream) => stream.url !== candidate.url)
            .slice(0, 250)
            .map(toPlayback),
        ),
      };
    } else {
      throw new Error("This series has no automatic next-episode source.");
    }
    if (controller.signal.aborted) return;
    setNextEpisode(null);
    setPlayback(next);
  }
  const [youtubeResumeRequest, setYoutubeResumeRequest] =
    useState<YouTubeResumeRequest | null>(null);
  const [activeChannel, setActiveChannel] = useState<Item | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [libraryType, setLibraryType] = useState<
    "all" | "movie" | "series" | "live"
  >("all");
  const [recentChannels, setRecentChannels] = useStored<Item[]>(
    "recent-channels",
    [],
  );
  const [toast, setToast] = useState("");
  const [offline, setOffline] = useState(!navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [update, setUpdate] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const partyAttemptedRef = useRef("");
  useEffect(() => {
    if (!profileReady || playback) return;
    const id = new URL(location.href).searchParams.get("party")?.trim() ?? "";
    if (!id || id === partyAttemptedRef.current) return;
    partyAttemptedRef.current = id;
    void joinParty(id, {
      name: activeProfileView?.name || "Guest",
      avatar: activeProfileView?.image,
    }).then(
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
  }, [
    profileReady,
    playback,
    activeProfileView?.name,
    activeProfileView?.image,
  ]);
  const navigate = (next: Page) => {
    setCollectionBrowsing(false);
    location.hash = next;
    setQuery("");
    setSearchScope("all");
    setSearchSuggestion("");
    setExactSearch(false);
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
    const ready = () => setUpdateReady(true);
    window.addEventListener("tiktak:update-ready", ready);
    return () => window.removeEventListener("tiktak:update-ready", ready);
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--accent", accent);
  }, [accent]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.nuvioNavigation = nuvioWebSettings.navigationStyle;
    root.dataset.nuvioHero = nuvioWebSettings.heroMode;
    root.dataset.nuvioPosterSize = nuvioWebSettings.posterSize;
    root.dataset.nuvioCardDepth = nuvioWebSettings.cardDepth;
    root.dataset.nuvioPosterLayout = nuvioWebSettings.posterLayout;
    root.dataset.nuvioHidePosterLabels = String(
      nuvioWebSettings.hidePosterLabels,
    );
    root.dataset.nuvioContinueStyle = nuvioWebSettings.continueWatchingStyle;
    root.dataset.nuvioCatalogType = String(nuvioWebSettings.showCatalogType);
    root.dataset.nuvioCatalogUnderline = String(
      !nuvioWebSettings.hideCatalogUnderline,
    );
    root.dataset.nuvioBlurUpcoming = String(
      nuvioWebSettings.continueWatchingBlurUpcoming,
    );
    root.dataset.nuvioMetaBackground = nuvioWebSettings.metaBackgroundMode;
    root.dataset.nuvioEpisodeStyle = nuvioWebSettings.episodeCardStyle;
    root.dataset.nuvioLibraryLayout = nuvioWebSettings.libraryLayout;
    root.style.setProperty(
      "--nuvio-catalog-columns",
      String(nuvioWebSettings.homeCatalogColumns),
    );
    root.style.setProperty(
      "--nuvio-poster-radius",
      `${nuvioWebSettings.posterCornerRadius}px`,
    );
    root.style.setProperty(
      "--nuvio-subtitle-scale",
      String(nuvioWebSettings.subtitleSize / 100),
    );
    root.style.setProperty(
      "--nuvio-subtitle-background",
      String(nuvioWebSettings.subtitleBackground / 100),
    );
    root.style.setProperty(
      "--nuvio-subtitle-bottom",
      `${nuvioWebSettings.subtitlePosition}%`,
    );
    root.dataset.nuvioSubtitleFont = nuvioWebSettings.subtitleFont;
    if (nuvioWebSettings.preferredAudioLanguage !== "device")
      localStorage.setItem(
        "tiktak:audio-language",
        nuvioWebSettings.preferredAudioLanguage,
      );
    else localStorage.removeItem("tiktak:audio-language");
    if (nuvioWebSettings.secondaryPreferredAudioLanguage !== "none")
      localStorage.setItem(
        "tiktak:secondary-audio-language",
        nuvioWebSettings.secondaryPreferredAudioLanguage,
      );
    else localStorage.removeItem("tiktak:secondary-audio-language");
    if (
      nuvioWebSettings.preferredSubtitleLanguage !== "device" &&
      nuvioWebSettings.preferredSubtitleLanguage !== "none"
    )
      localStorage.setItem(
        "tiktak:subtitle-language",
        nuvioWebSettings.preferredSubtitleLanguage,
      );
    else localStorage.removeItem("tiktak:subtitle-language");
    if (nuvioWebSettings.secondaryPreferredSubtitleLanguage !== "none")
      localStorage.setItem(
        "tiktak:secondary-subtitle-language",
        nuvioWebSettings.secondaryPreferredSubtitleLanguage,
      );
    else localStorage.removeItem("tiktak:secondary-subtitle-language");
    writeNextEpisodeAutoAdvance(nuvioWebSettings.autoPlayNextEpisode);
  }, [nuvioWebSettings]);
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
  const catalogs = addons
    .filter((a) => a.enabled !== false)
    .flatMap((a) =>
      (a.manifest.catalogs ?? [])
        .filter(
          (c) =>
            (c.type === kind || c.type === "trakt" || c.type === "all") &&
            !c.extra?.some((e) => e.isRequired && e.name !== "search"),
        )
        .map((c) => ({
          addon: a,
          catalog: c,
          key: `${a.base}|${c.type}|${c.id}`,
        })),
    );
  const activeCatalog =
    catalogs.find((entry) => entry.key === selectedCatalog) ?? catalogs[0];
  const catalogGenreOptions =
    activeCatalog?.catalog.extra?.find((extra) => extra.name === "genre")
      ?.options ?? [];
  useEffect(() => {
    if (page !== "home") return;
    const loaded = loadedHomeRef.current;
    if (
      loaded &&
      loaded.addons === addons &&
      loaded.homeCatalogs === homeCatalogs &&
      loaded.revision === revision &&
      Date.now() - loaded.loadedAt < 5 * 60_000 &&
      homeRows.length
    ) {
      setLoading(false);
      return;
    }
    const c = new AbortController();
    setLoading(true);
    setError("");
    const entries = homeCatalogEntries(addons, homeCatalogs);
    void Promise.allSettled(
      entries.map(async ({ addon, catalog: entryCatalog, customTitle }) => {
        let items = await catalog(
          addon,
          entryCatalog.type,
          entryCatalog.id,
          "",
          c.signal,
        );
        // Some catalogs declare optional genre choices but return no default
        // page. Try their first advertised choice before showing an empty row.
        const firstOption = entryCatalog.extra?.find(
          (extra) => extra.name === "genre",
        )?.options?.[0];
        if (!items.length && firstOption) {
          items = await catalog(
            addon,
            entryCatalog.type,
            entryCatalog.id,
            "",
            c.signal,
            firstOption,
          );
        }
        return {
          title: customTitle || entryCatalog.name || addon.manifest.name,
          items,
          catalogKey: `${addon.base}|${entryCatalog.type}|${entryCatalog.id}`,
        };
      }),
    ).then((results) => {
      if (c.signal.aborted) return;
      const rows = results.flatMap((r) =>
        r.status === "fulfilled" && r.value.items.length ? [r.value] : [],
      );
      setHomeRows(rows);
      if (rows.length) {
        loadedHomeRef.current = {
          addons,
          homeCatalogs,
          revision,
          loadedAt: Date.now(),
        };
      }
      if (nuvioWebSettings.hideUnreleasedContent)
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
  }, [
    page,
    addons,
    homeCatalogs,
    revision,
    nuvioWebSettings.hideUnreleasedContent,
  ]);
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
        ? `items:${provider.scope}:${type}:${category || "all"}${page === "live" ? ":guided-v1" : ""}`
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
                      ...cached.filter((item) => item.epgId?.trim()),
                      ...guidedPlaylist.filter(
                        (i) => !category || i.category === category,
                      ),
                    ]
                  : cached,
              );
              setLoading(false);
            } else if (!c.signal.aborted) {
              setItems(
                page === "live"
                  ? guidedPlaylist.filter(
                      (i) => !category || i.category === category,
                    )
                  : [],
              );
            }
            result = await providerItems(provider, type, category, c.signal, {
              guideOnly: page === "live",
            });
            if (!c.signal.aborted) void writeLiveCache(cacheKey, result);
          }
          if (page === "live")
            result = [
              ...result,
              ...guidedPlaylist.filter(
                (i) => !category || i.category === category,
              ),
            ];
        } else {
          const chosen =
            catalogs.find((x) => x.key === selectedCatalog) ?? catalogs[0];
          if (deferredQuery) {
            const scopes: Kind[] =
              searchScope === "all" ? ["movie", "series"] : [searchScope];
            let tmdbMatches: Item[] = [];
            try {
              tmdbMatches = await (
                await import("./tmdb")
              ).searchTmdbTitles(deferredQuery, c.signal);
            } catch (failure) {
              if (c.signal.aborted) return;
              console.warn("Title suggestion search failed", failure);
            }
            const searchable = addons.flatMap((addon) =>
              (addon.manifest.catalogs ?? [])
                .filter(
                  (entry) =>
                    (scopes.includes(entry.type as Kind) ||
                      entry.type === "trakt" ||
                      entry.type === "all") &&
                    entry.extra?.some((extra) => extra.name === "search"),
                )
                .map((entry) => ({ addon, catalog: entry })),
            );
            let catalogMatches = await Promise.allSettled(
              searchable.map((entry) =>
                catalog(
                  entry.addon,
                  entry.catalog.type,
                  entry.catalog.id,
                  deferredQuery,
                  c.signal,
                ),
              ),
            );
            const originalCandidates = [
              ...tmdbMatches.map((item) => item.name),
              ...catalogMatches.flatMap((match) =>
                match.status === "fulfilled"
                  ? match.value.map((item) => item.name)
                  : [],
              ),
            ];
            const hasExactQueryResults = hasRelevantTitle(
              deferredQuery,
              originalCandidates,
            );
            let suggestion = exactSearch
              ? searchSuggestion
              : hasExactQueryResults
                ? ""
                : closestTitleCorrection(deferredQuery, originalCandidates);
            if (!suggestion && !exactSearch && !hasExactQueryResults) {
              const probeMatches = await Promise.allSettled(
                correctionSearchProbes(deferredQuery).map((probe) =>
                  import("./tmdb").then((module) =>
                    module.searchTmdbTitles(probe, c.signal),
                  ),
                ),
              );
              suggestion = closestTitleCorrection(deferredQuery, [
                ...originalCandidates,
                ...probeMatches.flatMap((match) =>
                  match.status === "fulfilled"
                    ? match.value.map((item) => item.name)
                    : [],
                ),
              ]);
            }
            if (!c.signal.aborted) setSearchSuggestion(suggestion);
            const searchTerm =
              suggestion && !exactSearch ? suggestion : deferredQuery;
            if (searchTerm !== deferredQuery) {
              const corrected = await Promise.allSettled([
                import("./tmdb").then((module) =>
                  module.searchTmdbTitles(searchTerm, c.signal),
                ),
                ...searchable.map((entry) =>
                  catalog(
                    entry.addon,
                    entry.catalog.type,
                    entry.catalog.id,
                    searchTerm,
                    c.signal,
                  ),
                ),
              ]);
              if (corrected[0]?.status === "fulfilled")
                tmdbMatches = corrected[0].value;
              catalogMatches = corrected.slice(1);
            }
            result = rankExactTitleFirst(
              dedupeSearchTitles([
                ...catalogMatches.flatMap((match) =>
                  match.status === "fulfilled"
                    ? match.value.filter((item) => scopes.includes(item.type))
                    : [],
                ),
                ...tmdbMatches.filter((item) => scopes.includes(item.type)),
              ]),
              searchTerm,
            );
          } else if (chosen) {
            setSearchSuggestion("");
            result = await catalog(
              chosen.addon,
              chosen.catalog.type,
              chosen.catalog.id,
              "",
              c.signal,
              category || undefined,
            );
            if (!result.length && !category) {
              const firstOption = chosen.catalog.extra?.find(
                (extra) => extra.name === "genre",
              )?.options?.[0];
              if (firstOption) {
                result = await catalog(
                  chosen.addon,
                  chosen.catalog.type,
                  chosen.catalog.id,
                  "",
                  c.signal,
                  firstOption,
                );
                if (!c.signal.aborted) setCategory(firstOption);
              }
            }
          }
        }
        if (!c.signal.aborted)
          setItems(
            source === "catalogs" && page === "discover" && !deferredQuery
              ? result.filter((item) => item.type === kind)
              : result,
          );
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
    searchScope,
    exactSearch,
    addons,
    guidedPlaylist,
    revision,
    page === "discover" && source === "catalogs" ? deferredQuery : "",
  ]);
  const savedKeys = useMemo(
    () => new Set(library.map((item) => itemKey(item))),
    [library],
  );
  const saved = (item: Item) => savedKeys.has(itemKey(item));
  const toggleSave = (item: Item) =>
    setLibrary((old) =>
      old.some((i) => itemKey(i) === itemKey(item))
        ? old.filter((i) => itemKey(i) !== itemKey(item))
        : [...old, cleanItem(item)],
    );
  const open = (item: Item) => {
    const youtubeVideoId = youtubeVideoIdFromItem(item);
    if (youtubeVideoId) {
      const savedPosition = progress.find(
        (entry) => itemKey(entry.item) === itemKey(item),
      )?.seconds;
      setYoutubeResumeRequest({
        videoId: youtubeVideoId,
        seconds: savedPosition ?? 0,
        title: item.name,
        thumbnail: item.poster,
      });
      navigate("youtube");
      return;
    }
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
    setHeroPreview(null);
    setHeroPreviewSound(false);
    if (
      page !== "home" ||
      !hero ||
      !nuvioWebSettings.motionPreviews ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      (
        navigator as Navigator & {
          connection?: { saveData?: boolean };
        }
      ).connection?.saveData
    )
      return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void import("./tmdb")
        .then(({ titleExtras }) => titleExtras(hero, controller.signal))
        .then((extras) => {
          const trailer = extras.trailers[0];
          if (!controller.signal.aborted && trailer)
            setHeroPreview({
              key: itemKey(hero),
              videoId: trailer.videoId,
            });
        })
        .catch(() => undefined);
    }, 1800);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    page,
    hero?.id,
    hero?.type,
    hero?.source,
    nuvioWebSettings.motionPreviews,
  ]);
  useEffect(() => {
    if (
      page !== "home" ||
      !nuvioWebSettings.heroAutoScroll ||
      heroItems.length < 2
    )
      return;
    const timer = window.setInterval(
      () => setHeroIndex((current) => (current + 1) % heroItems.length),
      8_000,
    );
    return () => window.clearInterval(timer);
  }, [page, heroItems.length, nuvioWebSettings.heroAutoScroll]);
  useEffect(() => {
    if (heroIndex >= heroItems.length) setHeroIndex(0);
  }, [heroIndex, heroItems.length]);
  const categoryNameById = useMemo(
    () => new Map(categoryList.map((entry) => [entry.id, entry.name])),
    [categoryList],
  );
  const regionOf = useCallback(
    (item: Item) =>
      liveRegion(
        categoryNameById.get(item.category ?? "") ?? item.category ?? item.name,
      ),
    [categoryNameById],
  );
  const availableRegions = useMemo(() => {
    const present = new Set(items.map(regionOf));
    return liveRegions.filter(([code]) => present.has(code));
  }, [items, regionOf]);
  useEffect(() => {
    if (
      page === "live" &&
      items.length > 0 &&
      region &&
      !availableRegions.some(([code]) => code === region)
    )
      setRegion("");
  }, [availableRegions, items.length, page, region]);
  const filtered = useMemo(() => {
    const result = (page === "library" ? library : items).filter(
        (i) =>
          (!deferredQuery ||
            (page === "discover" && source === "catalogs") ||
            i.name
              .toLocaleLowerCase()
              .includes(deferredQuery.toLocaleLowerCase())) &&
          (page !== "live" || !region || regionOf(i) === region) &&
          (!favoritesOnly || saved(i)) &&
          (page !== "library" ||
            libraryType === "all" ||
            i.type === libraryType),
      );
    if (page !== "library") return result;
    if (nuvioWebSettings.librarySort === "title-asc")
      return [...result].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    if (nuvioWebSettings.librarySort === "title-desc")
      return [...result].sort((left, right) =>
        right.name.localeCompare(left.name),
      );
    if (nuvioWebSettings.librarySort === "added-asc") return result;
    return [...result].reverse();
  }, [
      deferredQuery,
      favoritesOnly,
      items,
      library,
      page,
      region,
      regionOf,
      savedKeys,
      source,
      libraryType,
      nuvioWebSettings.librarySort,
    ]);
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
  const setWatchedStatus = (
    item: Item,
    episode: Episode | undefined,
    nextWatched: boolean,
  ) => {
    setWatched((current) => {
      const next = nextWatched
        ? markWatched(current, item, episode)
        : unmarkWatched(current, item, episode);
      save("watched", next);
      return next;
    });
    if (nextWatched)
      setProgress((current) => {
        const next = current.filter(
          (entry) =>
            itemKey(entry.item) !== itemKey(item) ||
            (episode && entry.episode?.id !== episode.id),
        );
        save("progress", next);
        return next;
      });
    setToast(
      `${episode ? `${item.name} · ${episode.name}` : item.name} was marked ${nextWatched ? "watched" : "unwatched"}.`,
    );
  };
  const guideState = useGuide(
    provider,
    // Index every guided channel. The old 120/240-channel probe ceiling left
    // most large IPTV accounts permanently absent from both TV guide and
    // Sports matching even though the channel list was already available.
    page === "live" ? filtered : [],
    activeChannel,
    revision,
    epgUrl,
  );
  const guideChannels = useMemo(
    () => filtered.filter(guideState.hasUpcoming),
    [filtered, guideState.hasUpcoming],
  );
  const guideDisplayChannels = guideChannels;
  const featuredGuide = useMemo(() => {
    if (
      selectedGuide &&
      guideDisplayChannels.some(
        (channel) => itemKey(channel) === itemKey(selectedGuide.channel),
      )
    )
      return selectedGuide;
    for (const channel of guideDisplayChannels) {
      const programme = guideState
        .get(channel)
        .find(
          (item) => item.start <= guideState.now && item.end > guideState.now,
        );
      if (programme) return { channel, programme };
    }
    return null;
  }, [guideDisplayChannels, guideState.get, guideState.now, selectedGuide]);
  const guidedRecentChannels = useMemo(
    () => recentChannels.filter(guideState.hasUpcoming),
    [guideState.hasUpcoming, recentChannels],
  );
  useEffect(() => {
    setGuideLimit(initialGuideLimit);
  }, [region, category, favoritesOnly, deferredQuery]);
  const allCategories = useMemo(
    () => [
      ...categoryList,
      ...Array.from(new Set(playlist.map((i) => i.category ?? "Other"))).map(
        (id) => ({ id, name: id }),
      ),
    ],
    [categoryList, playlist],
  );
  const playChannel = useCallback(
    (item: Item) => {
      setRecentChannels((current) =>
        [
          cleanItem(item),
          ...current.filter((channel) => itemKey(channel) !== itemKey(item)),
        ].slice(0, 12),
      );
      if (item.source === "xtream") {
        if (!provider || provider.scope !== item.provider) {
          setToast("Connect this channel’s IPTV account in Settings.");
          return;
        }
        const direct: Playback = {
          item,
          url: item.url ?? streamUrl(provider, "live", item.id, "m3u8"),
          mode: "direct",
          hls: true,
        };
        const service = getService();
        const insecureProvider = new URL(provider.server).protocol === "http:";
        setPlayback(
          service && insecureProvider
            ? {
                ...direct,
                url: streamUrl(
                  provider,
                  "live",
                  item.id,
                  item.extension ?? "ts",
                ),
                requestHeaders: {
                  "User-Agent": "VLC/3.0.0 LibVLC/3.0.0",
                },
                mode: "transcode",
                hls: false,
                relay: true,
              }
            : service
              ? {
                  ...direct,
                  automaticFallbackCount: 1,
                  alternatives: [
                    {
                      ...direct,
                      url: streamUrl(
                        provider,
                        "live",
                        item.id,
                        item.extension ?? "ts",
                      ),
                      requestHeaders: {
                        "User-Agent": "VLC/3.0.0 LibVLC/3.0.0",
                      },
                      mode: "transcode",
                      hls: false,
                      relay: true,
                    },
                  ],
                }
              : direct,
        );
      } else if (item.url) {
        const direct: Playback = {
          item,
          url: item.url,
          mode: "direct",
          hls: /\.m3u8(?:[?#]|$)/i.test(item.url),
        };
        setPlayback(
          getService()
            ? {
                ...direct,
                automaticFallbackCount: 1,
                alternatives: [
                  {
                    ...direct,
                    mode: "transcode",
                    hls: false,
                    relay: true,
                  },
                ],
              }
            : direct,
        );
      }
    },
    [provider, setRecentChannels],
  );
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
    const restoredProgress = normalizeYouTubeProgress(mergedProgress);
    save("progress", restoredProgress);
    setProgress(restoredProgress);
    return `Restored ${installed.addons.length} add-ons, ${transfer.collections.length} collections and ${transfer.library.length} saved titles.${installed.failed ? ` ${installed.failed} add-ons could not be reached; reinstall those URLs separately.` : ""}`;
  }
  if (!profileReady)
    return (
      <ProfileGate
        skipSelection={skipProfileSelection && !forceProfileSelection}
        onGuest={() => setProfileReady(true)}
        onEnter={(profile, ownerId) => {
          setProfileSyncLoaded(false);
          const hasCachedSetup = activeProfileMatches(
            ownerId,
            profile.profile_index,
          );
          if (!hasCachedSetup) {
            clearAccountStorage();
            clearSourceCache();
            loadAccountSetup({
              playbackService: getService(),
              tmdbKey: DEFAULT_TMDB_KEY,
              addons: defaultAddons,
              collections: [],
              library: [],
              progress: [],
              watched: [],
              provider: null,
              epgUrl: "",
              torboxKey: "",
              realDebridKey: "",
              autoplay: true,
              homeCatalogs: [],
            });
          }
          markActiveProfile(ownerId, profile.profile_index);
          migrateLegacyTraktProfile(profile.name);
          setForceProfileSelection(false);
          setActiveProfileView({
            name: profile.name,
            image: profile.avatar_url ?? undefined,
            color: profile.avatar_color_hex,
          });
          const landingPage = localStorage.getItem("tiktak:trakt-callback")
            ? "settings"
            : "home";
          location.hash = landingPage;
          setPage(landingPage);
          setProfileReady(true);
          setProfileSyncing(true);
        }}
        onSetup={(setup, profile, ownerId, warnings) => {
          if (!activeProfileMatches(ownerId, profile.profile_index)) return;
          loadAccountSetup(
            setup,
            traktProfileIdentityFor(ownerId, profile.profile_index),
          );
          const now = Date.now();
          localStorage.setItem("tiktak:last-sync", String(now));
          setProfileSyncing(false);
          setProfileSyncLoaded(true);
          const wizardKey = `tiktak:setup-wizard-v2:${ownerId}:${profile.profile_index}`;
          if (localStorage.getItem(wizardKey) !== "complete")
            setSetupWizardKey(wizardKey);
          if (warnings.length) setToast(warnings.join(" "));
        }}
        onSetupError={(reason, profile, ownerId) => {
          if (!activeProfileMatches(ownerId, profile.profile_index)) return;
          setProfileSyncing(false);
          setProfileSyncLoaded(false);
          setToast(
            reason instanceof Error
              ? `Profile opened from this device. TikTakTV refresh failed: ${reason.message}`
              : "Profile opened from this device, but TikTakTV could not refresh it.",
          );
        }}
      />
    );
  const visibleNav = nav.filter(
    (item) => item.id !== "live" || nuvioWebSettings.liveTvEnabled,
  );
  return (
    <div
      className={`app-shell nuvio-web-shell ${nuvioWebSettings.compactHeroMetadata ? "compact-hero-metadata" : ""}`}
    >
      <aside className="sidebar">
        <div className="brand" aria-label="TikTak TV">
          <img src={`${import.meta.env.BASE_URL}icon.svg`} alt="" />
          <span>
            TikTak<span className="brand-dot"> TV</span>
            <small>STREAM YOUR WORLD</small>
          </span>
        </div>
        <div className="nav-label">YOUR SPACE</div>
        <nav>
          {visibleNav.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              aria-label={n.label}
              className={page === n.id ? "active" : ""}
              onClick={() => {
                setQuery("");
                setSearchScope("all");
                setSearchSuggestion("");
                setExactSearch(false);
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
          <KoFiWidget />
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
          <span className="version">TikTak TV · Web edition</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Your entertainment<span>/</span>
            <strong>{visibleNav.find((n) => n.id === page)?.label}</strong>
          </div>
          <form
            className="search-box"
            hidden={page === "youtube"}
            onSubmit={(e) => {
              e.preventDefault();
              if (query.trim().length >= 2)
                setRecentSearches(recordSearch(searchProfile, query));
              if (page === "home") location.hash = "discover";
            }}
          >
            <Search size={18} />
            <input
              ref={searchRef}
              type="search"
              aria-label="Search titles or channels"
              placeholder={
                page === "live" ? "Search channels…" : "Search movies, series…"
              }
              value={query}
              onChange={(e) => {
                const next = e.target.value;
                if (!query.trim() && next.trim()) setSearchScope("all");
                setQuery(next);
                setSearchSuggestion("");
                setExactSearch(false);
                if (page === "home") location.hash = "discover";
              }}
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setSearchScope("all");
                  setSearchSuggestion("");
                  setExactSearch(false);
                }}
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
            You’re offline. Your saved library is available; streaming needs a
            connection.
          </div>
        )}
        {update && (
          <div className="banner">
            An update is ready. Close all TikTakTV tabs and reopen to install it
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
              Loading your TikTakTV profile...
            </div>
          )}
          {profileSyncing && (
            <div className="profile-sync-status" role="status">
              Syncing this profile with TikTakTV in the background…
            </div>
          )}
          {page === "home" && (
            <>
              {!collectionBrowsing &&
                nuvioWebSettings.homeHeroEnabled &&
                (hero ? (
                  <section className="hero">
                    <div
                      className={`hero-image hero-image-${nuvioWebSettings.heroArtwork}`}
                    >
                      <Art
                        key={`${itemKey(hero)}:${nuvioWebSettings.heroArtwork}`}
                        item={hero}
                        wide={nuvioWebSettings.heroArtwork === "backdrop"}
                        priority
                      />
                      {heroPreview?.key === itemKey(hero) && (
                        <iframe
                          key={`${heroPreview.videoId}:${heroPreviewSound}`}
                          className="hero-motion-preview"
                          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(heroPreview.videoId)}?autoplay=1&mute=${heroPreviewSound ? "0" : "1"}&controls=0&disablekb=1&fs=0&loop=1&modestbranding=1&playsinline=1&playlist=${encodeURIComponent(heroPreview.videoId)}`}
                          title={`${hero.name} motion preview`}
                          allow="autoplay; encrypted-media; picture-in-picture"
                          referrerPolicy="strict-origin-when-cross-origin"
                          tabIndex={-1}
                        />
                      )}
                    </div>
                    <div className="hero-content">
                      <span className="hero-tag">
                        <Sparkles size={14} /> YOUR NEXT GREAT WATCH
                      </span>
                      <h1>{hero.name}</h1>
                      <div className="metadata">
                        {nuvioWebSettings.showHeroRatings && hero.rating && (
                          <span className="gold">
                            <Star size={15} fill="currentColor" />
                            {hero.rating}
                          </span>
                        )}
                        {nuvioWebSettings.showReleaseDates && (
                          <span>{hero.year}</span>
                        )}
                        <span>
                          {hero.type === "series" ? "Series" : "Movie"}
                        </span>
                        <span className="badge">DISCOVER</span>
                      </div>
                      {nuvioWebSettings.showHeroOverview && (
                        <p>
                          {hero.description ||
                            "Find a new favorite. Explore the details and discover streams from your connected sources."}
                        </p>
                      )}
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
                          {saved(hero) ? (
                            <Check size={18} />
                          ) : (
                            <Plus size={18} />
                          )}
                          My library
                        </button>
                        {heroPreview?.key === itemKey(hero) &&
                          nuvioWebSettings.motionPreviewSound && (
                            <button
                              className="glass"
                              onClick={() =>
                                setHeroPreviewSound((current) => !current)
                              }
                            >
                              {heroPreviewSound
                                ? "Mute preview"
                                : "Preview sound"}
                            </button>
                          )}
                      </div>
                      <span className="hero-credit">
                        CURATED BY YOUR ADD-ONS
                      </span>
                    </div>
                    <div className="hero-footer">
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
                    <span className="eyebrow">WELCOME TO TIKTAKTV</span>
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
                ))}
              <div
                className={
                  collectionBrowsing ? "collection-page-shell" : "home-content"
                }
              >
                {!collectionBrowsing && (
                  <>
                    {nuvioWebSettings.liveTvEnabled && (
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
                            onClick={() =>
                              navigate(provider ? "live" : "settings")
                            }
                          >
                            {provider ? "Watch Live TV" : "Connect IPTV"}
                            <ArrowRight size={17} />
                          </button>
                        </div>
                      </section>
                    )}
                    {error && (
                      <div className="error" role="alert">
                        {error}
                        <button onClick={() => setRevision((v) => v + 1)}>
                          Retry catalogs
                        </button>
                      </div>
                    )}
                    {nuvioWebSettings.continueWatchingEnabled &&
                      continueWatching.primary.length > 0 && (
                        <section className="media-row">
                          <div className="row-heading">
                            <h2>Pick up where you left off</h2>
                            <button onClick={() => navigate("library")}>
                              My library
                              <ChevronRight size={16} />
                            </button>
                          </div>
                          <div className="rail">
                            {continueWatching.primary.slice(0, 12).map((p) => (
                              <Card
                                key={`${itemKey(p.item)}:${p.episode?.id ?? "title"}`}
                                item={p.item}
                                progress={p}
                                upcoming={Boolean(
                                  p.episode?.released &&
                                    new Date(p.episode.released).valueOf() >
                                      Date.now(),
                                )}
                                watched={isWatched(watched, p.item)}
                                onOpen={open}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                    {nuvioWebSettings.continueWatchingEnabled &&
                      continueWatching.upcoming.length > 0 && (
                        <section className="media-row continue-upcoming-row">
                          <div className="row-heading">
                            <h2>Upcoming</h2>
                            <span>Episodes you are waiting for</span>
                          </div>
                          <div className="rail">
                            {continueWatching.upcoming.slice(0, 12).map((p) => (
                              <Card
                                key={`${itemKey(p.item)}:${p.episode?.id ?? "title"}:upcoming`}
                                item={p.item}
                                progress={p}
                                upcoming
                                watched={isWatched(watched, p.item)}
                                onOpen={open}
                              />
                            ))}
                          </div>
                        </section>
                      )}
                  </>
                )}
                <Suspense fallback={null}>
                  <HomeCollections
                    collections={collections}
                    addons={addons}
                    library={library}
                    profileName={traktProfileIdentity(
                      activeProfileView?.name ?? "",
                    )}
                    onOpen={open}
                    onBrowsingChange={setCollectionBrowsing}
                  />
                </Suspense>
                {!collectionBrowsing &&
                  homeRows
                    .slice(0, tvInterface ? 12 : homeRows.length)
                    .map((row, i) => (
                      <section className="media-row" key={i}>
                        <div className="row-heading">
                          <h2>
                            {row.title}
                            {nuvioWebSettings.showCatalogType && (
                              <small>
                                {row.items.every(
                                  (item) => item.type === "movie",
                                )
                                  ? "Movies"
                                  : row.items.every(
                                        (item) => item.type === "series",
                                      )
                                    ? "Series"
                                    : "Mixed"}
                              </small>
                            )}
                          </h2>
                          <button
                            onClick={() => {
                              setKind(
                                row.items[0]?.type === "series"
                                  ? "series"
                                  : "movie",
                              );
                              setSelectedCatalog(row.catalogKey);
                              setCategory("");
                              navigate("discover");
                            }}
                          >
                            Explore all
                            <ChevronRight size={16} />
                          </button>
                        </div>
                        <div className="rail">
                          {row.items.slice(0, 18).map((item) => (
                            <Card
                              key={itemKey(item)}
                              item={item}
                              watched={isWatched(watched, item)}
                              onOpen={open}
                            />
                          ))}
                        </div>
                      </section>
                    ))}
                {!collectionBrowsing && (
                  <footer className="app-footer">
                    <span>Made for your next great watch.</span>
                    <button onClick={() => navigate("settings")}>
                      Manage sources
                      <ArrowRight size={14} />
                    </button>
                  </footer>
                )}
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
              {page === "library" && (
                <div className="filter-toolbar library-toolbar">
                  <div className="tabs" aria-label="Library type">
                    {[
                      ["all", "All"],
                      ["movie", "Movies"],
                      ["series", "Series"],
                      ["live", "Channels"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        className={libraryType === value ? "selected" : ""}
                        onClick={() =>
                          setLibraryType(
                            value as "all" | "movie" | "series" | "live",
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    aria-label="Library sort order"
                    value={nuvioWebSettings.librarySort}
                    onChange={(event) =>
                      setNuvioWebSettings((current) =>
                        saveNuvioWebSettings({
                          ...current,
                          librarySort: event.target
                            .value as NuvioWebSettings["librarySort"],
                          updatedAt: Date.now(),
                        }),
                      )
                    }
                  >
                    <option value="added-desc">Recently added</option>
                    <option value="added-asc">Oldest added</option>
                    <option value="title-asc">Title A–Z</option>
                    <option value="title-desc">Title Z–A</option>
                  </select>
                  <select
                    aria-label="Library layout"
                    value={nuvioWebSettings.libraryLayout}
                    onChange={(event) =>
                      setNuvioWebSettings((current) =>
                        saveNuvioWebSettings({
                          ...current,
                          libraryLayout: event.target
                            .value as NuvioWebSettings["libraryLayout"],
                          updatedAt: Date.now(),
                        }),
                      )
                    }
                  >
                    <option value="horizontal">Horizontal</option>
                    <option value="vertical">Vertical grid</option>
                  </select>
                </div>
              )}
              {page === "discover" && (
                <>
                {!query && recentSearches.length > 0 && (
                  <section className="recent-searches" aria-label="Recent searches">
                    <div>
                      <strong>Recent searches</strong>
                      <button
                        type="button"
                        onClick={() =>
                          setRecentSearches(clearSearchHistory(searchProfile))
                        }
                      >
                        Clear all
                      </button>
                    </div>
                    <div>
                      {recentSearches.map((recent) => (
                        <span key={recent}>
                          <button
                            type="button"
                            onClick={() => {
                              setQuery(recent);
                              setSearchScope("all");
                              setSearchSuggestion("");
                              setExactSearch(false);
                            }}
                          >
                            {recent}
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${recent} from recent searches`}
                            onClick={() =>
                              setRecentSearches(
                                removeSearch(searchProfile, recent),
                              )
                            }
                          >
                            <X size={13} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </section>
                )}
                <div className="filter-toolbar">
                  <div className="tabs">
                    {query && source === "catalogs" && (
                      <button
                        className={searchScope === "all" ? "selected" : ""}
                        onClick={() => setSearchScope("all")}
                      >
                        <Search size={16} />
                        All
                      </button>
                    )}
                    <button
                      className={
                        query && source === "catalogs"
                          ? searchScope === "movie"
                            ? "selected"
                            : ""
                          : kind === "movie"
                            ? "selected"
                            : ""
                      }
                      onClick={() => {
                        setKind("movie");
                        setSearchScope("movie");
                        setCategory("");
                      }}
                    >
                      <Film size={16} />
                      Movies
                    </button>
                    <button
                      className={
                        query && source === "catalogs"
                          ? searchScope === "series"
                            ? "selected"
                            : ""
                          : kind === "series"
                            ? "selected"
                            : ""
                      }
                      onClick={() => {
                        setKind("series");
                        setSearchScope("series");
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
                      if (e.target.value === "xtream") setSearchScope(kind);
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
                  ) : query ? (
                    <span className="smart-search-source">
                      Searching every compatible add-on
                    </span>
                  ) : (
                    <select
                      aria-label="Catalog"
                      value={
                        catalogs.some((c) => c.key === selectedCatalog)
                          ? selectedCatalog
                          : (catalogs[0]?.key ?? "")
                      }
                      onChange={(e) => {
                        setSelectedCatalog(e.target.value);
                        setCategory("");
                      }}
                    >
                      {catalogs.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.catalog.name ?? c.addon.manifest.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {source === "catalogs" &&
                    !query &&
                    catalogGenreOptions.length > 0 && (
                      <select
                        aria-label="Catalog category"
                        value={category}
                        onChange={(e) => setCategory(e.target.value)}
                      >
                        <option value="">Default</option>
                        {catalogGenreOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    )}
                  <button onClick={randomDiscoverPick} disabled={loading}>
                    <Dices size={17} />
                    Random Pick
                  </button>
                </div>
                </>
              )}
              {page === "discover" &&
                query &&
                searchSuggestion &&
                source === "catalogs" && (
                  <div className="smart-search-notice" role="status">
                    <span>
                      {exactSearch
                        ? "Searching instead for "
                        : "Showing results for "}
                      <strong>
                        {exactSearch ? query.trim() : searchSuggestion}
                      </strong>
                    </span>
                    <button onClick={() => setExactSearch((value) => !value)}>
                      {exactSearch
                        ? `Show results for ${searchSuggestion}`
                        : `Search instead for ${query.trim()}`}
                    </button>
                  </div>
                )}
              {page === "library" &&
                nuvioWebSettings.continueWatchingEnabled &&
                progress.length > 0 && (
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
                          watched={isWatched(watched, p.item)}
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
                      <Card
                        key={itemKey(item)}
                        item={item}
                        watched={isWatched(watched, item)}
                        onOpen={open}
                      />
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
                  <div
                    className="live-view-tabs"
                    role="tablist"
                    aria-label="Live TV view"
                  >
                    <button
                      role="tab"
                      aria-selected={liveView === "guide"}
                      className={liveView === "guide" ? "active" : ""}
                      onClick={() => setLiveView("guide")}
                    >
                      <Tv size={18} /> TV guide
                    </button>
                    <button
                      role="tab"
                      aria-selected={liveView === "sports"}
                      className={liveView === "sports" ? "active" : ""}
                      onClick={() => {
                        setLiveView("sports");
                        if (!region) setRegion(localLiveRegion());
                      }}
                    >
                      <Star size={18} /> Sports
                    </button>
                  </div>
                  {liveView === "sports" ? (
                    <>
                      <div className="filter-toolbar sports-scope-filter">
                        <select
                          aria-label="Sports country or region"
                          value={region}
                          onChange={(event) => setRegion(event.target.value)}
                        >
                          <option value="">🌐 All countries</option>
                          {availableRegions.map(([code, label]) => (
                            <option key={code} value={code}>
                              {regionFlag(code)} {label}
                            </option>
                          ))}
                        </select>
                        <span className="results-count">
                          {region
                            ? `${regionFlag(region)} ${availableRegions.find(([code]) => code === region)?.[1] ?? region}`
                            : "Showing every region"}
                        </span>
                      </div>
                      <SportsHub
                        channels={guideDisplayChannels}
                        getPrograms={guideState.get}
                        getArtwork={guideState.artwork}
                        now={guideState.now}
                        onPlay={playChannel}
                      />
                    </>
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
                          <option value="">🌐 All countries</option>
                          {availableRegions.map(([code, label]) => (
                            <option key={code} value={code}>
                              {regionFlag(code)} {label}
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
                      {guidedRecentChannels.length > 0 && (
                        <section
                          className="recent-channels"
                          aria-label="Recently watched channels"
                        >
                          <div className="section-heading">
                            <div>
                              <span className="eyebrow">QUICK ACCESS</span>
                              <h2>Recently watched</h2>
                            </div>
                            <button onClick={() => setRecentChannels([])}>
                              Clear
                            </button>
                          </div>
                          <div className="cast-row">
                            {guidedRecentChannels.map((channel) => (
                              <button
                                className="cast-person"
                                key={itemKey(channel)}
                                onClick={() => playChannel(channel)}
                              >
                                <Art
                                  item={channel}
                                  guideArtwork={guideState.artwork(channel)}
                                />
                                <strong>{channel.name}</strong>
                                <small>Live</small>
                              </button>
                            ))}
                          </div>
                        </section>
                      )}
                      <p className="guide-status" role="status">
                        {guideState.loading
                          ? epgUrl
                            ? "Loading your custom program guide..."
                            : "Loading your Xtream guide automatically..."
                          : guideChannels.length
                            ? `Guide ready - ${guideState.count.toLocaleString()} channel guides`
                            : guideState.fallback && guideState.unavailable
                              ? "No channels with usable guide data are available from this provider right now."
                              : "Checking channels for program guide data..."}
                      </p>
                      {!loading && guideDisplayChannels.length > 0 && (
                        <>
                          {featuredGuide && (
                            <section
                              className="guide-feature"
                              aria-label="Selected live programme"
                            >
                              <div className="guide-feature-art">
                                <Art
                                  item={featuredGuide.channel}
                                  guideArtwork={guideState.artwork(
                                    featuredGuide.channel,
                                  )}
                                />
                              </div>
                              <div className="guide-feature-copy">
                                <span className="guide-feature-channel">
                                  {featuredGuide.channel.name} <b>LIVE</b>
                                </span>
                                <h2>{featuredGuide.programme.title}</h2>
                                <div className="guide-feature-time">
                                  <span>
                                    {new Date(
                                      featuredGuide.programme.start,
                                    ).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}{" "}
                                    –{" "}
                                    {new Date(
                                      featuredGuide.programme.end,
                                    ).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                  <span>
                                    {Math.max(
                                      1,
                                      Math.ceil(
                                        (featuredGuide.programme.end -
                                          guideState.now) /
                                          60_000,
                                      ),
                                    )}{" "}
                                    min left
                                  </span>
                                </div>
                                <div className="guide-feature-progress">
                                  <span
                                    style={{
                                      width: `${Math.min(100, Math.max(0, ((guideState.now - featuredGuide.programme.start) / (featuredGuide.programme.end - featuredGuide.programme.start)) * 100))}%`,
                                    }}
                                  />
                                </div>
                                {featuredGuide.programme.description && (
                                  <p>{featuredGuide.programme.description}</p>
                                )}
                                <button
                                  className="primary"
                                  onClick={() =>
                                    playChannel(featuredGuide.channel)
                                  }
                                >
                                  <Play size={18} fill="currentColor" /> Watch
                                  live
                                </button>
                              </div>
                            </section>
                          )}
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
                                  Math.min(
                                    value + (tvInterface ? 12 : 30),
                                    guideDisplayChannels.length,
                                  ),
                                );
                            }}
                          >
                            <div className="tv-guide-heading">
                              <div>
                                <span className="eyebrow">ON NOW</span>
                                <h2>Live guide</h2>
                              </div>
                              <span>
                                {guideChannels.length
                                  ? `${guideChannels.length} channels with schedules`
                                  : `${guideDisplayChannels.length} guide-linked channels`}
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
                            {guideDisplayChannels
                              .slice(0, guideLimit)
                              .map((channel) => {
                                const shows = guideState
                                  .get(channel)
                                  .filter(
                                    (p) =>
                                      p.end > guideState.now &&
                                      p.start <
                                        guideState.now + 2 * 60 * 60_000,
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
                                        <Art
                                          item={channel}
                                          guideArtwork={guideState.artwork(
                                            channel,
                                          )}
                                        />
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
                                            saved(channel)
                                              ? "currentColor"
                                              : "none"
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
                                              programme.start <=
                                                guideState.now &&
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
                                            onFocus={() =>
                                              setSelectedGuide({
                                                channel,
                                                programme,
                                              })
                                            }
                                            onMouseEnter={() =>
                                              setSelectedGuide({
                                                channel,
                                                programme,
                                              })
                                            }
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
                        </>
                      )}
                    </>
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
          {page === "youtube" && (
            <Suspense fallback={<Loading />}>
              <YouTubeHub
                resumeRequest={youtubeResumeRequest}
                onResumeConsumed={() => setYoutubeResumeRequest(null)}
                onProgress={(next: YouTubePlaybackProgress) => {
                  setProgress((current) => {
                    const remaining = current.filter(
                      (entry) =>
                        youtubeVideoIdFromItem(entry.item) !== next.videoId,
                    );
                    const updated =
                      next.seconds >= next.duration * 0.97
                        ? remaining
                        : [
                            {
                              item: youtubeProgressItem(
                                next.videoId,
                                undefined,
                                [
                                  {
                                    videoId: next.videoId,
                                    title: next.title,
                                    thumbnail: next.thumbnail,
                                  },
                                ],
                              ),
                              seconds: next.seconds,
                              duration: next.duration,
                              at: Date.now(),
                            },
                            ...remaining,
                          ].slice(0, 100);
                    save("progress", updated);
                    return updated;
                  });
                }}
              />
            </Suspense>
          )}
          <div
            className="page-content account-shell-page"
            hidden={page !== "account" && page !== "settings"}
          >
            <div className="account-page-header">
              <div>
                <span className="eyebrow">YOUR TIKTAKTV</span>
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
                  canSync={profileSyncLoaded}
                  setup={{
                    playbackService: getService(),
                    tmdbKey,
                    addons,
                    collections,
                    library,
                    progress,
                    watched,
                    provider,
                    epgUrl,
                    torboxKey,
                    realDebridKey,
                    autoplay,
                    streamPreferences: sourcePreferences,
                    nuvioWebSettings,
                    homeCatalogs,
                  }}
                  onLoad={loadAccountSetup}
                  onLoading={setAccountLoading}
                  skipProfileSelection={skipProfileSelection}
                  onSkipProfileSelection={setSkipProfileSelection}
                  onChangeUser={() => {
                    clearAccountStorage();
                    clearSourceCache();
                    setProvider(null);
                    setEpgUrl("");
                    setAddons(defaultAddons);
                    setCollections([]);
                    setLibrary([]);
                    setProgress([]);
                    setWatched([]);
                    setHomeCatalogs([]);
                    setRecentChannels([]);
                    setTorboxKey("");
                    setRealDebridKey("");
                    setTmdbKey(DEFAULT_TMDB_KEY);
                    setAutoplay(true);
                    setSourcePreferences(defaultStreamPreferences);
                    setNuvioWebSettings(defaultNuvioWebSettings);
                    setPlaylist([]);
                    setPlayback(null);
                    setDetail(null);
                    sessionStorage.removeItem("tiktak:profile-active");
                    setForceProfileSelection(true);
                    setProfileReady(false);
                    setProfileSyncLoaded(false);
                  }}
                  onProfileUpdated={setActiveProfileView}
                />
              </Suspense>
            </div>
            {page === "settings" && (
              <Suspense fallback={<Loading />}>
                <Settings
                  profileName={activeProfileView?.name ?? ""}
                  trackingProfileName={traktProfileIdentity(
                    activeProfileView?.name ?? "",
                  )}
                  provider={provider}
                  epgUrl={epgUrl}
                  onEpgUrl={setEpgUrl}
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
                  sourcePreferences={sourcePreferences}
                  onSourcePreferences={(preferences) => {
                    const saved = saveStreamPreferences(preferences);
                    setSourcePreferences(saved);
                  }}
                  nuvioWebSettings={nuvioWebSettings}
                  onNuvioWebSettings={(settings) => {
                    const saved = saveNuvioWebSettings(settings);
                    setNuvioWebSettings(saved);
                  }}
                  playbackConnected={!!getService()}
                  tmdbKey={tmdbKey}
                  onTmdbKey={setTmdbKey}
                  friendTemplate={{
                    addons,
                    collections,
                    autoplay,
                    homeCatalogs,
                    provider,
                    sourcePreferences,
                    nuvioWebSettings,
                  }}
                  homeCatalogs={homeCatalogs}
                  onHomeCatalogs={setHomeCatalogs}
                  onFriendTemplate={async (
                    template: FriendTemplate,
                    friendTorboxKey: string,
                    friendRealDebridKey: string,
                  ) => {
                    setAddons(template.addons);
                    setCollections(template.collections);
                    setAutoplay(template.autoplay);
                    setHomeCatalogs(template.homeCatalogs);
                    if (template.sourcePreferences) {
                      const saved = saveStreamPreferences(
                        template.sourcePreferences,
                      );
                      setSourcePreferences(saved);
                      setAutoplay(saved.autoPlayMode !== "manual");
                    }
                    if (template.nuvioWebSettings) {
                      const saved = saveNuvioWebSettings(
                        template.nuvioWebSettings,
                      );
                      setNuvioWebSettings(saved);
                    }
                    // Friend installation is a full setup replacement. Clear
                    // an older IPTV connection when the new shared setup does
                    // not contain one instead of silently merging generations.
                    storeProvider(template.provider ?? null, true);
                    setProvider(template.provider ?? null);
                    setCategory("");
                    setActiveChannel(null);
                    setTorboxKey(friendTorboxKey);
                    save("torbox-key", friendTorboxKey);
                    sessionStorage.removeItem("nuvio:torbox-key");
                    setRealDebridKey(friendRealDebridKey);
                    save("realdebrid-key", friendRealDebridKey);
                    sessionStorage.removeItem("nuvio:realdebrid-key");
                    setRevision((value) => value + 1);
                  }}
                />
              </Suspense>
            )}
          </div>
        </main>
      </div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {visibleNav.map((n) => (
          <a
            key={n.id}
            href={`#${n.id}`}
            aria-label={n.label}
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
          traktProfileName={traktProfileIdentity(activeProfileView?.name ?? "")}
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
          onTrailer={(videoId, title) => {
            setDetail(null);
            setYoutubeResumeRequest({ videoId, seconds: 0, title });
            navigate("youtube");
          }}
          onRemoveProgress={removeFromHistory}
          onSetWatched={setWatchedStatus}
          onOpenDownloads={() => {
            sessionStorage.setItem("tiktak:open-settings-section", "downloads");
            setDetail(null);
            navigate("settings");
          }}
          watched={watched}
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
            key={`${itemKey(playback.item)}:${playback.episode?.id ?? ""}`}
            playback={playback}
            nextEpisode={nextEpisode}
            onNextEpisode={playNextEpisode}
            traktProfileName={traktProfileIdentity(
              activeProfileView?.name ?? "",
            )}
            partyIdentity={{
              name: activeProfileView?.name || "Guest",
              avatar: activeProfileView?.image,
            }}
            onClose={() => {
              nextEpisodeRequest.current?.abort();
              const url = new URL(location.href);
              if (url.searchParams.has("party")) {
                url.searchParams.delete("party");
                history.replaceState(null, "", url);
                partyAttemptedRef.current = "";
              }
              setPlayback(null);
              setProgress(normalizeYouTubeProgress(read("progress", [])));
              setWatched(read("watched", []));
            }}
          />
        </Suspense>
      )}
      {setupWizardKey && (
        <Suspense fallback={<Loading />}>
          <SetupWizard
            profileName={activeProfileView?.name ?? ""}
            addons={addons}
            catalogCount={catalogs.length}
            torboxKey={torboxKey}
            realDebridKey={realDebridKey}
            provider={provider}
            onSettings={() => {
              setSetupWizardKey("");
              navigate("settings");
            }}
            onComplete={() => {
              localStorage.setItem(setupWizardKey, "complete");
              setSetupWizardKey("");
            }}
          />
        </Suspense>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      <WhatsNewPrompt enabled={nuvioWebSettings.featureHighlights} />
      {updateReady && (
        <div className="update-banner" role="status">
          <span>A new TikTak TV version is ready.</span>
          <button
            onClick={() => {
              sessionStorage.setItem("tiktak:return-url", location.href);
              (
                window as Window & { applyTikTakUpdate?: () => void }
              ).applyTikTakUpdate?.();
            }}
          >
            Update now
          </button>
          <button onClick={() => setUpdateReady(false)}>Later</button>
        </div>
      )}
    </div>
  );
}
