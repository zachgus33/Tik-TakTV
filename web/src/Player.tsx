import { getService, prepareMedia, sourceFetch } from "./connection";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelPlaybackSession } from "./connection";
import {
  Airplay,
  Check,
  Copy,
  FastForward,
  Link,
  Maximize,
  Pause,
  Pin,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings2,
  Sun,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type Hls from "hls.js";
import { playbackNeedsRecovery } from "./playback-stall";
import type { Addon, Episode, Item, Subtitle } from "./types";
import { addonSubtitles, safeUrl } from "./api";
import { storeProgress } from "./storage";
import { liveAudioCodec } from "./media-compatibility";
import {
  cleanSubtitleText,
  hlsErrorTargetsSubtitles,
  runtimeSeconds,
  parseWebVttCues,
  shiftWebVtt,
  subtitlePickerName,
  subtitleToWebVtt,
  type ParsedSubtitleCue,
} from "./player-utils";
import { readNextEpisodeAutoAdvance } from "./next-episode";
import NextEpisodeSetting from "./NextEpisodeSetting";
import { createTraktScrobbler } from "./trakt-scrobble";
import { createSimklScrobbler } from "./simkl-scrobble";
import {
  preferredAudioTrackIndex,
  saveStreamPreferences,
  streamPreferences,
} from "./stream-selection";
import { readNuvioWebSettings } from "./nuvio-web-settings";
import { removeStreamLink } from "./enhanced-stream-cache";
import { anilistProgressEnabled } from "./ExternalTrackingSettings";
import { anilistMediaRef, recordAniListEpisode } from "./anilist-tracking";
import {
  createParty,
  endParty,
  partyLink,
  partyState,
  removePartyMember,
  type PartyIdentity,
  type PartySession,
} from "./watch-party";
import {
  readIntroDbApiKey,
  skipSegments as loadSkipSegments,
  submitIntroDbSegment,
  type SkipSegment,
} from "./skip-segments";

export type Playback = {
  item: Item;
  url: string;
  episode?: Episode;
  resume?: number;
  requestHeaders?: Record<string, string>;
  hls?: boolean;
  mode?: "direct" | "remux" | "transcode";
  subtitles?: Subtitle[];
  subtitleRequest?: {
    addons: Addon[];
    id: string;
    extras?: {
      filename?: string;
      videoHash?: string;
      videoSize?: number;
    };
  };
  prepared?: boolean;
  relay?: boolean;
  /** Permit conversion only after direct debrid playback actually fails. */
  compatibilityFallback?: boolean;
  party?: { id: string; host: boolean };
  alternatives?: Playback[];
  /** Remaining add-ons continue loading after fast autoplay starts. */
  alternativesRequest?: Promise<Playback[]>;
  /** Number of alternatives that may be tried automatically. */
  automaticFallbackCount?: number;
  /** Privacy-safe stream/add-on details for the in-player chooser. */
  sourceLabel?: string;
  sourceDetail?: string;
  sourceAddonName?: string;
  sourceAddonId?: string;
  bingeGroup?: string;
  cacheKey?: string;
  sourceBadges?: string[];
  mediaOffset?: number;
};
const autoplayBlockedNotice = "Tap the video’s play button to start.";

function playbackSourceKey(playback: Playback) {
  return [
    playback.url,
    playback.sourceAddonId ?? "",
    playback.sourceLabel ?? "",
  ].join("|");
}

export function mergePlaybackAlternatives(
  current: Playback[],
  loaded: Playback[],
) {
  const seen = new Set<string>();
  return [...current, ...loaded].filter((choice) => {
    const key = playbackSourceKey(choice);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeSubtitles(...groups: Subtitle[][]): Subtitle[] {
  const seen = new Set<string>();
  return groups.flat().filter((subtitle) => {
    const key = subtitle.url || subtitle.id || "";
    return !!key && !seen.has(key) && !!seen.add(key);
  });
}

function preferredSubtitleLanguages(
  primary: string,
  secondary: string,
): string[] {
  const configured = [primary, secondary].flatMap((language) =>
    language === "device" ? navigator.languages : [language],
  );
  return configured
    .map((value) => value.trim().toLowerCase())
    .filter((value) => !!value && value !== "none");
}
function subtitleValues(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}
function subtitleLanguageMatches(values: string, preferred: string[]) {
  return preferred.some((language) => {
    const primary = language.split("-")[0];
    return (
      values.includes(language) ||
      (primary.length > 1 && values.includes(primary))
    );
  });
}
function subtitleIsForced(values: string) {
  return /\bforced\b/i.test(values);
}
function preferredSubtitleScore(
  subtitle: Subtitle,
  preferred: string[],
  useForcedSubtitles: boolean,
): number {
  const values = subtitleValues(subtitle.lang, subtitle.name, subtitle.id);
  const preferredIndex = preferred.findIndex((language) => {
    const primary = language.split("-")[0];
    return (
      values.includes(language) ||
      (primary.length > 1 && values.includes(primary))
    );
  });
  const forced = useForcedSubtitles && subtitleIsForced(values) ? 2 : 0;
  return (preferredIndex < 0 ? 0 : 20 - preferredIndex) + forced;
}
function subtitleMatchesPreference(
  subtitle: Subtitle,
  preferred: string[],
  useForcedSubtitles: boolean,
) {
  const values = subtitleValues(subtitle.lang, subtitle.name, subtitle.id);
  return (
    subtitleLanguageMatches(values, preferred) ||
    (useForcedSubtitles && subtitleIsForced(values))
  );
}
function renderedSubtitleMatchesPreference(
  label: string,
  language: string,
  preferred: string[],
  useForcedSubtitles: boolean,
) {
  const values = subtitleValues(label, language);
  return (
    subtitleLanguageMatches(values, preferred) ||
    (useForcedSubtitles && subtitleIsForced(values))
  );
}
function subtitleOffsetKey(playback: Playback) {
  return `tiktak:subtitle-offset:${playback.item.id}:${playback.episode?.id ?? "movie"}`;
}
function savedSubtitleOffset(playback: Playback) {
  const saved = Number(localStorage.getItem(subtitleOffsetKey(playback)) || 0);
  return Number.isFinite(saved) ? saved : 0;
}
function subtitleSelectionKey(playback: Playback) {
  return `tiktak:subtitle-selection:${playback.item.id}`;
}
type SubtitleSelectionPreference = {
  type: "embedded" | "external" | "off";
  label?: string;
  language?: string;
  url?: string;
};
function formatPlayerTime(value: number) {
  if (!Number.isFinite(value) || value < 0) return "0:00";
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  const minutes = Math.floor(value / 60) % 60;
  const hours = Math.floor(value / 3600);
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
}
function skipSegmentLabel(type: SkipSegment["type"]) {
  if (type === "intro") return "Skip intro";
  if (type === "recap") return "Skip recap";
  return "Skip credits";
}
function parseSegmentTime(value: string) {
  const parts = value
    .trim()
    .split(":")
    .map((part) => Number(part));
  if (!parts.length || parts.some((part) => !Number.isFinite(part) || part < 0))
    return Number.NaN;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Number.NaN;
}

function reportMediaActivity(
  playbackId: string,
  detail: {
    active: boolean;
    event?: "opened" | "started" | "failed" | "ended" | "closed";
  },
) {
  window.dispatchEvent(
    new CustomEvent("tiktak-media-activity", {
      detail: { ...detail, playbackId },
    }),
  );
}

function VideoPlayer({
  playback,
  playbackMetricId,
  onClose,
  minimized = false,
  onMinimize,
  onFailure,
  onChooseSource,
  partyIdentity,
  traktProfileName,
  onSeek,
  nextEpisode,
  onNextEpisode,
}: {
  playback: Playback;
  playbackMetricId: string;
  onClose: () => void;
  minimized?: boolean;
  onMinimize?: (value: boolean) => void;
  onFailure?: () => boolean;
  onChooseSource?: () => void;
  partyIdentity: PartyIdentity;
  traktProfileName: string;
  onSeek?: (seconds: number) => void;
  nextEpisode?: Episode | null;
  onNextEpisode?: () => Promise<void>;
}) {
  const tvMode =
    document.documentElement.classList.contains("tv-mode") ||
    new URLSearchParams(location.search).get("tv") === "1" ||
    /TikTakTV-AndroidTV/i.test(navigator.userAgent);
  const experienceSettings = readNuvioWebSettings();
  const useForcedSubtitleTracks =
    experienceSettings.useForcedSubtitles ||
    experienceSettings.preferredSubtitleLanguage === "forced" ||
    experienceSettings.secondaryPreferredSubtitleLanguage === "forced";
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [parentalGuideVisible, setParentalGuideVisible] = useState(
    () => experienceSettings.showParentalGuide && !!playback.item.certification,
  );
  const [nextError, setNextError] = useState("");
  const [nextBusy, setNextBusy] = useState(false);
  const [skipSegments, setSkipSegments] = useState<SkipSegment[]>([]);
  const [submitSkipOpen, setSubmitSkipOpen] = useState(false);
  const [submitSkipType, setSubmitSkipType] =
    useState<SkipSegment["type"]>("intro");
  const [submitSkipStart, setSubmitSkipStart] = useState("0:00");
  const [submitSkipEnd, setSubmitSkipEnd] = useState("1:30");
  const [submitSkipBusy, setSubmitSkipBusy] = useState(false);
  const [submitSkipError, setSubmitSkipError] = useState("");
  const nextBusyRef = useRef(false);
  const nextAdvanceTriggeredRef = useRef(false);
  const nextEpisodeRef = useRef(nextEpisode);
  const onNextEpisodeRef = useRef(onNextEpisode);
  nextEpisodeRef.current = nextEpisode;
  onNextEpisodeRef.current = onNextEpisode;
  useEffect(() => {
    nextAdvanceTriggeredRef.current = false;
  }, [playback.item.id, playback.episode?.id]);
  useEffect(() => {
    const episode = playback.episode;
    if (!experienceSettings.skipIntroEnabled || !episode) {
      setSkipSegments([]);
      return;
    }
    const controller = new AbortController();
    void loadSkipSegments(
      playback.item.id,
      episode.season,
      episode.episode,
      {
        animeSkipEnabled: experienceSettings.animeSkipEnabled,
        animeSkipClientId: experienceSettings.animeSkipClientId,
      },
      controller.signal,
    ).then((segments) => {
      if (!controller.signal.aborted) setSkipSegments(segments);
    });
    return () => controller.abort();
  }, [
    playback.item.id,
    playback.episode?.id,
    playback.episode?.season,
    playback.episode?.episode,
    experienceSettings.skipIntroEnabled,
    experienceSettings.animeSkipEnabled,
    experienceSettings.animeSkipClientId,
  ]);
  useEffect(() => {
    const visible =
      experienceSettings.showParentalGuide && !!playback.item.certification;
    setParentalGuideVisible(visible);
    if (!visible) return;
    const timer = window.setTimeout(() => setParentalGuideVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [
    playback.item.id,
    playback.item.certification,
    experienceSettings.showParentalGuide,
  ]);
  async function advanceNextEpisode() {
    if (
      !nextEpisodeRef.current ||
      !onNextEpisodeRef.current ||
      nextBusyRef.current
    )
      return;
    nextBusyRef.current = true;
    setNextBusy(true);
    setNextError("");
    try {
      await onNextEpisodeRef.current();
    } catch (error) {
      setNextError(
        error instanceof Error
          ? error.message
          : "Could not load the next episode.",
      );
    } finally {
      nextBusyRef.current = false;
      setNextBusy(false);
    }
  }
  useEffect(() => {
    if (
      nextEpisode &&
      !playback.party &&
      videoRef.current?.ended &&
      readNextEpisodeAutoAdvance()
    )
      void advanceNextEpisode();
  }, [nextEpisode, playback.party]);
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tvControlsVisible, setTvControlsVisible] = useState(true);
  const [playerToolsOpen, setPlayerToolsOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekEnd, setSeekEnd] = useState(0);
  const [subtitles, setSubtitles] = useState<
    {
      url: string;
      name: string;
      sourceText: string;
      sourceUrl: string;
      language: string;
      source: "stream" | "addon" | "local";
    }[]
  >([]);
  const [subtitleCandidates, setSubtitleCandidates] = useState<Subtitle[]>(
    playback.subtitles ?? [],
  );
  const [embeddedSubtitles, setEmbeddedSubtitles] = useState<
    { key: string; label: string; track: TextTrack }[]
  >([]);
  const [selectedSubtitleTrack, setSelectedSubtitleTrack] = useState("auto");
  const [activeSubtitleText, setActiveSubtitleText] = useState("");
  const [subtitleBox, setSubtitleBox] = useState<{
    left: number;
    width: number;
    bottom: number;
  } | null>(null);
  const [subtitleSyncCapturedAt, setSubtitleSyncCapturedAt] = useState<
    number | null
  >(null);
  const [subtitleSyncQuery, setSubtitleSyncQuery] = useState("");
  const subtitleSyncSearchRef = useRef<HTMLInputElement>(null);
  const [quality, setQuality] = useState<{ label: string; value: number }[]>(
    [],
  );
  const [audioTracks, setAudioTracks] = useState<
    { label: string; value: number; source: "hls" | "native" }[]
  >([]);
  const [party, setParty] = useState<PartySession | null>(null);
  const [partyBusy, setPartyBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(() =>
    experienceSettings.rememberPlayerChoices
      ? Number(localStorage.getItem("tiktak:playback-rate") || 1)
      : 1,
  );
  const [holdSpeedActive, setHoldSpeedActive] = useState(false);
  const [gestureFeedback, setGestureFeedback] = useState<{
    kind: "seek-back" | "seek-forward" | "brightness" | "volume";
    primary: string;
    secondary?: string;
  } | null>(null);
  const [playerBrightness, setPlayerBrightness] = useState(() => {
    if (!experienceSettings.rememberPlayerBrightness) return 1;
    const saved = Number(localStorage.getItem("tiktak:player-brightness") || 1);
    return Number.isFinite(saved) ? Math.max(0.2, Math.min(saved, 1)) : 1;
  });
  const [subtitleOffset, setSubtitleOffset] = useState(() =>
    savedSubtitleOffset(playback),
  );
  const [subtitleIncrement, setSubtitleIncrement] = useState(() => {
    const saved = Number(
      localStorage.getItem("tiktak:subtitle-increment") || 0.5,
    );
    return saved === 1 || saved === 2 ? saved : 0.5;
  });
  const subtitleOffsetRef = useRef(subtitleOffset);
  subtitleOffsetRef.current = subtitleOffset;
  const hlsRef = useRef<Hls | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const tvControlsTimerRef = useRef<number>(0);
  const holdSpeedTimerRef = useRef<number>(0);
  const holdSpeedPointerRef = useRef<number | null>(null);
  const holdSpeedRestoreRateRef = useRef<number | null>(null);
  const gestureFeedbackTimerRef = useRef<number>(0);
  const pendingTapTimerRef = useRef<number>(0);
  const previousTapRef = useRef<{ time: number; x: number; y: number } | null>(
    null,
  );
  const playerTouchStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
    width: number;
    height: number;
    baselineTime: number;
    initialVolume: number;
    initialBrightness: number;
    mode: "seek" | "brightness" | "volume" | null;
    previewTime: number;
  } | null>(null);
  const lastTouchToggleRef = useRef(0);
  const playingRef = useRef(false);
  const subtitleRef = useRef(subtitles);
  const embeddedCueTimesRef = useRef(
    new WeakMap<TextTrackCue, { start: number; end: number }>(),
  );
  const subtitlePreferenceRestoredRef = useRef(false);
  const activeSubtitleTimerRef = useRef<number>(0);
  const subtitleNoticeTimerRef = useRef<number>(0);
  const subtitleSyncCapturedAtRef = useRef<number | null>(null);
  const subtitleSyncWasPlayingRef = useRef(false);
  subtitleRef.current = subtitles;
  subtitleSyncCapturedAtRef.current = subtitleSyncCapturedAt;
  playingRef.current = playing;
  function currentEmbeddedTracks() {
    const video = videoRef.current;
    if (!video) return [];
    const external = new Set(
      Array.from(video.querySelectorAll("track")).map((track) => track.track),
    );
    return Array.from(
      { length: video.textTracks.length },
      (_, index) => video.textTracks[index],
    ).filter(
      (track) =>
        !external.has(track) &&
        (track.kind === "subtitles" || track.kind === "captions"),
    );
  }
  function applyEmbeddedSubtitleOffset(offset: number) {
    for (const track of currentEmbeddedTracks()) {
      const cues = track.cues;
      if (!cues) continue;
      for (let index = 0; index < cues.length; index += 1) {
        const cue = cues[index];
        const original = embeddedCueTimesRef.current.get(cue) ?? {
          start: cue.startTime,
          end: cue.endTime,
        };
        embeddedCueTimesRef.current.set(cue, original);
        cue.startTime = Math.max(0, original.start + offset);
        cue.endTime = Math.max(cue.startTime, original.end + offset);
      }
    }
  }
  function refreshEmbeddedSubtitles() {
    const tracks = currentEmbeddedTracks();
    const next = tracks.map((track, index) => ({
      key: `embedded:${index}`,
      label: subtitlePickerName(track.label, track.language, index),
      track,
    }));
    setEmbeddedSubtitles((current) =>
      current.length === next.length &&
      current.every((entry, index) => entry.track === next[index].track)
        ? current
        : next,
    );
    applyEmbeddedSubtitleOffset(subtitleOffsetRef.current);
  }
  function selectSubtitleTrack(value: string) {
    const video = videoRef.current;
    if (!video) return;
    window.clearTimeout(activeSubtitleTimerRef.current);
    setActiveSubtitleText("");
    for (let index = 0; index < video.textTracks.length; index += 1)
      video.textTracks[index].mode = "disabled";
    if (value.startsWith("embedded:")) {
      const selected = embeddedSubtitles[Number(value.split(":")[1])];
      if (selected) {
        selected.track.mode = "hidden";
        const preference: SubtitleSelectionPreference = {
          type: "embedded",
          label: selected.label,
          language: selected.track.language,
        };
        localStorage.setItem(
          subtitleSelectionKey(playback),
          JSON.stringify(preference),
        );
      }
    } else if (value.startsWith("external:")) {
      const index = Number(value.split(":")[1]);
      const subtitle = subtitles[index];
      if (subtitle) {
        const preference: SubtitleSelectionPreference = {
          type: "external",
          label: subtitle.name,
          language: subtitle.language,
          url: subtitle.sourceUrl,
        };
        localStorage.setItem(
          subtitleSelectionKey(playback),
          JSON.stringify(preference),
        );
      }
    } else if (value === "off") {
      localStorage.setItem(
        subtitleSelectionKey(playback),
        JSON.stringify({ type: "off" } satisfies SubtitleSelectionPreference),
      );
    } else if (value === "auto") {
      const preferred = preferredSubtitleLanguages(
        experienceSettings.preferredSubtitleLanguage,
        experienceSettings.secondaryPreferredSubtitleLanguage,
      );
      const preferredEmbeddedIndex = embeddedSubtitles.findIndex((track) =>
        renderedSubtitleMatchesPreference(
          track.label,
          track.track.language,
          preferred,
          false,
        ),
      );
      const forcedEmbeddedIndex = useForcedSubtitleTracks
        ? embeddedSubtitles.findIndex((track) =>
            subtitleIsForced(subtitleValues(track.label, track.track.language)),
          )
        : -1;
      const preferredExternalIndex = subtitles.findIndex((track) =>
        renderedSubtitleMatchesPreference(
          track.name,
          track.language,
          preferred,
          false,
        ),
      );
      const forcedExternalIndex = useForcedSubtitleTracks
        ? subtitles.findIndex((track) =>
            subtitleIsForced(subtitleValues(track.name, track.language)),
          )
        : -1;
      const embeddedIndex =
        preferredEmbeddedIndex >= 0
          ? preferredEmbeddedIndex
          : forcedEmbeddedIndex;
      const externalIndex =
        preferredExternalIndex >= 0
          ? preferredExternalIndex
          : forcedExternalIndex;
      if (embeddedIndex >= 0) {
        embeddedSubtitles[embeddedIndex].track.mode = "hidden";
        value = embeddedSubtitles[embeddedIndex].key;
      } else if (externalIndex >= 0) {
        value = `external:${externalIndex}`;
      } else {
        value = "off";
      }
    }
    setSelectedSubtitleTrack(value);
    if (value.startsWith("embedded:"))
      localStorage.setItem(
        "tiktak:subtitle-language",
        embeddedSubtitles[Number(value.split(":")[1])]?.label ?? "",
      );
    if (value.startsWith("external:"))
      localStorage.setItem(
        "tiktak:subtitle-language",
        subtitles[Number(value.split(":")[1])]?.name ?? "",
      );
  }
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    window.clearTimeout(activeSubtitleTimerRef.current);
    setActiveSubtitleText("");
    for (let index = 0; index < video.textTracks.length; index += 1)
      video.textTracks[index].mode = "disabled";
    const track = selectedSubtitleTrack.startsWith("embedded:")
      ? embeddedSubtitles[Number(selectedSubtitleTrack.split(":")[1])]?.track
      : undefined;
    const external = selectedSubtitleTrack.startsWith("external:")
      ? subtitles[Number(selectedSubtitleTrack.split(":")[1])]
      : undefined;
    if (!track && !external) return;
    // Match Nuvio Mobile Enhanced's cue-normalizing output: keep the selected
    // track active for timing, but never let the platform draw its positioning
    // or embedded styles. TikTak renders one normalized cue below instead.
    if (track) track.mode = "hidden";
    const showCue = (latest?: ParsedSubtitleCue | TextTrackCue) => {
      window.clearTimeout(activeSubtitleTimerRef.current);
      const text =
        latest && "text" in latest
          ? cleanSubtitleText(String(latest.text))
          : "";
      setActiveSubtitleText(text);
      if (!latest || !text) return;
      const remaining = Math.max(
        80,
        Math.min(6_000, (latest.endTime - video.currentTime) * 1_000),
      );
      activeSubtitleTimerRef.current = window.setTimeout(
        () =>
          setActiveSubtitleText((current) => (current === text ? "" : current)),
        remaining,
      );
    };
    if (external) {
      const cues = parseWebVttCues(external.sourceText);
      const updateExternal = () => {
        const offset = subtitleOffsetRef.current;
        const latest = cues
          .filter(
            (cue) =>
              video.currentTime >= cue.startTime + offset &&
              video.currentTime < cue.endTime + offset,
          )
          .at(-1);
        showCue(
          latest
            ? {
                ...latest,
                startTime: latest.startTime + offset,
                endTime: latest.endTime + offset,
              }
            : undefined,
        );
      };
      video.addEventListener("timeupdate", updateExternal);
      video.addEventListener("seeked", updateExternal);
      updateExternal();
      return () => {
        window.clearTimeout(activeSubtitleTimerRef.current);
        video.removeEventListener("timeupdate", updateExternal);
        video.removeEventListener("seeked", updateExternal);
      };
    }
    const updateEmbedded = () => {
      const cues = track!.activeCues
        ? Array.from(
            { length: track!.activeCues!.length },
            (_, index) => track!.activeCues![index],
          )
        : [];
      const latest = cues
        .filter((cue) => "text" in cue)
        .sort((left, right) => left.startTime - right.startTime)
        .at(-1) as VTTCue | undefined;
      showCue(latest);
    };
    track!.addEventListener("cuechange", updateEmbedded);
    video.addEventListener("seeked", updateEmbedded);
    updateEmbedded();
    return () => {
      window.clearTimeout(activeSubtitleTimerRef.current);
      track!.removeEventListener("cuechange", updateEmbedded);
      video.removeEventListener("seeked", updateEmbedded);
    };
  }, [selectedSubtitleTrack, embeddedSubtitles, subtitles]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => {
      const viewWidth = video.clientWidth;
      const viewHeight = video.clientHeight;
      if (!viewWidth || !viewHeight) return;
      const mediaWidth = video.videoWidth;
      const mediaHeight = video.videoHeight;
      const scale =
        mediaWidth > 0 && mediaHeight > 0
          ? Math.min(viewWidth / mediaWidth, viewHeight / mediaHeight)
          : 0;
      const contentWidth = scale ? mediaWidth * scale : viewWidth;
      const contentHeight = scale ? mediaHeight * scale : viewHeight;
      const next = {
        left: Math.round((viewWidth - contentWidth) / 2),
        width: Math.round(contentWidth),
        bottom: Math.round(
          (viewHeight - contentHeight) / 2 +
            Math.max(
              24,
              Math.min(
                contentHeight * 0.24,
                contentHeight * (experienceSettings.subtitlePosition / 100),
              ),
            ),
        ),
      };
      setSubtitleBox((current) =>
        current &&
        current.left === next.left &&
        current.width === next.width &&
        current.bottom === next.bottom
          ? current
          : next,
      );
    };
    const observer =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(video);
    video.addEventListener("loadedmetadata", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    requestAnimationFrame(update);
    return () => {
      observer?.disconnect();
      video.removeEventListener("loadedmetadata", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, [playback.url, experienceSettings.subtitlePosition]);
  const revealTvControls = useCallback(() => {
    window.clearTimeout(tvControlsTimerRef.current);
    setTvControlsVisible(true);
    if (!playingRef.current || playerToolsOpen) return;
    tvControlsTimerRef.current = window.setTimeout(() => {
      setTvControlsVisible(false);
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(".player-top, .tv-player-controls, .player-tools"))
        active.blur();
    }, 3500);
  }, [playerToolsOpen]);
  const focusTvPrimaryControl = useCallback(() => {
    const focus = () =>
      dialogRef.current
        ?.querySelector<HTMLElement>("[data-tv-initial-focus]:not([disabled])")
        ?.focus();
    focus();
    // Reveal state is committed on the next frame. Focus again after that
    // commit so TV/WebView remotes land on Play instead of the hidden shell.
    requestAnimationFrame(() => requestAnimationFrame(focus));
    window.setTimeout(focus, 80);
  }, []);
  useEffect(() => {
    if (!playback.party) return;
    setParty(
      (current) =>
        current ?? {
          id: playback.party!.id,
          host: playback.party!.host,
          participants: 1,
          members: [
            {
              key: "self",
              ...partyIdentity,
              host: playback.party!.host,
              self: true,
            },
          ],
          playback,
          state: {
            position: playback.resume ?? 0,
            paused: false,
            updatedAt: Date.now(),
            serverTime: Date.now(),
            revision: 0,
          },
        },
    );
  }, [playback]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      if (dialog.open) dialog.close();
      if (minimized) dialog.show();
      else dialog.showModal();
      if (tvMode && !minimized)
        requestAnimationFrame(() =>
          dialog.querySelector<HTMLElement>("[data-tv-initial-focus]")?.focus(),
        );
    }
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, [minimized, tvMode]);
  useEffect(() => {
    if (!tvMode || minimized) return;
    const handleTvPlaybackKeys = (event: KeyboardEvent) => {
      revealTvControls();
      const active = document.activeElement as HTMLElement | null;
      if (document.querySelector(".player-source-picker[open]")) return;
      const onControl = !!active?.closest(
        ".tv-player-controls, .player-tools, .party-status, .error",
      );
      if (event.key === "Escape" || event.key === "BrowserBack") {
        event.preventDefault();
        dismiss();
        return;
      }
      if (onControl) return;
      const video = videoRef.current;
      if (!video) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (video.paused) void video.play();
        else video.pause();
      } else if (event.key === "ArrowLeft" && playback.item.type !== "live") {
        event.preventDefault();
        seekTo(currentTime - 10);
      } else if (event.key === "ArrowRight" && playback.item.type !== "live") {
        event.preventDefault();
        seekTo(currentTime + 10);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        event.stopPropagation();
        focusTvPrimaryControl();
      }
    };
    window.addEventListener("keydown", handleTvPlaybackKeys, true);
    return () =>
      window.removeEventListener("keydown", handleTvPlaybackKeys, true);
  }, [
    tvMode,
    minimized,
    currentTime,
    playback.item.type,
    revealTvControls,
    focusTvPrimaryControl,
  ]);
  useEffect(() => {
    if (playing) revealTvControls();
    else window.clearTimeout(tvControlsTimerRef.current);
    return () => window.clearTimeout(tvControlsTimerRef.current);
  }, [playing, revealTvControls]);
  useEffect(() => {
    return () => {
      window.clearTimeout(holdSpeedTimerRef.current);
      window.clearTimeout(gestureFeedbackTimerRef.current);
      window.clearTimeout(pendingTapTimerRef.current);
      if (videoRef.current && holdSpeedRestoreRateRef.current != null)
        videoRef.current.playbackRate = holdSpeedRestoreRateRef.current;
      for (const s of subtitleRef.current) URL.revokeObjectURL(s.url);
    };
  }, []);
  useEffect(() => {
    const saved = savedSubtitleOffset(playback);
    subtitleOffsetRef.current = saved;
    setSubtitleOffset(saved);
    setSubtitleSyncCapturedAt(null);
    setSelectedSubtitleTrack("auto");
    setActiveSubtitleText("");
    setSubtitleBox(null);
    setEmbeddedSubtitles([]);
    embeddedCueTimesRef.current = new WeakMap();
    subtitlePreferenceRestoredRef.current = false;
  }, [playback.item.id, playback.episode?.id]);
  useEffect(() => {
    const c = new AbortController();
    setSubtitleCandidates(playback.subtitles ?? []);
    if (
      playback.subtitleRequest &&
      experienceSettings.addonSubtitleStartupMode !== "fast"
    )
      void addonSubtitles(
        playback.subtitleRequest.addons,
        playback.item,
        playback.subtitleRequest.id,
        playback.subtitleRequest.extras,
        c.signal,
      ).then((loaded) => {
        if (!c.signal.aborted)
          setSubtitleCandidates(
            mergeSubtitles(playback.subtitles ?? [], loaded),
          );
      });
    return () => c.abort();
  }, [
    playback.item.id,
    playback.episode?.id,
    playback.url,
    playback.subtitles,
    playback.subtitleRequest,
    experienceSettings.addonSubtitleStartupMode,
  ]);
  useEffect(() => {
    const c = new AbortController();
    const preferred = preferredSubtitleLanguages(
      experienceSettings.preferredSubtitleLanguage,
      experienceSettings.secondaryPreferredSubtitleLanguage,
    );
    const filterToPreferred =
      experienceSettings.addonSubtitleStartupMode === "preferred" ||
      experienceSettings.showOnlyPreferredSubtitles;
    const startupCandidates = filterToPreferred
      ? subtitleCandidates.filter((candidate) =>
          subtitleMatchesPreference(
            candidate,
            preferred,
            useForcedSubtitleTracks,
          ),
        )
      : subtitleCandidates;
    const candidates = [...startupCandidates]
      .sort(
        (left, right) =>
          preferredSubtitleScore(right, preferred, useForcedSubtitleTracks) -
          preferredSubtitleScore(left, preferred, useForcedSubtitleTracks),
      )
      .slice(0, 24);
    if (!candidates.length) return () => c.abort();
    void Promise.allSettled(
      candidates.map(async (candidate, index) => {
        const response = await sourceFetch(candidate.url, {
          signal: c.signal,
          cache: "force-cache",
          headers: candidate.headers,
        });
        if (!response.ok) throw new Error();
        const raw = await response.text();
        const text = subtitleToWebVtt(raw, candidate.url);
        return {
          url: URL.createObjectURL(
            new Blob([shiftWebVtt(text, subtitleOffsetRef.current)], {
              type: "text/vtt",
            }),
          ),
          name: subtitlePickerName(candidate.name, candidate.lang, index),
          sourceText: text,
          sourceUrl: candidate.url,
          language: candidate.lang ?? "und",
          source: candidate.source ?? "addon",
        };
      }),
    ).then((results) => {
      if (c.signal.aborted) return;
      const loaded = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (!loaded.length) {
        setNotice("Subtitles were unavailable for this stream.");
        return;
      }
      setSubtitles((old) => {
        for (const subtitle of old) URL.revokeObjectURL(subtitle.url);
        return loaded;
      });
    });
    return () => c.abort();
  }, [
    subtitleCandidates,
    experienceSettings.addonSubtitleStartupMode,
    experienceSettings.preferredSubtitleLanguage,
    experienceSettings.secondaryPreferredSubtitleLanguage,
    experienceSettings.showOnlyPreferredSubtitles,
    useForcedSubtitleTracks,
  ]);
  useEffect(() => {
    if (
      subtitlePreferenceRestoredRef.current ||
      (!embeddedSubtitles.length && !subtitles.length)
    )
      return;
    let preference: SubtitleSelectionPreference | null = null;
    try {
      preference = JSON.parse(
        localStorage.getItem(subtitleSelectionKey(playback)) ?? "null",
      );
    } catch {}
    const restore = () => {
      if (preference?.type === "off") selectSubtitleTrack("off");
      else if (preference?.type === "embedded") {
        const index = embeddedSubtitles.findIndex(
          (track) =>
            track.label === preference?.label ||
            (!!preference?.language &&
              track.track.language === preference.language),
        );
        selectSubtitleTrack(index >= 0 ? `embedded:${index}` : "auto");
      } else if (preference?.type === "external") {
        const index = subtitles.findIndex(
          (track) =>
            track.sourceUrl === preference?.url ||
            track.name === preference?.label ||
            (!!preference?.language && track.language === preference.language),
        );
        selectSubtitleTrack(index >= 0 ? `external:${index}` : "auto");
      } else selectSubtitleTrack("auto");
      subtitlePreferenceRestoredRef.current = true;
    };
    if (
      preference?.type === "off" ||
      preference?.type === "external" ||
      embeddedSubtitles.length
    ) {
      restore();
      return;
    }
    const timer = window.setTimeout(restore, 2_000);
    return () => window.clearTimeout(timer);
  }, [embeddedSubtitles, subtitles, playback.item.id]);
  function changeSubtitleOffset(value: number) {
    // Subtitle files can be arbitrarily early or late. Preserve half-second
    // precision without imposing a misleading fixed maximum.
    const next = Math.round(value * 10) / 10;
    subtitleOffsetRef.current = next;
    setSubtitleOffset(next);
    localStorage.setItem(subtitleOffsetKey(playback), String(next));
    setSubtitles((current) =>
      current.map((subtitle) => {
        URL.revokeObjectURL(subtitle.url);
        return {
          ...subtitle,
          url: URL.createObjectURL(
            new Blob([shiftWebVtt(subtitle.sourceText, next)], {
              type: "text/vtt",
            }),
          ),
        };
      }),
    );
    applyEmbeddedSubtitleOffset(next);
  }
  function selectedSubtitleSyncCues(): ParsedSubtitleCue[] {
    if (selectedSubtitleTrack.startsWith("external:")) {
      const subtitle = subtitles[Number(selectedSubtitleTrack.split(":")[1])];
      return subtitle ? parseWebVttCues(subtitle.sourceText) : [];
    }
    if (selectedSubtitleTrack.startsWith("embedded:")) {
      const track =
        embeddedSubtitles[Number(selectedSubtitleTrack.split(":")[1])]?.track;
      if (!track?.cues) return [];
      return Array.from(
        { length: track.cues.length },
        (_, index) => track.cues![index],
      ).map((cue) => {
        const original = embeddedCueTimesRef.current.get(cue) ?? {
          start: cue.startTime,
          end: cue.endTime,
        };
        return {
          startTime: original.start,
          endTime: original.end,
          text:
            "text" in cue
              ? cleanSubtitleText(String((cue as VTTCue).text))
              : "Subtitle line",
        };
      });
    }
    return [];
  }
  function captureSubtitleSync() {
    const video = videoRef.current;
    if (!video) return;
    const position = video.currentTime;
    if (typeof position !== "number" || !Number.isFinite(position)) return;
    if (!selectedSubtitleSyncCues().length) {
      setNotice("Choose a subtitle track before syncing dialogue.");
      return;
    }
    subtitleSyncWasPlayingRef.current = !video.paused;
    video.pause();
    setSubtitleSyncQuery("");
    setSubtitleSyncCapturedAt(position);
    setNotice("");
    setPlayerToolsOpen(false);
    setTvControlsVisible(false);
    requestAnimationFrame(() => subtitleSyncSearchRef.current?.focus());
  }
  function closeSubtitleSync(resume = subtitleSyncWasPlayingRef.current) {
    setSubtitleSyncQuery("");
    setSubtitleSyncCapturedAt(null);
    subtitleSyncWasPlayingRef.current = false;
    setNotice("");
    if (resume) void videoRef.current?.play().catch(() => undefined);
  }
  function applySubtitleSyncCue(cue: ParsedSubtitleCue) {
    if (subtitleSyncCapturedAt == null) return;
    const next = Math.round((subtitleSyncCapturedAt - cue.startTime) * 10) / 10;
    changeSubtitleOffset(next);
    setSubtitleSyncQuery("");
    setSubtitleSyncCapturedAt(null);
    const resume = subtitleSyncWasPlayingRef.current;
    subtitleSyncWasPlayingRef.current = false;
    const message = `Subtitle timing set to ${next >= 0 ? "+" : ""}${next.toFixed(1)}s.`;
    window.clearTimeout(subtitleNoticeTimerRef.current);
    setNotice(message);
    subtitleNoticeTimerRef.current = window.setTimeout(
      () => setNotice((current) => (current === message ? "" : current)),
      1800,
    );
    if (resume) void videoRef.current?.play().catch(() => undefined);
  }
  useEffect(() => {
    const video = videoRef.current!;
    let disposed = false;
    let lastSave = 0;
    let hlsRecoveries = 0;
    let stallRecoveries = 0;
    let stallFailed = false;
    let sourceAttached = false;
    let lastAdvanceAt = Date.now();
    let lastMediaTime = 0;
    let intentionalSeekUntil = 0;
    let playbackStartedAt = 0;
    let playbackCommitted = false;
    setError("");
    setNotice("");
    setQuality([]);
    setAudioTracks([]);
    setPlaying(false);
    setCurrentTime(0);
    setSeekEnd(0);
    window.clearTimeout(subtitleNoticeTimerRef.current);
    const url =
      safeUrl(playback.url) ??
      (getService()?.url.startsWith("http://127.0.0.1:") &&
      playback.url.startsWith(getService()!.url + "/media/")
        ? playback.url
        : undefined);
    if (!url) {
      setError("This stream needs a secure HTTPS connection.");
      reportMediaActivity(playbackMetricId, {
        active: false,
        event: "failed",
      });
      return;
    }
    const mediaOffset = playback.mediaOffset ?? 0;
    const absoluteTime = () => mediaOffset + (video.currentTime || 0);
    const scrobbler = createTraktScrobbler(
      playback.item,
      playback.episode,
      traktProfileName,
    );
    const simklScrobbler = createSimklScrobbler(
      playback.item,
      playback.episode,
      traktProfileName,
    );
    const scrobbleProgress = () => {
      const duration =
        runtimeSeconds(playback.item.runtime) || mediaOffset + video.duration;
      return Number.isFinite(duration) && duration > 0
        ? (absoluteTime() / duration) * 100
        : 0;
    };
    const persist = () =>
      storeProgress(
        playback.item,
        absoluteTime(),
        runtimeSeconds(playback.item.runtime) || video.duration,
        playback.episode,
      );
    const persistVisible = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const time = () => {
      if (Math.abs(video.currentTime - lastMediaTime) >= 0.1) {
        lastMediaTime = video.currentTime;
        lastAdvanceAt = Date.now();
        stallRecoveries = 0;
        if (playbackStartedAt && Date.now() - playbackStartedAt >= 2500)
          playbackCommitted = true;
      }
      setCurrentTime(absoluteTime());
      const available = video.seekable.length
        ? video.seekable.end(video.seekable.length - 1)
        : Number.isFinite(video.duration)
          ? video.duration
          : 0;
      setSeekEnd(mediaOffset + available);
      const duration =
        runtimeSeconds(playback.item.runtime) || mediaOffset + video.duration;
      if (
        !nextAdvanceTriggeredRef.current &&
        experienceSettings.autoPlayNextEpisode &&
        nextEpisodeRef.current &&
        !playback.party &&
        Number.isFinite(duration) &&
        duration > 0
      ) {
        const position = absoluteTime();
        const thresholdReached =
          experienceSettings.nextEpisodeThresholdMode === "minutes"
            ? duration - position <=
              experienceSettings.nextEpisodeMinutesBeforeEnd * 60
            : (position / duration) * 100 >=
              experienceSettings.nextEpisodeThresholdPercent;
        if (thresholdReached) {
          nextAdvanceTriggeredRef.current = true;
          void advanceNextEpisode();
        }
      }
      if (Date.now() - lastSave > 5000) {
        persist();
        lastSave = Date.now();
      }
    };
    const loaded = () => {
      video.playbackRate = playbackRate;
      if (
        playback.resume &&
        playback.item.type !== "live" &&
        Number.isFinite(video.duration)
      )
        video.currentTime = Math.min(
          Math.max(0, playback.resume - mediaOffset),
          Math.max(0, video.duration - 1),
        );
      const nativeTracks = (
        video as HTMLVideoElement & {
          audioTracks?: {
            length: number;
            [index: number]: { label?: string; language?: string };
          };
        }
      ).audioTracks;
      if (nativeTracks?.length && nativeTracks.length > 1)
        setAudioTracks(() => {
          const tracks = Array.from(
            { length: nativeTracks.length },
            (_, value) => ({
              value,
              source: "native" as const,
              label:
                nativeTracks[value].label ||
                nativeTracks[value].language ||
                `Audio ${value + 1}`,
            }),
          );
          const selectedIndex = preferredAudioTrackIndex(
            Array.from({ length: nativeTracks.length }, (_, index) => ({
              label: nativeTracks[index].label,
              language: nativeTracks[index].language,
            })),
          );
          if (selectedIndex != null)
            for (let index = 0; index < nativeTracks.length; index += 1)
              (nativeTracks[index] as { enabled?: boolean }).enabled =
                index === selectedIndex;
          return tracks;
        });
      refreshEmbeddedSubtitles();
    };
    const failed = () => {
      if (!sourceAttached) return;
      if (!playbackCommitted && onFailure?.()) return;
      reportMediaActivity(playbackMetricId, {
        active: false,
        event: "failed",
      });
      const code = video.error?.code;
      setError(
        code === MediaError.MEDIA_ERR_DECODE
          ? "This browser could not decode the source. Choose a Direct play result or connect the compatibility service for conversion."
          : code === MediaError.MEDIA_ERR_NETWORK
            ? "The stream stopped responding or blocked browser access. Check the add-on in Playback health and try another source."
            : code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED
              ? "The source format is unsupported on this device. Choose a Direct play source or enable compatibility conversion."
              : "Playback could not start after every compatible fallback was tried. Run Playback health in Settings for a specific connection check.",
      );
    };
    const playingStarted = () => {
      lastAdvanceAt = Date.now();
      lastMediaTime = video.currentTime;
      if (!playbackStartedAt) playbackStartedAt = Date.now();
      intentionalSeekUntil = 0;
      stallRecoveries = 0;
      setPlaying(true);
      setNotice((current) =>
        current === autoplayBlockedNotice ? "" : current,
      );
      if (subtitleSyncCapturedAtRef.current != null) {
        setSubtitleSyncQuery("");
        setSubtitleSyncCapturedAt(null);
        subtitleSyncWasPlayingRef.current = false;
      }
      scrobbler.start(scrobbleProgress());
      simklScrobbler.start(scrobbleProgress());
      reportMediaActivity(playbackMetricId, {
        active: true,
        event: "started",
      });
    };
    const playingStopped = () => {
      setPlaying(false);
      if (!video.ended) scrobbler.pause(scrobbleProgress());
      if (!video.ended) simklScrobbler.pause(scrobbleProgress());
      reportMediaActivity(playbackMetricId, { active: false });
    };
    const playbackEnded = () => {
      setPlaying(false);
      scrobbler.stop(100);
      simklScrobbler.stop(100);
      if (
        traktProfileName &&
        anilistProgressEnabled(traktProfileName) &&
        anilistMediaRef(playback.item.id)
      )
        void recordAniListEpisode(
          traktProfileName,
          playback.item.id,
          playback.episode?.episode,
        ).catch(() => undefined);
      reportMediaActivity(playbackMetricId, {
        active: false,
        event: "ended",
      });
      persist();
      if (
        nextEpisodeRef.current &&
        !playback.party &&
        readNextEpisodeAutoAdvance()
      )
        void advanceNextEpisode();
    };
    const play = async (showBlockedNotice = false) => {
      try {
        await video.play();
      } catch {
        if (!disposed && showBlockedNotice)
          window.setTimeout(() => {
            if (!disposed && video.paused && !video.ended)
              setNotice(autoplayBlockedNotice);
          }, 250);
      }
    };
    // iOS PWA can reject an immediate play() while it is still attaching an
    // asynchronously resolved movie URL, then leave the fully buffered video
    // paused. Retry once when media is actually ready; the original tap on
    // The title's Play action remains the user gesture that started playback.
    const playWhenReady = () => {
      if (video.paused && !video.ended) void play(true);
    };
    const resetStallClock = () => {
      lastAdvanceAt = Date.now();
      lastMediaTime = video.currentTime;
    };
    const seekStarted = () => {
      intentionalSeekUntil = Date.now() + 15_000;
      resetStallClock();
    };
    const seekFinished = () => {
      intentionalSeekUntil = Date.now() + 8_000;
      stallRecoveries = 0;
      resetStallClock();
    };
    const recoverStall = () => {
      if (stallFailed) return;
      if (Date.now() < intentionalSeekUntil) return;
      if (
        !playbackNeedsRecovery({
          now: Date.now(),
          lastAdvanceAt,
          paused: video.paused,
          ended: video.ended,
          seeking: video.seeking,
          hidden: document.visibilityState === "hidden",
        })
      )
        return;
      lastAdvanceAt = Date.now();
      if (hlsRef.current && stallRecoveries < 1) {
        stallRecoveries += 1;
        hlsRef.current.startLoad(
          playback.item.type === "live" ? -1 : video.currentTime,
        );
        setNotice("Playback stalled. Reconnecting…");
        void play();
        return;
      }
      stallFailed = true;
      setNotice("Playback stopped responding. Recovering…");
      failed();
    };
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("timeupdate", time);
    video.addEventListener("progress", time);
    video.addEventListener("durationchange", time);
    video.addEventListener("play", playingStarted);
    video.addEventListener("pause", playingStopped);
    video.addEventListener("pause", persist);
    video.addEventListener("ended", playbackEnded);
    video.addEventListener("error", failed);
    video.addEventListener("seeking", seekStarted);
    video.addEventListener("seeked", seekFinished);
    video.addEventListener("canplay", resetStallClock);
    video.addEventListener("canplay", playWhenReady);
    window.addEventListener("pagehide", persist);
    document.addEventListener("visibilitychange", persistVisible);
    const stallTimer = window.setInterval(recoverStall, 3_000);
    const subtitleTrackTimer = window.setInterval(
      refreshEmbeddedSubtitles,
      1_000,
    );
    const isHls = playback.hls || /\.m3u8(?:[?#]|$)/i.test(playback.url);
    const nativeHls =
      video.canPlayType("application/vnd.apple.mpegurl") !== "" &&
      /(?:iPhone|iPad|iPod|Safari)/i.test(navigator.userAgent) &&
      !/(?:Chrome|Chromium|CriOS|Edg|OPR)/i.test(navigator.userAgent);
    if (isHls && !nativeHls) {
      void import("hls.js")
        .then(({ default: HlsClass }) => {
          if (disposed) return;
          if (!HlsClass.isSupported()) {
            reportMediaActivity(playbackMetricId, {
              active: false,
              event: "failed",
            });
            setError(
              "This browser cannot play HLS. Try Safari or a current Chromium browser.",
            );
            return;
          }
          const hls = new HlsClass({
            maxBufferLength: 20,
            maxMaxBufferLength: 40,
            backBufferLength: 20,
            enableWorker: true,
          });
          hlsRef.current = hls;
          hls.on(HlsClass.Events.MANIFEST_PARSED, () => {
            setQuality(
              hls.levels.map((level, i) => ({
                value: i,
                label: level.height
                  ? `${level.height}p`
                  : `${Math.round(level.bitrate / 1000)} kbps`,
              })),
            );
            if (hls.audioTracks.length > 1) {
              const tracks = hls.audioTracks.map((track, value) => ({
                value,
                source: "hls" as const,
                label: track.lang || track.name || `Audio ${value + 1}`,
              }));
              setAudioTracks(tracks);
              const selectedIndex = preferredAudioTrackIndex(
                hls.audioTracks.map((track) => ({
                  label: track.name,
                  language: track.lang,
                })),
              );
              if (selectedIndex != null) hls.audioTrack = selectedIndex;
            }
            void play();
          });
          hls.on(HlsClass.Events.SUBTITLE_TRACKS_UPDATED, () => {
            refreshEmbeddedSubtitles();
          });
          hls.on(HlsClass.Events.ERROR, (_, data) => {
            if (hlsErrorTargetsSubtitles(data)) {
              hls.subtitleTrack = -1;
              selectSubtitleTrack("off");
              setNotice(
                "That subtitle track could not load. Video playback will continue.",
              );
              return;
            }
            if (data.fatal) {
              if (
                data.type === HlsClass.ErrorTypes.MEDIA_ERROR &&
                hlsRecoveries < 3
              ) {
                hlsRecoveries += 1;
                hls.recoverMediaError();
                setNotice("Recovering the live stream...");
                return;
              }
              if (
                data.type === HlsClass.ErrorTypes.NETWORK_ERROR &&
                hlsRecoveries < 2
              ) {
                hlsRecoveries += 1;
                hls.startLoad();
                setNotice("Reconnecting to the live channel...");
                return;
              }
              hls.destroy();
              hlsRef.current = null;
              failed();
            }
          });
          hls.on(HlsClass.Events.MEDIA_ATTACHED, () => {
            sourceAttached = true;
            hls.loadSource(url);
          });
          hls.attachMedia(video);
        })
        .catch(() => {
          reportMediaActivity(playbackMetricId, {
            active: false,
            event: "failed",
          });
          setError(
            "The video player could not load. Check your connection and retry.",
          );
        });
    } else {
      sourceAttached = true;
      video.src = url;
      void play();
    }
    return () => {
      window.clearTimeout(subtitleNoticeTimerRef.current);
      disposed = true;
      reportMediaActivity(playbackMetricId, { active: false });
      persist();
      scrobbler.stop(scrobbleProgress());
      simklScrobbler.stop(scrobbleProgress());
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("timeupdate", time);
      video.removeEventListener("progress", time);
      video.removeEventListener("durationchange", time);
      video.removeEventListener("play", playingStarted);
      video.removeEventListener("pause", playingStopped);
      video.removeEventListener("pause", persist);
      video.removeEventListener("ended", playbackEnded);
      video.removeEventListener("error", failed);
      video.removeEventListener("seeking", seekStarted);
      video.removeEventListener("seeked", seekFinished);
      video.removeEventListener("canplay", resetStallClock);
      video.removeEventListener("canplay", playWhenReady);
      window.removeEventListener("pagehide", persist);
      document.removeEventListener("visibilitychange", persistVisible);
      window.clearInterval(stallTimer);
      window.clearInterval(subtitleTrackTimer);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [
    playback,
    retry,
    traktProfileName,
    experienceSettings.autoPlayNextEpisode,
    experienceSettings.nextEpisodeThresholdMode,
    experienceSettings.nextEpisodeThresholdPercent,
    experienceSettings.nextEpisodeMinutesBeforeEnd,
  ]);
  useEffect(() => {
    if (!party) return;
    let disposed = false;
    let syncing = false;
    const synchronize = async () => {
      if (disposed || syncing) return;
      const video = videoRef.current;
      if (!video) return;
      syncing = true;
      try {
        const result = await partyState(
          party.id,
          party.host
            ? {
                position:
                  (playback.mediaOffset ?? 0) + (video.currentTime || 0),
                paused: video.paused,
              }
            : undefined,
          partyIdentity,
        );
        if (disposed) return;
        setParty(result);
        if (!party.host) {
          const elapsed = result.state.paused
            ? 0
            : Math.max(0, result.state.serverTime - result.state.updatedAt) /
              1000;
          const target = Math.max(0, result.state.position + elapsed);
          const localTarget = target - (playback.mediaOffset ?? 0);
          if (
            localTarget >= 0 &&
            Math.abs((video.currentTime || 0) - localTarget) > 1.25
          )
            video.currentTime = localTarget;
          if (result.state.paused) {
            if (!video.paused) video.pause();
          } else if (video.paused) {
            await video
              .play()
              .catch(() =>
                setNotice("Tap Play once to join the synchronized playback."),
              );
          }
        }
      } catch (e) {
        if (!disposed) {
          const message =
            e instanceof Error ? e.message : "Watch Together disconnected.";
          if (/host ended/i.test(message)) {
            video.pause();
            setParty(null);
            const url = new URL(location.href);
            url.searchParams.delete("party");
            history.replaceState(null, "", url);
          }
          setNotice(message);
        }
      } finally {
        syncing = false;
      }
    };
    void synchronize();
    const timer = window.setInterval(synchronize, 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [party?.id, party?.host]);

  async function startParty() {
    const video = videoRef.current;
    if (!video || partyBusy) return;
    setPartyBusy(true);
    try {
      const session = await createParty(
        { ...playback, prepared: true, party: undefined },
        (playback.mediaOffset ?? 0) + (video.currentTime || 0),
        video.paused,
        partyIdentity,
      );
      setParty(session);
      const link = partyLink(session.id);
      history.replaceState(null, "", link);
      await navigator.clipboard.writeText(link).catch(() => undefined);
      setCopied(true);
      setNotice("Watch Together link copied. Your playback controls the room.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      setNotice(
        e instanceof Error ? e.message : "Could not start Watch Together.",
      );
    } finally {
      setPartyBusy(false);
    }
  }

  async function copyPartyLink() {
    if (!party) return;
    await navigator.clipboard.writeText(partyLink(party.id));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  }
  async function stopParty() {
    if (!party?.host || partyBusy) return;
    setPartyBusy(true);
    try {
      await endParty(party.id);
      setParty(null);
      const url = new URL(location.href);
      url.searchParams.delete("party");
      history.replaceState(null, "", url);
      setNotice("Watch Together room ended. Your video will keep playing.");
    } catch (reason) {
      setNotice(
        reason instanceof Error ? reason.message : "Could not end the room.",
      );
    } finally {
      setPartyBusy(false);
    }
  }
  async function removeMember(memberKey: string) {
    if (!party?.host || partyBusy) return;
    setPartyBusy(true);
    try {
      setParty(await removePartyMember(party.id, memberKey));
    } catch (reason) {
      setNotice(
        reason instanceof Error
          ? reason.message
          : "Could not remove that participant.",
      );
    } finally {
      setPartyBusy(false);
    }
  }
  async function fullscreen() {
    const v = videoRef.current as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
    };
    try {
      if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      else await v.requestFullscreen();
    } catch {
      setNotice("Use the fullscreen control inside the video.");
    }
  }
  async function pip() {
    const v = videoRef.current as HTMLVideoElement & {
      webkitSetPresentationMode?: (mode: string) => void;
    };
    try {
      if (v.webkitSetPresentationMode)
        v.webkitSetPresentationMode("picture-in-picture");
      else if (document.pictureInPictureEnabled)
        await v.requestPictureInPicture();
      else setNotice("Picture in Picture is not available in this browser.");
    } catch {
      setNotice("Start playback before entering Picture in Picture.");
    }
  }
  function airplay() {
    const v = videoRef.current as HTMLVideoElement & {
      webkitShowPlaybackTargetPicker?: () => void;
    };
    if (v.webkitShowPlaybackTargetPicker) v.webkitShowPlaybackTargetPicker();
    else
      setNotice("AirPlay is available in Safari with a compatible receiver.");
  }
  function close() {
    const video = videoRef.current;
    if (video)
      storeProgress(
        playback.item,
        (playback.mediaOffset ?? 0) + video.currentTime,
        runtimeSeconds(playback.item.runtime) || video.duration,
        playback.episode,
      );
    onClose();
  }
  function dismiss() {
    if (playback.item.type === "live" && !minimized && onMinimize) {
      onMinimize(true);
      return;
    }
    close();
  }
  const timelineEnd = Math.max(
    seekEnd,
    playback.item.type === "live" ? 0 : runtimeSeconds(playback.item.runtime),
  );
  function seekTo(target: number) {
    const video = videoRef.current;
    if (!video) return;
    const bounded = Math.max(0, Math.min(target, timelineEnd || target));
    const offset = playback.mediaOffset ?? 0;
    const localTarget = bounded - offset;
    const localSeekEnd = video.seekable.length
      ? video.seekable.end(video.seekable.length - 1)
      : Number.isFinite(video.duration)
        ? video.duration
        : 0;
    if (localTarget >= 0 && localTarget <= localSeekEnd + 0.5) {
      video.currentTime = localTarget;
      return;
    }
    if (onSeek) onSeek(bounded);
  }
  function togglePlayerControls() {
    window.clearTimeout(tvControlsTimerRef.current);
    if (subtitleSyncCapturedAt != null) return;
    if (playerToolsOpen) {
      setPlayerToolsOpen(false);
      setTvControlsVisible(true);
      return;
    }
    setTvControlsVisible((visible) => !visible);
  }
  function stopHoldToSpeed() {
    window.clearTimeout(holdSpeedTimerRef.current);
    holdSpeedTimerRef.current = 0;
    holdSpeedPointerRef.current = null;
    const restore = holdSpeedRestoreRateRef.current;
    const wasActive = restore != null;
    if (restore != null && videoRef.current)
      videoRef.current.playbackRate = restore;
    holdSpeedRestoreRateRef.current = null;
    setHoldSpeedActive(false);
    return wasActive;
  }
  function scheduleHoldToSpeed(pointerId: number) {
    stopHoldToSpeed();
    holdSpeedPointerRef.current = pointerId;
    holdSpeedTimerRef.current = window.setTimeout(() => {
      if (holdSpeedPointerRef.current !== pointerId) return;
      const video = videoRef.current;
      if (!video) return;
      const target = experienceSettings.holdToSpeedValue;
      if (Math.abs(video.playbackRate - target) < 0.01) return;
      holdSpeedRestoreRateRef.current = video.playbackRate;
      video.playbackRate = target;
      setHoldSpeedActive(true);
      navigator.vibrate?.(20);
    }, 500);
  }
  function showTimedGestureFeedback(
    feedback: NonNullable<typeof gestureFeedback>,
  ) {
    window.clearTimeout(gestureFeedbackTimerRef.current);
    setGestureFeedback(feedback);
    gestureFeedbackTimerRef.current = window.setTimeout(
      () => setGestureFeedback(null),
      900,
    );
  }
  function seekGestureFeedback(target: number, baseline: number) {
    const delta = Math.round(target - baseline);
    return {
      kind: delta < 0 ? ("seek-back" as const) : ("seek-forward" as const),
      primary: formatPlayerTime(target),
      secondary: `${delta >= 0 ? "+" : "−"}${Math.abs(delta)}s`,
    };
  }
  function handlePlayerDoubleTap(
    clientX: number,
    surfaceLeft: number,
    width: number,
  ) {
    const position = (clientX - surfaceLeft) / Math.max(1, width);
    if (position < 0.4) {
      const target = Math.max(0, currentTime - 10);
      seekTo(target);
      showTimedGestureFeedback(seekGestureFeedback(target, currentTime));
      return;
    }
    if (position > 0.6) {
      const target = Math.min(
        timelineEnd || currentTime + 10,
        currentTime + 10,
      );
      seekTo(target);
      showTimedGestureFeedback(seekGestureFeedback(target, currentTime));
      return;
    }
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
    setTvControlsVisible(false);
  }
  function completePlayerTap(clientX: number, clientY: number) {
    const now = Date.now();
    const previous = previousTapRef.current;
    if (
      previous &&
      now - previous.time <= 320 &&
      Math.hypot(clientX - previous.x, clientY - previous.y) <= 48
    ) {
      window.clearTimeout(pendingTapTimerRef.current);
      previousTapRef.current = null;
      const rect = dialogRef.current?.getBoundingClientRect();
      handlePlayerDoubleTap(
        clientX,
        rect?.left ?? 0,
        rect?.width ?? innerWidth,
      );
      return;
    }
    previousTapRef.current = { time: now, x: clientX, y: clientY };
    window.clearTimeout(pendingTapTimerRef.current);
    pendingTapTimerRef.current = window.setTimeout(() => {
      previousTapRef.current = null;
      togglePlayerControls();
    }, 280);
  }
  function playerTapHitsControl(target: EventTarget | null) {
    return (
      target instanceof Element &&
      !!target.closest(
        "button, input, select, label, a, .player-tools, .subtitle-cue-overlay, .party-status, .error, .muted",
      )
    );
  }
  const activeSkipSegment = skipSegments.find(
    (segment) =>
      currentTime >= segment.startTime && currentTime < segment.endTime - 0.25,
  );
  const preferredSubtitleLanguageCodes = preferredSubtitleLanguages(
    experienceSettings.preferredSubtitleLanguage,
    experienceSettings.secondaryPreferredSubtitleLanguage,
  );
  const visibleEmbeddedSubtitles = embeddedSubtitles
    .map((subtitle, index) => ({ subtitle, index }))
    .filter(
      ({ subtitle }) =>
        !experienceSettings.showOnlyPreferredSubtitles ||
        renderedSubtitleMatchesPreference(
          subtitle.label,
          subtitle.track.language,
          preferredSubtitleLanguageCodes,
          useForcedSubtitleTracks,
        ),
    );
  const visibleExternalSubtitles = subtitles
    .map((subtitle, index) => ({ subtitle, index }))
    .filter(
      ({ subtitle }) =>
        !experienceSettings.showOnlyPreferredSubtitles ||
        renderedSubtitleMatchesPreference(
          subtitle.name,
          subtitle.language,
          preferredSubtitleLanguageCodes,
          useForcedSubtitleTracks,
        ),
    );
  const visibleSubtitleSyncCues =
    subtitleSyncCapturedAt == null
      ? []
      : selectedSubtitleSyncCues()
          .filter((cue) => {
            const query = subtitleSyncQuery.trim().toLocaleLowerCase();
            if (query) return cue.text.toLocaleLowerCase().includes(query);
            return Math.abs(cue.startTime - subtitleSyncCapturedAt) <= 900;
          })
          .sort((left, right) => left.startTime - right.startTime)
          .slice(0, subtitleSyncQuery.trim() ? 200 : 600);
  return (
    <dialog
      ref={dialogRef}
      className={`player-dialog tv-web-player${tvMode ? " tv-player-surface" : ""}${minimized ? " mini-live-player" : ""}${!tvControlsVisible ? " controls-hidden" : ""}`}
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      aria-label={`${playback.item.name} player`}
      onClick={(event) => {
        if (
          tvMode ||
          !experienceSettings.touchGestures ||
          playback.item.type === "live" ||
          Date.now() - lastTouchToggleRef.current < 700 ||
          playerTapHitsControl(event.target)
        )
          return;
        togglePlayerControls();
      }}
      onPointerMove={(event) => {
        const start = playerTouchStartRef.current;
        if (start?.pointerId === event.pointerId) {
          const dx = event.clientX - start.x;
          const dy = event.clientY - start.y;
          const distance = Math.hypot(dx, dy);
          if (distance > 12) stopHoldToSpeed();
          if (start.mode == null) {
            const horizontalDominant =
              Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy);
            const verticalActivation = Math.max(30, start.height * 0.06);
            const verticalDominant =
              Math.abs(dy) > verticalActivation &&
              Math.abs(dy) > Math.abs(dx) * 1.2;
            const verticalEdgeSafe =
              start.y - start.top > start.height * 0.05 &&
              start.y - start.top < start.height * 0.95;
            if (horizontalDominant) start.mode = "seek";
            else if (
              verticalDominant &&
              verticalEdgeSafe &&
              start.x - start.left < start.width * 0.4
            )
              start.mode = "brightness";
            else if (
              verticalDominant &&
              verticalEdgeSafe &&
              start.x - start.left > start.width * 0.6
            )
              start.mode = "volume";
          }
          if (start.mode) {
            event.preventDefault();
            window.clearTimeout(gestureFeedbackTimerRef.current);
            setTvControlsVisible(false);
          }
          if (start.mode === "seek") {
            const sensitivity =
              timelineEnd >= 3600 ? 120 : timelineEnd >= 1800 ? 90 : 60;
            const target = Math.max(
              0,
              Math.min(
                timelineEnd || Number.POSITIVE_INFINITY,
                start.baselineTime +
                  (dx / Math.max(1, start.width)) * sensitivity,
              ),
            );
            start.previewTime = target;
            setGestureFeedback(seekGestureFeedback(target, start.baselineTime));
          } else if (start.mode === "brightness") {
            const target = Math.max(
              0.2,
              Math.min(
                1,
                start.initialBrightness + (-dy / start.height) * 0.65,
              ),
            );
            setPlayerBrightness(target);
            if (experienceSettings.rememberPlayerBrightness)
              localStorage.setItem("tiktak:player-brightness", String(target));
            setGestureFeedback({
              kind: "brightness",
              primary: `Brightness ${Math.round(target * 100)}%`,
            });
          } else if (start.mode === "volume") {
            const target = Math.max(
              0,
              Math.min(1, start.initialVolume + (-dy / start.height) * 0.65),
            );
            if (videoRef.current) {
              videoRef.current.muted = false;
              videoRef.current.volume = target;
            }
            setGestureFeedback({
              kind: "volume",
              primary:
                target <= 0.001
                  ? "Muted"
                  : `Volume ${Math.round(target * 100)}%`,
            });
          }
        }
        if (
          (tvMode || event.pointerType === "mouse") &&
          !(event.target as Element).closest(".subtitle-cue-overlay")
        )
          revealTvControls();
      }}
      onPointerDown={(event) => {
        if (tvMode && !playerTapHitsControl(event.target)) revealTvControls();
        if (
          !tvMode &&
          experienceSettings.touchGestures &&
          playback.item.type !== "live" &&
          (event.pointerType === "touch" || event.pointerType === "pen") &&
          !playerTapHitsControl(event.target)
        ) {
          const rect = event.currentTarget.getBoundingClientRect();
          playerTouchStartRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            baselineTime: currentTime,
            initialVolume: videoRef.current?.volume ?? 1,
            initialBrightness: playerBrightness,
            mode: null,
            previewTime: currentTime,
          };
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            // Synthetic tests and older iOS WebViews may not expose an
            // active native pointer to capture. The dialog still receives
            // bubbled pointer events from its video surface.
          }
        }
        if (
          !tvMode &&
          experienceSettings.touchGestures &&
          experienceSettings.holdToSpeed &&
          playback.item.type !== "live" &&
          (event.pointerType === "touch" || event.pointerType === "pen") &&
          !playerTapHitsControl(event.target)
        )
          scheduleHoldToSpeed(event.pointerId);
      }}
      onPointerUp={(event) => {
        const start = playerTouchStartRef.current;
        playerTouchStartRef.current = null;
        try {
          if (event.currentTarget.hasPointerCapture?.(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
          // See the capture compatibility note in pointer down.
        }
        if (stopHoldToSpeed()) {
          lastTouchToggleRef.current = Date.now();
          return;
        }
        if (start?.pointerId === event.pointerId && start.mode) {
          lastTouchToggleRef.current = Date.now();
          if (start.mode === "seek") {
            seekTo(start.previewTime);
            showTimedGestureFeedback(
              seekGestureFeedback(start.previewTime, start.baselineTime),
            );
          } else {
            gestureFeedbackTimerRef.current = window.setTimeout(
              () => setGestureFeedback(null),
              900,
            );
          }
          return;
        }
        if (
          !start ||
          start.pointerId !== event.pointerId ||
          playerTapHitsControl(event.target) ||
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12
        )
          return;
        lastTouchToggleRef.current = Date.now();
        completePlayerTap(event.clientX, event.clientY);
      }}
      onPointerCancel={() => {
        stopHoldToSpeed();
        playerTouchStartRef.current = null;
        setGestureFeedback(null);
      }}
      onKeyDownCapture={(event) => {
        if (!tvMode) return;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          const active = document.activeElement as HTMLElement | null;
          const cluster = active?.closest(".tv-web-center-controls");
          if (cluster) {
            const controls = Array.from(
              cluster.querySelectorAll<HTMLButtonElement>(
                "button:not([disabled])",
              ),
            );
            const index = controls.indexOf(active as HTMLButtonElement);
            const next =
              event.key === "ArrowRight"
                ? controls[index + 1]
                : controls[index - 1];
            if (next) {
              event.preventDefault();
              event.stopPropagation();
              next.focus();
            }
            return;
          }
        }
        if (event.key !== "ArrowDown") return;
        event.preventDefault();
        event.stopPropagation();
        revealTvControls();
        focusTvPrimaryControl();
      }}
    >
      <div className="player-top">
        <div>
          <span className="eyebrow">
            {playback.item.type === "live" ? "LIVE TELEVISION" : "NOW PLAYING"}
          </span>
          <h2>{playback.item.name}</h2>
          {playback.episode && (
            <p>
              S{playback.episode.season} · E{playback.episode.episode} —{" "}
              {playback.episode.name}
            </p>
          )}
        </div>
        <div className="player-window-actions">
          {playback.item.type === "live" && onMinimize && (
            <button
              className="icon-button"
              onClick={() => onMinimize(!minimized)}
              aria-label={
                minimized
                  ? "Restore live player"
                  : "Browse guide with mini player"
              }
            >
              <PictureInPicture2 />
            </button>
          )}
          <button
            className="icon-button"
            onClick={dismiss}
            aria-label={
              playback.item.type === "live" && !minimized
                ? "Minimize live player"
                : "Close player"
            }
          >
            <X />
          </button>
        </div>
      </div>
      <video
        ref={videoRef}
        controls={playback.item.type === "live" && !tvMode}
        autoPlay
        playsInline
        preload="metadata"
        poster={playback.item.background}
        aria-label={playback.item.name}
        style={{
          objectFit:
            experienceSettings.resizeMode === "fit" ? "contain" : "cover",
          transform:
            experienceSettings.resizeMode === "zoom" ? "scale(1.12)" : "none",
          filter: `brightness(${playerBrightness})`,
        }}
      />
      {parentalGuideVisible && playback.item.certification && (
        <button
          type="button"
          className="player-parental-guide"
          aria-label="Dismiss content rating"
          onClick={() => setParentalGuideVisible(false)}
        >
          <strong>{playback.item.certification}</strong>
          <span>Content rating</span>
        </button>
      )}
      {holdSpeedActive && (
        <div className="player-gesture-feedback" role="status">
          <FastForward size={22} />
          <strong>{experienceSettings.holdToSpeedValue}× speed</strong>
        </div>
      )}
      {!holdSpeedActive && gestureFeedback && (
        <div
          className={`player-gesture-feedback ${gestureFeedback.kind}`}
          role="status"
          data-testid="player-gesture-feedback"
        >
          {gestureFeedback.kind === "seek-back" ? (
            <RotateCcw size={22} />
          ) : gestureFeedback.kind === "seek-forward" ? (
            <RotateCw size={22} />
          ) : gestureFeedback.kind === "brightness" ? (
            <Sun size={22} />
          ) : videoRef.current?.volume === 0 ? (
            <VolumeX size={22} />
          ) : (
            <Volume2 size={22} />
          )}
          <span>
            <strong>{gestureFeedback.primary}</strong>
            {gestureFeedback.secondary && (
              <small>{gestureFeedback.secondary}</small>
            )}
          </span>
        </div>
      )}
      {activeSkipSegment && (
        <button
          type="button"
          className="player-skip-segment"
          onClick={() => {
            const target = activeSkipSegment.endTime + 0.05;
            seekTo(target);
            setCurrentTime(target);
            navigator.vibrate?.(12);
          }}
        >
          {skipSegmentLabel(activeSkipSegment.type)}
          <FastForward size={18} />
        </button>
      )}
      {experienceSettings.playerStatusOverlay && (
        <div className="player-status-overlay" role="status">
          <strong>{playback.sourceLabel ?? "TikTakTV stream"}</strong>
          <span>
            {playing ? "Playing" : "Paused"} ·{" "}
            {playback.mode === "transcode"
              ? "Converted"
              : playback.mode === "remux"
                ? "Remuxed"
                : "Direct"}
          </span>
        </div>
      )}
      {activeSubtitleText && subtitleBox && (
        <div
          className="player-subtitle-overlay"
          aria-live="off"
          style={{
            left: subtitleBox.left,
            width: subtitleBox.width,
            bottom: subtitleBox.bottom,
          }}
        >
          <span>{activeSubtitleText}</span>
        </div>
      )}
      {(playback.item.type !== "live" || tvMode) && (
        <div
          className={`vod-controls${tvMode ? " tv-player-controls" : ""}`}
          aria-label="Playback controls"
        >
          <div className="tv-web-center-controls">
            {playback.item.type !== "live" && (
              <button
                type="button"
                aria-label="Rewind 10 seconds"
                onClick={() => seekTo(currentTime - 10)}
              >
                <RotateCcw size={18} />
                <span>10</span>
              </button>
            )}
            {(playback.item.type !== "live" || tvMode) && (
              <button
                className="primary-play-control"
                data-tv-initial-focus={tvMode ? true : undefined}
                type="button"
                aria-label={playing ? "Pause" : "Play"}
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) void video.play();
                  else video.pause();
                }}
              >
                {playing ? <Pause size={18} /> : <Play size={18} />}
              </button>
            )}
            {playback.item.type !== "live" && (
              <button
                type="button"
                aria-label="Fast forward 10 seconds"
                onClick={() => seekTo(currentTime + 10)}
              >
                <RotateCw size={18} />
                <span>10</span>
              </button>
            )}
          </div>
          <div className="tv-web-progress-controls">
            {playback.item.type !== "live" ? (
              <>
                <span>{formatPlayerTime(currentTime)}</span>
                <input
                  type="range"
                  aria-label="Playback position"
                  min="0"
                  max={Math.max(1, timelineEnd)}
                  step="0.1"
                  value={Math.min(currentTime, Math.max(1, timelineEnd))}
                  onChange={(event) => seekTo(Number(event.target.value))}
                />
                <span>{formatPlayerTime(timelineEnd)}</span>
              </>
            ) : (
              <span className="tv-live-indicator">
                <i /> LIVE
              </span>
            )}
            <button
              type="button"
              className={playerToolsOpen ? "selected" : undefined}
              aria-label={
                playerToolsOpen
                  ? "Close playback options"
                  : "Open playback options"
              }
              aria-controls="player-options"
              aria-expanded={playerToolsOpen}
              onClick={() => {
                const next = !playerToolsOpen;
                window.clearTimeout(tvControlsTimerRef.current);
                setTvControlsVisible(true);
                setPlayerToolsOpen(next);
                if (next)
                  requestAnimationFrame(() =>
                    dialogRef.current
                      ?.querySelector<HTMLElement>(
                        ".player-tools button:not([disabled]), .player-tools select",
                      )
                      ?.focus(),
                  );
              }}
            >
              <Settings2 size={22} />
            </button>
          </div>
        </div>
      )}
      {submitSkipOpen && playback.episode && (
        <div
          className="player-skip-submit"
          role="dialog"
          aria-modal="true"
          aria-label="Submit skip timing"
        >
          <header>
            <div>
              <strong>Submit IntroDB timing</strong>
              <small>
                S{playback.episode.season} E{playback.episode.episode}
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close skip timing"
              onClick={() => setSubmitSkipOpen(false)}
            >
              <X size={18} />
            </button>
          </header>
          <label>
            Segment type
            <select
              value={submitSkipType}
              onChange={(event) =>
                setSubmitSkipType(event.target.value as SkipSegment["type"])
              }
            >
              <option value="intro">Intro</option>
              <option value="recap">Recap</option>
              <option value="outro">Credits / outro</option>
            </select>
          </label>
          <div className="player-skip-time-grid">
            <label>
              Start time
              <input
                value={submitSkipStart}
                inputMode="numeric"
                placeholder="0:00"
                onChange={(event) => setSubmitSkipStart(event.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  setSubmitSkipStart(formatPlayerTime(currentTime))
                }
              >
                Use current
              </button>
            </label>
            <label>
              End time
              <input
                value={submitSkipEnd}
                inputMode="numeric"
                placeholder="1:30"
                onChange={(event) => setSubmitSkipEnd(event.target.value)}
              />
              <button
                type="button"
                onClick={() => setSubmitSkipEnd(formatPlayerTime(currentTime))}
              >
                Use current
              </button>
            </label>
          </div>
          {submitSkipError && <p role="alert">{submitSkipError}</p>}
          <button
            type="button"
            className="primary"
            disabled={submitSkipBusy}
            onClick={() => {
              const episode = playback.episode;
              if (!episode) return;
              const start = parseSegmentTime(submitSkipStart);
              const end = parseSegmentTime(submitSkipEnd);
              const key = readIntroDbApiKey();
              if (!key) {
                setSubmitSkipError(
                  "Add and verify an IntroDB API key in Player settings first.",
                );
                return;
              }
              if (
                !Number.isFinite(start) ||
                !Number.isFinite(end) ||
                end <= start
              ) {
                setSubmitSkipError(
                  "Enter a valid end time after the start time.",
                );
                return;
              }
              setSubmitSkipBusy(true);
              setSubmitSkipError("");
              void submitIntroDbSegment(
                playback.item.id,
                episode.season,
                episode.episode,
                start,
                end,
                submitSkipType,
                key,
              )
                .then((saved) => {
                  if (!saved)
                    throw new Error("IntroDB rejected this timing submission.");
                  setSkipSegments((current) => [
                    ...current.filter(
                      (segment) => segment.type !== submitSkipType,
                    ),
                    {
                      startTime: start,
                      endTime: end,
                      type: submitSkipType,
                      provider: "introdb",
                    },
                  ]);
                  setSubmitSkipOpen(false);
                  setNotice("IntroDB timing submitted.");
                })
                .catch((error) =>
                  setSubmitSkipError(
                    error instanceof Error
                      ? error.message
                      : "Could not submit this timing.",
                  ),
                )
                .finally(() => setSubmitSkipBusy(false));
            }}
          >
            {submitSkipBusy ? "Submitting…" : "Submit timing"}
          </button>
        </div>
      )}
      {party && (
        <div className="party-status" role="status">
          <div>
            <strong>Watch Together</strong>
            <span>
              {party.host
                ? "Host · You control this room"
                : "Guest · Following the host"}{" "}
              · {party.participants} watching
            </span>
            <div className="party-members" aria-label="People in this room">
              {(party.members ?? []).map((member, index) => (
                <span
                  key={member.key || `${member.name}-${index}`}
                  title={member.name}
                >
                  {member.avatar ? (
                    <img
                      src={member.avatar}
                      alt=""
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <b>{member.name.slice(0, 1).toUpperCase()}</b>
                  )}
                  {member.name}
                  {member.host ? " · Host" : ""}
                  {party.host && !member.host && !member.self && (
                    <button
                      type="button"
                      aria-label={`Remove ${member.name} from room`}
                      onClick={() => void removeMember(member.key)}
                    >
                      <X size={12} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
          <div className="party-actions">
            <button type="button" onClick={() => void copyPartyLink()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? "Copied" : "Copy invite"}
            </button>
            {party.host && (
              <button type="button" onClick={() => void stopParty()}>
                End room
              </button>
            )}
          </div>
        </div>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setRetry((v) => v + 1)}>Retry playback</button>
        </div>
      )}
      {notice && (
        <p role="status" className="muted">
          {notice}
        </p>
      )}
      {nextError && (
        <p role="alert" className="error">
          {nextError}
        </p>
      )}
      <div
        id="player-options"
        className={`player-tools${playerToolsOpen ? " tools-open" : ""}`}
        role="dialog"
        aria-label="Playback options"
        aria-hidden={!tvMode && !playerToolsOpen}
      >
        {!tvMode && (
          <div className="player-tools-header">
            <div>
              <strong>Playback options</strong>
              <small>Stream, subtitles, sharing, and display</small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Close playback options"
              onClick={() => setPlayerToolsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {nextEpisode && !party && (
          <>
            <span className="player-tools-section-label">Up next</span>
            <button
              type="button"
              disabled={nextBusy}
              onClick={() => void advanceNextEpisode()}
            >
              <FastForward size={18} />
              {nextBusy
                ? "Finding next episode…"
                : `Play next: S${nextEpisode.season} E${nextEpisode.episode}`}
            </button>
            <NextEpisodeSetting compact />
          </>
        )}
        {onChooseSource && (
          <span className="player-tools-section-label">Source</span>
        )}
        {onChooseSource && (
          <button type="button" onClick={onChooseSource}>
            <Settings2 size={18} /> Choose stream
          </button>
        )}
        {experienceSettings.introSubmitEnabled && playback.episode && (
          <button
            type="button"
            onClick={() => {
              setSubmitSkipType("intro");
              setSubmitSkipStart(formatPlayerTime(currentTime));
              setSubmitSkipEnd(formatPlayerTime(currentTime + 90));
              setSubmitSkipError("");
              setSubmitSkipOpen(true);
            }}
          >
            <FastForward size={18} /> Submit skip timing
          </button>
        )}
        {playback.item.type !== "live" && !party && (
          <button disabled={partyBusy} onClick={() => void startParty()}>
            <Link size={18} />
            {partyBusy ? "Starting room…" : "Watch Together"}
          </button>
        )}
        {!tvMode && <span className="player-tools-section-label">Display</span>}
        {!tvMode && (
          <button onClick={airplay}>
            <Airplay size={18} /> AirPlay
          </button>
        )}
        {!tvMode && (
          <button onClick={pip}>
            <PictureInPicture2 size={18} /> Picture in Picture
          </button>
        )}
        {!tvMode && (
          <button onClick={fullscreen}>
            <Maximize size={18} /> Fullscreen
          </button>
        )}
        {playback.item.type !== "live" && (
          <span className="player-tools-section-label">Playback</span>
        )}
        {playback.item.type !== "live" && (
          <select
            aria-label="Playback speed"
            value={playbackRate}
            onChange={(event) => {
              const value = Number(event.target.value);
              setPlaybackRate(value);
              if (experienceSettings.rememberPlayerChoices)
                localStorage.setItem("tiktak:playback-rate", String(value));
              else localStorage.removeItem("tiktak:playback-rate");
              if (videoRef.current) videoRef.current.playbackRate = value;
            }}
          >
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        )}
        {quality.length > 0 && (
          <select
            aria-label="Video quality"
            onChange={(e) => {
              if (hlsRef.current)
                hlsRef.current.currentLevel = Number(e.target.value);
            }}
          >
            <option value="-1">Auto quality</option>
            {quality.map((q) => (
              <option key={q.value} value={q.value}>
                {q.label}
              </option>
            ))}
          </select>
        )}
        {audioTracks.length > 1 && (
          <select
            aria-label="Audio language"
            onChange={(e) => {
              const selected = audioTracks[Number(e.target.value)];
              if (!selected) return;
              if (selected.source === "hls" && hlsRef.current) {
                hlsRef.current.audioTrack = selected.value;
                localStorage.setItem("tiktak:audio-language", selected.label);
                return;
              }
              const nativeTracks = (
                videoRef.current as HTMLVideoElement & {
                  audioTracks?: {
                    length: number;
                    [index: number]: { enabled: boolean };
                  };
                }
              )?.audioTracks;
              if (nativeTracks)
                for (let i = 0; i < nativeTracks.length; i += 1)
                  nativeTracks[i].enabled = i === selected.value;
              localStorage.setItem("tiktak:audio-language", selected.label);
            }}
          >
            {audioTracks.map((track, index) => (
              <option key={`${track.source}-${track.value}`} value={index}>
                {track.label}
              </option>
            ))}
          </select>
        )}
        {(visibleExternalSubtitles.length > 0 ||
          visibleEmbeddedSubtitles.length > 0) && (
          <span className="player-tools-section-label">Subtitles</span>
        )}
        {(visibleExternalSubtitles.length > 0 ||
          visibleEmbeddedSubtitles.length > 0) && (
          <select
            aria-label="Subtitle language"
            value={selectedSubtitleTrack}
            onChange={(event) => selectSubtitleTrack(event.target.value)}
          >
            <option value="auto">Subtitles · Auto</option>
            <option value="off">Subtitles · Off</option>
            {visibleEmbeddedSubtitles.map(({ subtitle, index }) => (
              <option key={subtitle.key} value={`embedded:${index}`}>
                Built-in · {subtitle.label}
              </option>
            ))}
            {visibleExternalSubtitles.map(({ subtitle, index }) => (
              <option key={subtitle.url} value={`external:${index}`}>
                {subtitle.source === "stream"
                  ? "Source"
                  : subtitle.source === "local"
                    ? "Local"
                    : "Add-on"}{" "}
                · {subtitle.name}
              </option>
            ))}
          </select>
        )}
        {(visibleExternalSubtitles.length > 0 ||
          visibleEmbeddedSubtitles.length > 0) &&
          selectedSubtitleTrack !== "off" && (
            <div className="subtitle-sync" aria-label="Subtitle timing">
              <select
                aria-label="Subtitle timing increment"
                value={subtitleIncrement}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setSubtitleIncrement(value);
                  localStorage.setItem(
                    "tiktak:subtitle-increment",
                    String(value),
                  );
                }}
              >
                {[0.5, 1, 2].map((increment) => (
                  <option key={increment} value={increment}>
                    {increment}s steps
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label="Show subtitles earlier"
                onClick={() =>
                  changeSubtitleOffset(subtitleOffset - subtitleIncrement)
                }
              >
                Earlier
              </button>
              <button
                type="button"
                aria-label="Reset subtitle timing"
                title="Reset subtitle timing"
                onClick={() => changeSubtitleOffset(0)}
              >
                {subtitleOffset > 0 ? "+" : ""}
                {subtitleOffset.toFixed(1)}s
              </button>
              <button
                type="button"
                aria-label="Show subtitles later"
                onClick={() =>
                  changeSubtitleOffset(subtitleOffset + subtitleIncrement)
                }
              >
                Later
              </button>
              <span className="subtitle-auto-sync">
                <button
                  type="button"
                  className={
                    subtitleSyncCapturedAt != null ? "selected" : undefined
                  }
                  aria-label="Capture dialogue for subtitle sync"
                  onClick={captureSubtitleSync}
                >
                  {subtitleSyncCapturedAt != null
                    ? "Dialogue captured"
                    : "Sync from dialogue"}
                </button>
              </span>
            </div>
          )}
        <label className="button file-button">
          Load subtitles
          <input
            type="file"
            accept=".vtt,.srt,.ass,.ssa,.ttml,.dfxp,.xml,text/vtt,application/x-subrip"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2_000_000) {
                setNotice("Choose a WebVTT file smaller than 2 MB.");
                return;
              }
              const rawText = await file.text();
              if (!rawText.trim().startsWith("WEBVTT")) {
                setNotice("Choose a WebVTT (.vtt) subtitle file.");
                return;
              }
              const text = subtitleToWebVtt(rawText, file.name);
              for (const s of subtitles) URL.revokeObjectURL(s.url);
              setSubtitles([
                {
                  url: URL.createObjectURL(
                    new Blob([shiftWebVtt(text, subtitleOffsetRef.current)], {
                      type: "text/vtt",
                    }),
                  ),
                  name: file.name,
                  sourceText: text,
                  sourceUrl: file.name,
                  language: "und",
                  source: "local",
                },
              ]);
            }}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            const report = {
              at: new Date().toISOString(),
              title: playback.item.name,
              mediaType: playback.item.type,
              episode: playback.episode
                ? `S${playback.episode.season}E${playback.episode.episode}`
                : undefined,
              mode: playback.mode ?? "direct",
              hls: !!playback.hls,
              browser: navigator.userAgent,
              error: error || notice || "User reported playback trouble",
            };
            const reports = JSON.parse(
              localStorage.getItem("tiktak:playback-reports") || "[]",
            ) as unknown[];
            localStorage.setItem(
              "tiktak:playback-reports",
              JSON.stringify([report, ...reports].slice(0, 20)),
            );
            setNotice(
              "Playback report saved without the stream URL or credentials.",
            );
          }}
        >
          Report playback issue
        </button>
      </div>
      {subtitleSyncCapturedAt != null && (
        <section
          className="subtitle-cue-overlay"
          role="dialog"
          aria-label="Choose the matching subtitle line"
        >
          <header>
            <div>
              <strong>Select the matching subtitle line</strong>
              <small>
                Browse 15 minutes either side, or search the whole subtitle file
              </small>
            </div>
            <button
              type="button"
              className="icon-button"
              aria-label="Cancel subtitle sync"
              onClick={() => closeSubtitleSync()}
            >
              <X size={18} />
            </button>
          </header>
          <form
            className="subtitle-cue-search-row"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              const first =
                event.currentTarget.parentElement?.querySelector<HTMLElement>(
                  ".subtitle-cue-list button",
                );
              subtitleSyncSearchRef.current?.blur();
              first?.focus({ preventScroll: true });
              first?.scrollIntoView({ block: "nearest" });
            }}
          >
            <input
              ref={subtitleSyncSearchRef}
              className="subtitle-cue-search"
              type="search"
              enterKeyHint="search"
              aria-label="Search subtitle dialogue"
              placeholder="Search words you just heard"
              value={subtitleSyncQuery}
              onChange={(event) => setSubtitleSyncQuery(event.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <div className="subtitle-cue-list">
            {visibleSubtitleSyncCues.length ? (
              visibleSubtitleSyncCues.map((cue) => (
                <button
                  type="button"
                  key={`${cue.startTime}-${cue.text}`}
                  onClick={() => applySubtitleSyncCue(cue)}
                >
                  <time>{formatPlayerTime(cue.startTime)}</time>
                  <span>{cue.text}</span>
                </button>
              ))
            ) : (
              <p className="subtitle-cue-empty">
                No subtitle lines match that search.
              </p>
            )}
          </div>
        </section>
      )}
    </dialog>
  );
}

export default function Player({
  playback,
  onClose,
  partyIdentity,
  traktProfileName,
  nextEpisode,
  onNextEpisode,
}: {
  playback: Playback;
  onClose: () => void;
  partyIdentity: PartyIdentity;
  traktProfileName: string;
  nextEpisode?: Episode | null;
  onNextEpisode?: () => Promise<void>;
}) {
  const experienceSettings = readNuvioWebSettings();
  const badgePlacement = streamPreferences().streamBadgePlacement;
  // Keep window state inside the player. Lifting this into App made every
  // minimize/restore rerender the complete guide or Sports tree, which can
  // contain thousands of provider channels and events.
  const [minimized, setMinimized] = useState(false);
  const [ready, setReady] = useState<Playback | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [prepareRetry, setPrepareRetry] = useState(0);
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [switchingSource, setSwitchingSource] = useState("");
  const [sourceSwitchError, setSourceSwitchError] = useState("");
  const [pinnedSources, setPinnedSources] = useState(
    () => streamPreferences().pinnedSources,
  );
  const playbackMetricId = useRef(
    crypto.randomUUID().replaceAll("-", ""),
  ).current;
  const sourcePickerRef = useRef<HTMLDialogElement>(null);
  const fallbackStarted = useRef(false);
  const fallbackController = useRef<AbortController | null>(null);
  const readyRef = useRef<Playback | null>(null);
  const activeAttemptRef = useRef(0);
  const activePreparedUrlRef = useRef("");
  const pendingReplaceUrlRef = useRef("");
  const [alternatives, setAlternatives] = useState<Playback[]>(
    playback.alternatives ?? [],
  );
  const [alternativesLoading, setAlternativesLoading] = useState(
    !!playback.alternativesRequest,
  );
  useEffect(() => {
    let cancelled = false;
    setAlternatives(playback.alternatives ?? []);
    setAlternativesLoading(!!playback.alternativesRequest);
    if (playback.alternativesRequest)
      void playback.alternativesRequest
        .then((loaded) => {
          // Keep every already-visible choice at the same index. Replacing the
          // array after a slower add-on completed could silently change the
          // selected numeric index and start a completely different source.
          if (!cancelled)
            setAlternatives((current) =>
              mergePlaybackAlternatives(current, loaded),
            );
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setAlternativesLoading(false);
        });
    return () => {
      cancelled = true;
    };
  }, [
    playback.item.id,
    playback.episode?.id,
    playback.url,
    playback.alternativesRequest,
  ]);
  const selected = attempt === 0 ? playback : alternatives[attempt - 1];
  const automaticFallbackEnd = Math.min(
    playback.automaticFallbackCount ?? alternatives.length,
    alternatives.length,
  );
  const sourceChoices = [playback, ...alternatives];
  const sourceGroups = sourceChoices.reduce<
    { name: string; choices: { choice: Playback; index: number }[] }[]
  >((groups, choice, index) => {
    const name = choice.sourceAddonName?.trim() || "Other sources";
    let group = groups.find((entry) => entry.name === name);
    if (!group) {
      group = { name, choices: [] };
      groups.push(group);
    }
    group.choices.push({ choice, index });
    return groups;
  }, []);
  if (experienceSettings.streamSourcePinning && pinnedSources.length) {
    const rank = new Map(
      pinnedSources.map((source, index) => [source.id, index]),
    );
    sourceGroups.sort(
      (left, right) =>
        (rank.get(left.choices[0]?.choice.sourceAddonId ?? "") ??
          Number.MAX_SAFE_INTEGER) -
        (rank.get(right.choices[0]?.choice.sourceAddonId ?? "") ??
          Number.MAX_SAFE_INTEGER),
    );
  }
  const togglePinnedSource = (group: (typeof sourceGroups)[number]) => {
    const id = group.choices[0]?.choice.sourceAddonId;
    if (!id) return;
    const current = streamPreferences();
    const isPinned = current.pinnedSources.some((source) => source.id === id);
    const pinnedSources = isPinned
      ? current.pinnedSources.filter((source) => source.id !== id)
      : [...current.pinnedSources, { id, name: group.name }];
    const saved = saveStreamPreferences({
      ...current,
      pinnedSources,
      updatedAt: Date.now(),
    });
    setPinnedSources(saved.pinnedSources);
  };
  useEffect(() => {
    reportMediaActivity(playbackMetricId, {
      active: false,
      event: "opened",
    });
    return () => {
      fallbackController.current?.abort();
      void cancelPlaybackSession(playbackMetricId);
      reportMediaActivity(playbackMetricId, {
        active: false,
        event: "closed",
      });
    };
  }, [playbackMetricId]);
  useEffect(() => {
    setAttempt(0);
    setPrepareRetry(0);
    setMinimized(false);
    setSourcePickerOpen(false);
    setSwitchingSource("");
    setSourceSwitchError("");
    activeAttemptRef.current = 0;
  }, [playback.item.id, playback.episode?.id]);
  useEffect(() => {
    const dialog = sourcePickerRef.current;
    if (!dialog) return;
    if (sourcePickerOpen && !dialog.open) dialog.showModal();
    else if (!sourcePickerOpen && dialog.open) dialog.close();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [sourcePickerOpen, ready, error]);
  useEffect(() => {
    readyRef.current = ready;
  }, [ready]);
  useEffect(() => {
    const c = new AbortController();
    setError("");
    fallbackStarted.current = false;
    const cleanup = () => {
      c.abort();
      fallbackController.current?.abort();
      fallbackController.current = null;
    };
    if (selected.prepared) {
      if (/\/media\/[A-Za-z0-9_-]{32}\//.test(selected.url))
        activePreparedUrlRef.current = selected.url;
      setReady(selected);
      activeAttemptRef.current = attempt;
      setSwitchingSource("");
      return cleanup;
    }
    const effectiveMode = selected.mode ?? getService()?.mode ?? "direct";
    const conversionStart =
      selected.item.type !== "live" &&
      (effectiveMode === "remux" || effectiveMode === "transcode")
        ? Math.max(0, selected.resume ?? 0)
        : 0;
    const replaceUrl =
      pendingReplaceUrlRef.current || activePreparedUrlRef.current;
    pendingReplaceUrlRef.current = "";
    void prepareMedia(
      selected.url,
      selected.requestHeaders,
      c.signal,
      selected.mode,
      selected.mode === "transcode"
        ? liveAudioCodec(navigator.userAgent)
        : undefined,
      selected.item.type === "live",
      selected.relay,
      conversionStart,
      replaceUrl,
      playbackMetricId,
    ).then(
      (url) => {
        if (!c.signal.aborted) {
          if (/\/media\/[A-Za-z0-9_-]{32}\//.test(url))
            activePreparedUrlRef.current = url;
          activeAttemptRef.current = attempt;
          setSwitchingSource("");
          setSourceSwitchError("");
          setReady({
            ...selected,
            url,
            mediaOffset: conversionStart,
            resume: conversionStart ? undefined : selected.resume,
            hls:
              !/\.webm(?:[?#]|$)/i.test(url) &&
              (selected.hls ||
                selected.mode === "remux" ||
                selected.mode === "transcode" ||
                getService()?.mode === "remux" ||
                getService()?.mode === "transcode" ||
                /\.m3u8(?:[?#]|$)/i.test(selected.url)),
          });
        }
      },
      (e) => {
        if (!c.signal.aborted) {
          if (selected.cacheKey) removeStreamLink(selected.cacheKey);
          if (readyRef.current && attempt !== activeAttemptRef.current) {
            setAttempt(activeAttemptRef.current);
            setSwitchingSource("");
            setSourceSwitchError(e.message);
            setSourcePickerOpen(true);
          } else if (attempt < automaticFallbackEnd)
            setAttempt((value) => value + 1);
          else setError(e.message);
        }
      },
    );
    return cleanup;
  }, [selected, attempt, prepareRetry]);
  const tryNextSource = () => {
    if (attempt >= automaticFallbackEnd) return false;
    setReady(null);
    setError("");
    setSwitchingSource("");
    setSourceSwitchError("");
    setAttempt((value) => value + 1);
    return true;
  };
  const recoverWithCompatibility = () => {
    // Keep the chooser stable while the user is deciding. A media error may be
    // shown behind it, but automatic fallback must not steal focus or replace
    // the list under a remote/touch selection.
    if (sourcePickerOpen) return false;
    if (selected.cacheKey) removeStreamLink(selected.cacheKey);
    const service = getService();
    if (
      fallbackStarted.current ||
      !service ||
      !(selected.compatibilityFallback || selected.relay) ||
      selected.item.type === "live" ||
      selected.url.startsWith(`${service.url}/media/`)
    )
      return tryNextSource();
    fallbackStarted.current = true;
    setReady(null);
    setError("");
    setSwitchingSource("");
    const controller = new AbortController();
    fallbackController.current = controller;
    void prepareMedia(
      selected.url,
      selected.requestHeaders,
      controller.signal,
      "transcode",
      liveAudioCodec(navigator.userAgent),
      false,
      true,
      Math.max(0, selected.resume ?? 0),
      ready?.url || activePreparedUrlRef.current,
      playbackMetricId,
    ).then(
      (url) => {
        if (!controller.signal.aborted) {
          if (/\/media\/[A-Za-z0-9_-]{32}\//.test(url))
            activePreparedUrlRef.current = url;
          setReady({
            ...selected,
            url,
            hls: !/\.webm(?:[?#]|$)/i.test(url),
            mode: "transcode",
            mediaOffset: Math.max(0, selected.resume ?? 0),
            resume: undefined,
            prepared: true,
          });
        }
      },
      (reason) => {
        if (!controller.signal.aborted && !tryNextSource())
          setError(
            reason instanceof Error
              ? reason.message
              : "This source could not be converted for this browser.",
          );
      },
    );
    return true;
  };
  const seekConversion = (seconds: number) => {
    const mode = ready?.mode ?? selected.mode ?? getService()?.mode;
    if (mode !== "remux" && mode !== "transcode") return;
    fallbackController.current?.abort();
    const controller = new AbortController();
    fallbackController.current = controller;
    setError("");
    void prepareMedia(
      selected.url,
      selected.requestHeaders,
      controller.signal,
      mode,
      mode === "transcode" ? liveAudioCodec(navigator.userAgent) : undefined,
      false,
      true,
      seconds,
      ready?.url,
      playbackMetricId,
    ).then(
      (url) => {
        if (!controller.signal.aborted) {
          if (/\/media\/[A-Za-z0-9_-]{32}\//.test(url))
            activePreparedUrlRef.current = url;
          setReady({
            ...selected,
            url,
            hls: true,
            mode,
            mediaOffset: seconds,
            resume: undefined,
            prepared: true,
          });
        }
      },
      (reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not seek to that position.",
          );
      },
    );
  };
  const selectSource = (index: number) => {
    setSourcePickerOpen(false);
    if (index === attempt) return;
    const choice = sourceChoices[index];
    const currentPreparedUrl = ready?.url || activePreparedUrlRef.current;
    if (/\/media\/[A-Za-z0-9_-]{32}\//.test(currentPreparedUrl))
      pendingReplaceUrlRef.current = currentPreparedUrl;
    const nextMode = choice?.mode ?? getService()?.mode ?? "direct";
    if (
      nextMode === "direct" &&
      !choice?.relay &&
      !Object.keys(choice?.requestHeaders ?? {}).length
    ) {
      void cancelPlaybackSession(playbackMetricId);
      activePreparedUrlRef.current = "";
      pendingReplaceUrlRef.current = "";
    }
    if (experienceSettings.streamSourcePinning && choice?.sourceLabel)
      localStorage.setItem(
        `tiktak:pinned-source:${playback.item.id}:${playback.episode?.id ?? playback.item.id}`,
        choice.sourceLabel,
      );
    setError("");
    setSourceSwitchError("");
    setSwitchingSource(choice?.sourceLabel ?? `Stream ${index + 1}`);
    setAttempt(index);
  };
  const sourcePicker = sourcePickerOpen ? (
    <dialog
      ref={sourcePickerRef}
      className="player-source-picker"
      aria-label="Choose a stream"
      onCancel={(event) => {
        event.preventDefault();
        setSourcePickerOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" || event.key === "BrowserBack") {
          event.preventDefault();
          event.stopPropagation();
          setSourcePickerOpen(false);
        }
      }}
    >
      <section>
        <div className="player-source-picker-heading">
          <div>
            <span>Playback source</span>
            <h2>Choose a stream</h2>
            <p>
              Startup fallbacks stop once playback begins. The selected source
              stays locked unless you choose another one here.
            </p>
            <p className="player-source-status" aria-live="polite">
              {alternativesLoading
                ? `Loading every add-on in the background… ${sourceChoices.length} source${sourceChoices.length === 1 ? "" : "s"} so far.`
                : `${sourceChoices.length} source${sourceChoices.length === 1 ? "" : "s"} loaded from completed add-ons.`}
            </p>
            {sourceSwitchError && (
              <p className="player-source-error" role="alert">
                {sourceSwitchError}
              </p>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close stream chooser"
            onClick={() => setSourcePickerOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="player-source-list">
          {sourceGroups.map((group) => (
            <section className="player-source-group" key={group.name}>
              <header>
                <strong>{group.name}</strong>
                <div>
                  <span>{group.choices.length}</span>
                  {experienceSettings.streamSourcePinning &&
                    group.choices[0]?.choice.sourceAddonId && (
                      <button
                        type="button"
                        className={
                          pinnedSources.some(
                            (source) =>
                              source.id ===
                              group.choices[0]?.choice.sourceAddonId,
                          )
                            ? "active"
                            : undefined
                        }
                        aria-label={`${
                          pinnedSources.some(
                            (source) =>
                              source.id ===
                              group.choices[0]?.choice.sourceAddonId,
                          )
                            ? "Unpin"
                            : "Pin"
                        } ${group.name}`}
                        onClick={() => togglePinnedSource(group)}
                      >
                        <Pin size={14} />
                      </button>
                    )}
                </div>
              </header>
              {group.choices.map(({ choice, index }) => (
                <button
                  type="button"
                  key={`${choice.sourceLabel ?? "stream"}-${index}`}
                  className={index === attempt ? "active" : ""}
                  aria-pressed={index === attempt}
                  onClick={() => selectSource(index)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    selectSource(index);
                  }}
                >
                  <span>
                    <strong>
                      {choice.sourceLabel ?? `Stream ${index + 1}`}
                    </strong>
                    {badgePlacement === "top" &&
                      !!choice.sourceBadges?.length && (
                        <span className="player-source-badges">
                          {choice.sourceBadges.map((badge) => (
                            <i key={badge}>{badge}</i>
                          ))}
                        </span>
                      )}
                    <small>
                      {choice.sourceDetail ?? "Stream details not reported"}
                    </small>
                    {badgePlacement === "bottom" &&
                      !!choice.sourceBadges?.length && (
                        <span className="player-source-badges">
                          {choice.sourceBadges.map((badge) => (
                            <i key={badge}>{badge}</i>
                          ))}
                        </span>
                      )}
                  </span>
                  {index === attempt ? <Check size={18} /> : <Play size={18} />}
                </button>
              ))}
            </section>
          ))}
        </div>
      </section>
    </dialog>
  ) : null;
  if (ready)
    return (
      <>
        <VideoPlayer
          playback={ready}
          playbackMetricId={playbackMetricId}
          onClose={onClose}
          minimized={minimized}
          onMinimize={setMinimized}
          onFailure={recoverWithCompatibility}
          onChooseSource={
            sourceChoices.length > 1
              ? () => setSourcePickerOpen(true)
              : undefined
          }
          partyIdentity={partyIdentity}
          traktProfileName={traktProfileName}
          onSeek={seekConversion}
          nextEpisode={nextEpisode}
          onNextEpisode={onNextEpisode}
        />
        {switchingSource && (
          <div className="player-source-handoff" role="status">
            <span className="spinner" />
            <span>
              Switching to <strong>{switchingSource}</strong>
            </span>
          </div>
        )}
        {sourcePicker}
      </>
    );
  return (
    <>
      <dialog
        open
        className={`player-dialog player-preparing mobile-opening-player${experienceSettings.showLoadingOverlay ? "" : " minimal-opening-player"}`}
        aria-label="Preparing playback"
        style={
          safeUrl(selected.item.background)
            ? {
                backgroundImage: `url("${safeUrl(selected.item.background)}")`,
              }
            : undefined
        }
      >
        <div className="player-opening-shade" />
        <button
          type="button"
          className="icon-button player-opening-close"
          aria-label="Dismiss player"
          onClick={onClose}
        >
          <X />
        </button>
        <section className="player-opening-content">
          {!error && <span className="spinner" />}
          <span className="eyebrow">
            {error ? "PLAYBACK NEEDS ATTENTION" : "NOW PLAYING"}
          </span>
          <h2>{error ? "Could not start playback" : selected.item.name}</h2>
          <p role={error ? "alert" : "status"}>{error || "Starting video…"}</p>
          <div className="player-opening-actions">
            {error && (
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setError("");
                  setReady(null);
                  fallbackStarted.current = false;
                  setPrepareRetry((value) => value + 1);
                }}
              >
                Try again
              </button>
            )}
            {sourceChoices.length > 1 && (
              <button type="button" onClick={() => setSourcePickerOpen(true)}>
                Choose another source
              </button>
            )}
            <button type="button" onClick={onClose}>
              {error ? "Close player" : "Cancel"}
            </button>
          </div>
        </section>
      </dialog>
      {sourcePicker}
    </>
  );
}
