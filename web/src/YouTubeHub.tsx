import {
  FastForward,
  History,
  ExternalLink,
  LogIn,
  LogOut,
  Maximize,
  Music2,
  Pause,
  Play,
  Rewind,
  Search,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from "lucide-react";
import Hls from "hls.js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  parseYouTubeSelection,
  disconnectYouTube,
  pollYouTubeDeviceSignIn,
  resolveYouTubePlaylist,
  resolveYouTubePlayback,
  searchYouTube,
  sponsorSegments,
  startYouTubeDeviceSignIn,
  youtubeAccount,
  type SponsorSegment,
  type YouTubeAccount,
  type YouTubeKind,
  type YouTubePlayback,
  type YouTubeSelection,
} from "./youtube";
import SponsorBlockSettings from "./SponsorBlockSettings";
import YouTubeAutoplaySetting from "./YouTubeAutoplaySetting";
import {
  readSponsorBlockPreferences,
  subscribeSponsorBlockPreferences,
} from "./sponsorblock";
import {
  readYouTubeAutoplayPreferences,
  subscribeYouTubeAutoplayPreferences,
} from "./youtube-autoplay";
import {
  readYouTubeHistory,
  youtubeHistoryKey,
  type YouTubePlaybackProgress,
  type YouTubeResumeRequest,
  youtubeVideoIdFromItem,
} from "./youtube-progress";
import { read } from "./storage";
import type { Progress } from "./types";

type Player = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getIframe(): HTMLIFrameElement;
  getPlayerState(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  isMuted(): boolean;
  mute(): void;
  nextVideo?(): void;
  pauseVideo(): void;
  playVideo(): void;
  seekTo(seconds: number, allowSeekAhead?: boolean): void;
  unMute(): void;
};

type PlayerConstructor = new (
  target: HTMLElement,
  options: Record<string, unknown>,
) => Player;

declare global {
  interface Window {
    YT?: {
      Player: PlayerConstructor;
      PlayerState: { ENDED: number; PLAYING: number };
    };
    onYouTubeIframeAPIReady?: () => void;
    __tiktakYouTubeApi?: Promise<void>;
    TikTakTV?: {
      appReady?: () => void;
      openSmartTube(videoId: string): void;
    };
  }
}

function loadPlayerApi() {
  if (window.YT?.Player) return Promise.resolve();
  if (window.__tiktakYouTubeApi) return window.__tiktakYouTubeApi;
  window.__tiktakYouTubeApi = new Promise<void>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () =>
      reject(new Error("YouTube's player could not load."));
    document.head.append(script);
  });
  return window.__tiktakYouTubeApi;
}

export default function YouTubeHub({
  resumeRequest,
  onResumeConsumed,
  onProgress,
}: {
  resumeRequest?: YouTubeResumeRequest | null;
  onResumeConsumed?: () => void;
  onProgress?: (progress: YouTubePlaybackProgress) => void;
}) {
  const tvMode =
    document.documentElement.classList.contains("tv-mode") ||
    new URLSearchParams(location.search).get("tv") === "1" ||
    /TikTakTV-AndroidTV/i.test(navigator.userAgent);
  const [kind, setKind] = useState<YouTubeKind>("video");
  const [query, setQuery] = useState("");
  const [interestInput, setInterestInput] = useState(() =>
    localStorage.getItem("tiktak:youtube-interests") ?? "",
  );
  const [results, setResults] = useState<YouTubeSelection[]>([]);
  const [selection, setSelection] = useState<YouTubeSelection | null>(null);
  const [history, setHistory] = useState(readYouTubeHistory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tvControlsVisible, setTvControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState<YouTubeAccount | null>(null);
  const [accountBusy, setAccountBusy] = useState(true);
  const [visibleFeedCount, setVisibleFeedCount] = useState(24);
  const [section, setSection] = useState<"forYou" | "playlists" | "subscriptions" | "history">("forYou");
  const [device, setDevice] = useState<{
    userCode: string;
    verificationUrl: string;
    interval: number;
  } | null>(null);
  const [sponsorPreferences, setSponsorPreferences] = useState(
    readSponsorBlockPreferences,
  );
  const [embedError, setEmbedError] = useState<number | null>(null);
  const [directPlayback, setDirectPlayback] = useState<YouTubePlayback | null>(
    null,
  );
  const [autoplayPreferences, setAutoplayPreferences] = useState(
    readYouTubeAutoplayPreferences,
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const directMediaRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const tvControlsTimerRef = useRef<number>(0);
  const playingRef = useRef(false);
  const segmentsRef = useRef<SponsorSegment[]>([]);
  const segmentVideoRef = useRef("");
  const failedMusicRef = useRef(new Set<string>());
  const playbackCandidatesRef = useRef<YouTubeSelection[]>([]);
  const autoplayEnabledRef = useRef(autoplayPreferences.enabled);
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const saveProgressRef = useRef<() => void>(() => {});
  const endedAdvanceRef = useRef(false);
  const resumeTargetRef = useRef<{
    videoId: string;
    seconds: number;
    embedApplied: boolean;
    directApplied: boolean;
  } | null>(null);
  const selectRef = useRef<
    (
      next: YouTubeSelection,
      recovering?: boolean,
      resumeSeconds?: number,
    ) => Promise<void>
  >(async () => {});
  const resultsRef = useRef<HTMLElement>(null);
  const [resultsTitle, setResultsTitle] = useState("Search results");
  const smartTubeAvailable = tvMode && !!window.TikTakTV?.openSmartTube;

  playbackCandidatesRef.current = [
    ...results,
    ...(kind === "music"
      ? (account?.musicFeed ?? [])
      : (account?.videoFeed ?? [])),
  ].filter(
    (item, index, items) =>
      !!item.videoId &&
      items.findIndex((candidate) => candidate.videoId === item.videoId) ===
        index,
  );
  autoplayEnabledRef.current = autoplayPreferences.enabled;

  playingRef.current = playing;
  const revealTvControls = useCallback(() => {
    if (!tvMode) return;
    window.clearTimeout(tvControlsTimerRef.current);
    setTvControlsVisible(true);
    if (!playingRef.current) return;
    tvControlsTimerRef.current = window.setTimeout(() => {
      setTvControlsVisible(false);
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(".youtube-tv-close, .youtube-player-info"))
        active.blur();
    }, 3500);
  }, [tvMode]);

  const loadAccount = async (refresh = false) => {
    setAccountBusy(true);
    try {
      const recentVideoIds = readYouTubeHistory()
        .map((item) => item.videoId)
        .filter((id): id is string => !!id)
        .slice(0, 40);
      const interestTopics = (localStorage.getItem("tiktak:youtube-interests") ?? "")
        .split(",").map((topic) => topic.trim()).filter(Boolean).slice(0, 4);
      setAccount(await youtubeAccount(false, { refresh, recentVideoIds, interestTopics }));
      if (refresh) setVisibleFeedCount(24);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "YouTube sign-in failed.",
      );
    } finally {
      setAccountBusy(false);
    }
  };

  useEffect(() => {
    void loadAccount(false);
  }, []);

  useEffect(() => subscribeSponsorBlockPreferences(setSponsorPreferences), []);
  useEffect(
    () => subscribeYouTubeAutoplayPreferences(setAutoplayPreferences),
    [],
  );

  useEffect(() => {
    if (!device) return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const result = await pollYouTubeDeviceSignIn();
        if (cancelled) return;
        if (result.connected) {
          setDevice(null);
          setNotice("YouTube account connected");
          await loadAccount();
          return;
        }
        timer = window.setTimeout(
          poll,
          (result.interval ?? device.interval) * 1000,
        );
      } catch (reason) {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : "Google sign-in expired.",
          );
      }
    };
    timer = window.setTimeout(poll, device.interval * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [device]);

  const remember = (next: YouTubeSelection) => {
    const tagged = { ...next, kind: next.kind ?? kind };
    const value = [
      tagged,
      ...history.filter(
        (item) =>
          item.videoId !== next.videoId || item.playlistId !== next.playlistId,
      ),
    ].slice(0, 50);
    setHistory(value);
    localStorage.setItem(youtubeHistoryKey, JSON.stringify(value));
  };

  const select = async (
    next: YouTubeSelection,
    recovering = false,
    resumeSeconds = 0,
  ) => {
    resumeTargetRef.current =
      next.videoId && resumeSeconds > 0
        ? {
            videoId: next.videoId,
            seconds: resumeSeconds,
            embedApplied: false,
            directApplied: false,
          }
        : null;
    setError("");
    setEmbedError(null);
    setDirectPlayback(null);
    if (!recovering) failedMusicRef.current.clear();
    try {
      const playable = await resolveYouTubePlaylist({
        ...next,
        kind: next.kind ?? kind,
      });
      setSelection(playable);
      remember(playable);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "This YouTube item could not be opened.",
      );
    }
  };
  selectRef.current = select;

  useEffect(() => {
    if (!resumeRequest) return;
    setKind("video");
    void selectRef.current(
      {
        videoId: resumeRequest.videoId,
        title: resumeRequest.title,
        thumbnail: resumeRequest.thumbnail,
        kind: "video",
      },
      false,
      resumeRequest.seconds,
    );
    onResumeConsumed?.();
  }, [resumeRequest, onResumeConsumed]);

  const switchKind = (next: YouTubeKind) => {
    setKind(next);
    setQuery("");
    setResults([]);
    setResultsTitle("Search results");
    setSelection(null);
    setError("");
    setNotice("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const direct = parseYouTubeSelection(query);
    if (direct) {
      await select(direct);
      return;
    }
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const found = await searchYouTube(query, kind);
      setResults(found);
      setResultsTitle(
        kind === "music" ? "Music search results" : "Video search results",
      );
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ block: "start" }),
      );
      if (!found.length) setError("No embeddable YouTube results were found.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "YouTube search failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const loadSubscription = async (channelId: string, title: string) => {
    setBusy(true);
    setError("");
    setSelection(null);
    try {
      const found = await searchYouTube("", "video", undefined, channelId);
      setResults(found);
      setResultsTitle(`Latest from ${title}`);
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ block: "start" }),
      );
      if (!found.length)
        setError(`No playable videos were found for ${title}.`);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That subscription could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selection || directPlayback || !hostRef.current) return;
    let cancelled = false;
    let player: Player | null = null;
    setReady(false);
    setPlaying(false);
    endedAdvanceRef.current = false;
    void loadPlayerApi()
      .then(() => {
        if (cancelled || !hostRef.current || !window.YT?.Player) return;
        player = new window.YT.Player(hostRef.current, {
          videoId: selection.videoId,
          width: "100%",
          height: "100%",
          playerVars: {
            autoplay: 1,
            controls: tvMode ? 0 : 1,
            playsinline: 1,
            rel: 0,
            origin: location.origin,
            ...(selection.playlistId
              ? { listType: "playlist", list: selection.playlistId }
              : {}),
          },
          events: {
            onReady: (event: { target: Player }) => {
              playerRef.current = event.target;
              event.target.getIframe().tabIndex = -1;
              setReady(true);
              event.target.playVideo();
            },
            onStateChange: (event: { data: number; target: Player }) => {
              const isPlaying = event.data === window.YT?.PlayerState.PLAYING;
              setPlaying(isPlaying);
              const resume = resumeTargetRef.current;
              if (
                isPlaying &&
                resume &&
                !resume.embedApplied &&
                event.target.getVideoData().video_id === resume.videoId
              ) {
                resume.embedApplied = true;
                event.target.seekTo(resume.seconds, true);
              }
              window.dispatchEvent(
                new CustomEvent("tiktak-media-activity", {
                  detail: { active: isPlaying },
                }),
              );
              const data = event.target.getVideoData();
              if (data.video_id && data.video_id !== segmentVideoRef.current) {
                segmentVideoRef.current = data.video_id;
                segmentsRef.current = [];
                void sponsorSegments(data.video_id).then((segments) => {
                  if (segmentVideoRef.current === data.video_id)
                    segmentsRef.current = segments;
                });
              }
              if (
                event.data === window.YT?.PlayerState.ENDED &&
                autoplayEnabledRef.current &&
                !endedAdvanceRef.current
              ) {
                endedAdvanceRef.current = true;
                if (selection.playlistId && event.target.nextVideo) {
                  event.target.nextVideo();
                  endedAdvanceRef.current = false;
                  return;
                }
                const currentIndex = playbackCandidatesRef.current.findIndex(
                  (candidate) => candidate.videoId === selection.videoId,
                );
                const next =
                  currentIndex >= 0
                    ? playbackCandidatesRef.current[currentIndex + 1]
                    : playbackCandidatesRef.current[0];
                if (next) {
                  setNotice(`Up next: ${next.title}`);
                  window.setTimeout(() => {
                    setNotice("");
                    void selectRef.current(next, true);
                  }, 650);
                }
              }
            },
            onError: (event: { data?: number }) => {
              const code = Number(event.data || 0);
              setEmbedError(code);
              const currentId = selection.videoId;
              if (currentId) {
                setNotice("Switching to TikTak direct playback…");
                void resolveYouTubePlayback(currentId, selection.kind ?? kind)
                  .then((playback) => {
                    setError("");
                    setEmbedError(null);
                    setDirectPlayback(playback);
                    setNotice("Playing through TikTak direct playback");
                    window.setTimeout(() => setNotice(""), 2400);
                  })
                  .catch(() => {
                    setNotice("");
                    if (
                      selection.kind === "music" &&
                      currentId &&
                      [100, 101, 150].includes(code)
                    ) {
                      failedMusicRef.current.add(currentId);
                      const next = playbackCandidatesRef.current.find(
                        (candidate) =>
                          candidate.videoId &&
                          !failedMusicRef.current.has(candidate.videoId),
                      );
                      if (next) {
                        setError("");
                        setNotice(
                          "That version is unavailable. Trying the next result…",
                        );
                        window.setTimeout(() => {
                          setNotice("");
                          void selectRef.current(next, true);
                        }, 500);
                        return;
                      }
                    }
                    setError(
                      "This upload cannot play here or through TikTak direct playback. It may be private, paid, age-restricted, deleted, or unavailable in your region.",
                    );
                  });
                return;
              }
              if (
                selection.kind === "music" &&
                currentId &&
                [100, 101, 150].includes(code)
              ) {
                failedMusicRef.current.add(currentId);
                const next = playbackCandidatesRef.current.find(
                  (candidate) =>
                    candidate.videoId &&
                    !failedMusicRef.current.has(candidate.videoId),
                );
                if (next) {
                  setError("");
                  setNotice(
                    "That track blocks embedded playback. Trying the next available version…",
                  );
                  window.setTimeout(() => {
                    setNotice("");
                    void selectRef.current(next, true);
                  }, 500);
                  return;
                }
              }
              setError(
                [100, 101, 150].includes(code)
                  ? "This upload is unavailable in embedded players. You can open it in YouTube instead."
                  : "YouTube could not play this item here. Try another result or open it in YouTube.",
              );
            },
          },
        });
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "YouTube failed."),
      );
    return () => {
      cancelled = true;
      saveProgressRef.current();
      window.dispatchEvent(
        new CustomEvent("tiktak-media-activity", { detail: { active: false } }),
      );
      playerRef.current = null;
      player?.destroy();
    };
  }, [directPlayback, kind, selection, tvMode]);

  useEffect(() => {
    const media = directMediaRef.current;
    if (!media || !directPlayback || !selection) return;
    let hls: Hls | null = null;
    if (
      directPlayback.type === "hls" &&
      !media.canPlayType("application/vnd.apple.mpegurl") &&
      Hls.isSupported()
    ) {
      hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hls.loadSource(directPlayback.url);
      hls.attachMedia(media);
    } else {
      media.src = directPlayback.url;
    }
    const adapter: Player = {
      destroy: () => {},
      getCurrentTime: () => media.currentTime,
      getDuration: () => media.duration,
      getIframe: () => document.createElement("iframe"),
      getPlayerState: () => (media.paused ? 2 : 1),
      getVideoData: () => ({
        video_id: selection.videoId,
        title: selection.title,
        author: selection.channel,
      }),
      isMuted: () => media.muted,
      mute: () => {
        media.muted = true;
      },
      pauseVideo: () => media.pause(),
      playVideo: () => {
        void media.play();
      },
      seekTo: (seconds) => {
        media.currentTime = seconds;
      },
      unMute: () => {
        media.muted = false;
      },
    };
    playerRef.current = adapter;
    setReady(true);
    const applyDirectResume = () => {
      const resume = resumeTargetRef.current;
      if (
        resume &&
        !resume.directApplied &&
        resume.videoId === selection.videoId
      ) {
        resume.directApplied = true;
        media.currentTime = resume.seconds;
      }
    };
    media.addEventListener("loadedmetadata", applyDirectResume);
    if (media.readyState >= 1) applyDirectResume();
    void media.play();
    return () => {
      saveProgressRef.current();
      media.removeEventListener("loadedmetadata", applyDirectResume);
      hls?.destroy();
      media.removeAttribute("src");
      media.load();
      if (playerRef.current === adapter) playerRef.current = null;
    };
  }, [directPlayback, selection]);

  useEffect(() => {
    if (!tvMode || !selection) return;
    if (playing) revealTvControls();
    else {
      window.clearTimeout(tvControlsTimerRef.current);
      setTvControlsVisible(true);
    }
    return () => window.clearTimeout(tvControlsTimerRef.current);
  }, [playing, revealTvControls, selection, tvMode]);

  useEffect(() => {
    if (!selection || tvMode) return;
    const frame = requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(".youtube-player-card")
        ?.scrollIntoView({ block: "start", behavior: "smooth" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [selection, tvMode]);

  useEffect(() => {
    if (!selection?.videoId || !ready) return;
    const savePosition = () => {
      const player = playerRef.current;
      if (!player) return;
      const seconds = player.getCurrentTime();
      const duration = player.getDuration();
      if (!Number.isFinite(seconds) || !Number.isFinite(duration) || seconds <= 0 || duration <= 0)
        return;
      const data = player.getVideoData();
      const videoId = data.video_id || selection.videoId;
      if (!videoId) return;
      onProgressRef.current?.({
        videoId,
        seconds,
        duration,
        title: data.title || selection.title,
        thumbnail:
          videoId === selection.videoId ? selection.thumbnail : undefined,
      });
    };
    const timer = window.setInterval(savePosition, 5_000);
    saveProgressRef.current = savePosition;
    return () => {
      window.clearInterval(timer);
      savePosition();
      saveProgressRef.current = () => {};
    };
  }, [ready, selection]);

  useEffect(() => {
    if (!ready || !sponsorPreferences.enabled) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || player.getPlayerState() !== 1) return;
      const time = player.getCurrentTime();
      const segment = segmentsRef.current.find(
        (candidate) =>
          sponsorPreferences.categories.includes(
            candidate.category as (typeof sponsorPreferences.categories)[number],
          ) &&
          time >= candidate.start &&
          time < candidate.end - 0.15,
      );
      if (!segment) return;
      player.seekTo(segment.end, true);
      setNotice(`Skipped ${segment.category.replaceAll("_", " ")}`);
      window.setTimeout(() => setNotice(""), 2400);
    }, 500);
    return () => clearInterval(timer);
  }, [ready, sponsorPreferences]);

  const seek = (offset: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.seekTo(
      Math.max(
        0,
        Math.min(
          player.getDuration() || Infinity,
          player.getCurrentTime() + offset,
        ),
      ),
      true,
    );
  };

  useEffect(() => {
    if (!tvMode || !selection) return;
    const handleKeys = (event: KeyboardEvent) => {
      revealTvControls();
      const active = document.activeElement as HTMLElement | null;
      if (event.key === "Escape" || event.key === "BrowserBack") {
        event.preventDefault();
        setSelection(null);
        return;
      }
      if (
        active?.closest(
          ".youtube-controls, .sponsorblock-settings, .youtube-autoplay-setting",
        )
      )
        return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seek(-10);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        seek(10);
      } else if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (playing) playerRef.current?.pauseVideo();
        else playerRef.current?.playVideo();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        document
          .querySelector<HTMLElement>(
            ".tv-youtube-player .youtube-controls button",
          )
          ?.focus();
      }
    };
    window.addEventListener("keydown", handleKeys, true);
    return () => window.removeEventListener("keydown", handleKeys, true);
  }, [tvMode, selection, playing, revealTvControls]);

  const suggestions = kind === "music" ? account?.musicFeed ?? [] : account?.videoFeed ?? [];
  const forYouSection = (
    <>
      {kind === "video" && !accountBusy && !account?.connected && (
        <section className="youtube-section youtube-for-you">
          <h2>For You</h2>
          <p className="youtube-feed-empty">
            Connect your YouTube account below to see video suggestions here.
          </p>
        </section>
      )}
      {!!account?.connected && (
        <section className="youtube-section youtube-for-you">
          <h2>{kind === "music" ? "Your music" : "For You"}</h2>
          {!suggestions.length ? (
            <p className="youtube-feed-empty">
              No suggestions are available yet. Refresh suggestions or search for a video.
            </p>
          ) : (
            <div className="youtube-grid">
              {suggestions.slice(0, visibleFeedCount).map((item, index) => (
                <button
                  key={`${item.videoId}-${index}`}
                  className="youtube-card"
                  onClick={() => void select(item)}
                >
                  <img src={item.thumbnail} alt="" loading="lazy" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.channel}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="youtube-feed-actions">
            {visibleFeedCount < suggestions.length && (
              <button onClick={() => setVisibleFeedCount((count) => count + 24)}>
                Show more videos
              </button>
            )}
            <button disabled={accountBusy} onClick={() => void loadAccount(true)}>
              {accountBusy ? "Refreshing…" : "Refresh suggestions"}
            </button>
          </div>
        </section>
      )}
    </>
  );
  return (
    <div className="youtube-hub">
      <section className="youtube-heading">
        <div>
          <span className="eyebrow">
            <Youtube size={16} /> WATCH & LISTEN
          </span>
          <h1>{kind === "music" ? "YouTube Music" : "YouTube"}</h1>
          <p>
            Search, paste a video or playlist link, and play it inside TikTak
            TV.
          </p>
        </div>
        <div className="youtube-mode" role="tablist" aria-label="YouTube mode">
          <button
            className={kind === "video" ? "active" : ""}
            onClick={() => switchKind("video")}
            role="tab"
            aria-selected={kind === "video"}
          >
            <Youtube size={18} /> Videos
          </button>
          <button
            className={kind === "music" ? "active" : ""}
            onClick={() => switchKind("music")}
            role="tab"
            aria-selected={kind === "music"}
          >
            <Music2 size={18} /> Music
          </button>
        </div>
      </section>

      {kind === "video" && (
        <nav className="youtube-mode youtube-sections" aria-label="YouTube sections">
          {([
            ["forYou", "For You"],
            ["playlists", "My Playlists"],
            ["subscriptions", "Subscriptions"],
            ["history", "History"],
          ] as const).map(([value, label]) => (
            <button key={value} className={section === value ? "active" : ""}
              aria-current={section === value ? "page" : undefined}
              onClick={() => setSection(value)}>{label}</button>
          ))}
        </nav>
      )}

      <form className="youtube-search" onSubmit={submit}>
        <Search size={20} />
        <input
          aria-label="Search YouTube or paste a link"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            kind === "music"
              ? "Search music or paste a YouTube Music link"
              : "Search YouTube or paste a video / playlist link"
          }
        />
        <button className="primary" disabled={busy}>
          {busy ? "Searching…" : "Search"}
        </button>
      </form>

      {kind === "video" && section === "forYou" && (
        <form className="youtube-interests" onSubmit={(event) => {
          event.preventDefault();
          const topics = interestInput.split(",").map((topic) => topic.trim())
            .filter(Boolean).slice(0, 4).join(", ");
          setInterestInput(topics);
          localStorage.setItem("tiktak:youtube-interests", topics);
          void loadAccount(true);
        }}>
          <label htmlFor="youtube-interests">Show me more about</label>
          <input id="youtube-interests" value={interestInput}
            onChange={(event) => setInterestInput(event.target.value)}
            placeholder="Survival, camping, gaming… (up to 4 topics)" />
          <button type="submit">Update For You</button>
        </form>
      )}

      {(kind === "music" || section === "forYou") && forYouSection}

      <section className="youtube-account-card" aria-label="YouTube account">
        <div>
          <strong>
            {account?.connected
              ? account.channel?.title || "Your YouTube account"
              : "Your YouTube account"}
          </strong>
          <span>
            {accountBusy
              ? "Checking account…"
              : account?.connected
                ? "Subscriptions, playlists and account activity are available here."
                : "Connect once with a phone or computer to bring your account to TikTak TV."}
          </span>
        </div>
        {account?.connected ? (
          <button
            onClick={async () => {
              setAccountBusy(true);
              try {
                await disconnectYouTube();
                setAccount({ configured: true, connected: false });
              } finally {
                setAccountBusy(false);
              }
            }}
            disabled={accountBusy}
          >
            <LogOut size={18} /> Disconnect
          </button>
        ) : (
          <button
            className="primary"
            disabled={accountBusy || account?.configured === false}
            onClick={async () => {
              setAccountBusy(true);
              setError("");
              try {
                const next = await startYouTubeDeviceSignIn();
                setDevice(next);
              } catch (reason) {
                setError(
                  reason instanceof Error
                    ? reason.message
                    : "Google sign-in failed.",
                );
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            <LogIn size={18} /> Connect YouTube
          </button>
        )}
      </section>

      {device && (
        <section className="youtube-device-card" role="status">
          <div>
            <span>On your phone or computer, open</span>
            <a
              href={device.verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {device.verificationUrl}
            </a>
          </div>
          <div>
            <span>Enter this code</span>
            <strong className="youtube-device-code">{device.userCode}</strong>
          </div>
          <small>
            This screen will continue automatically after Google approves it.
          </small>
        </section>
      )}



      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          {selection?.videoId && embedError !== null && (
            <span className="youtube-error-actions">
              <a
                href={`https://www.youtube.com/watch?v=${selection.videoId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink size={17} /> Open in YouTube
              </a>
              {smartTubeAvailable && (
                <button
                  onClick={() =>
                    window.TikTakTV?.openSmartTube(selection.videoId!)
                  }
                >
                  <Youtube size={17} /> Open in SmartTube
                </button>
              )}
            </span>
          )}
        </div>
      )}
      {notice && (
        <div className="youtube-skip-notice" role="status">
          {notice}
        </div>
      )}

      {!!results.length && (
        <section className="youtube-section youtube-results" ref={resultsRef}>
          <h2>{resultsTitle}</h2>
          <div className="youtube-grid">
            {results.map((result) => (
              <button
                key={result.videoId}
                className="youtube-card"
                onClick={() => void select(result)}
              >
                <img src={result.thumbnail} alt="" loading="lazy" />
                <span>
                  <strong>{result.title}</strong>
                  <small>{result.channel}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selection &&
        (tvMode ? (
          <dialog
            open
            className={`youtube-player-card tv-youtube-player${tvControlsVisible ? "" : " controls-hidden"}`}
            aria-label={`${selection.title} player`}
            onPointerMove={revealTvControls}
            onPointerDown={revealTvControls}
            onCancel={(event) => {
              event.preventDefault();
              setSelection(null);
            }}
          >
            <button
              className="youtube-tv-close"
              aria-label="Close player"
              onClick={() => setSelection(null)}
            >
              <X size={28} />
            </button>
            {directPlayback ? (
              <video
                className="youtube-player youtube-direct-player"
                ref={directMediaRef}
                autoPlay
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                onError={() =>
                  setError("TikTak direct playback could not load this stream.")
                }
              />
            ) : (
              <div className="youtube-player" ref={hostRef} />
            )}
            <div className="youtube-player-info">
              <div>
                <strong>{selection.title}</strong>
                {selection.channel && <span>{selection.channel}</span>}
              </div>
              <div
                className="youtube-controls"
                aria-label="YouTube playback controls"
              >
                <button
                  onClick={() => seek(-10)}
                  aria-label="Rewind 10 seconds"
                >
                  <Rewind size={24} />
                  <span>10s</span>
                </button>
                <button
                  data-tv-initial-focus
                  onClick={() =>
                    playing
                      ? playerRef.current?.pauseVideo()
                      : playerRef.current?.playVideo()
                  }
                  aria-label={playing ? "Pause YouTube" : "Play YouTube"}
                >
                  {playing ? <Pause size={30} /> : <Play size={30} />}
                </button>
                <button
                  onClick={() => seek(10)}
                  aria-label="Fast forward 10 seconds"
                >
                  <FastForward size={24} />
                  <span>10s</span>
                </button>
                <button
                  onClick={() => {
                    const player = playerRef.current;
                    if (!player) return;
                    if (player.isMuted()) {
                      player.unMute();
                      setMuted(false);
                    } else {
                      player.mute();
                      setMuted(true);
                    }
                  }}
                  aria-label={muted ? "Unmute YouTube" : "Mute YouTube"}
                >
                  {muted ? <VolumeX size={24} /> : <Volume2 size={24} />}
                </button>
                {smartTubeAvailable && selection.videoId && (
                  <button
                    onClick={() =>
                      window.TikTakTV?.openSmartTube(selection.videoId!)
                    }
                    aria-label="Open in SmartTube"
                    title="Open in SmartTube"
                  >
                    <Youtube size={24} />
                    <span>SmartTube</span>
                  </button>
                )}
              </div>
              <SponsorBlockSettings compact />
              <YouTubeAutoplaySetting compact />
            </div>
          </dialog>
        ) : (
          <section className="youtube-player-card">
            {directPlayback ? (
              <video
                className="youtube-player youtube-direct-player"
                ref={directMediaRef}
                autoPlay
                playsInline
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
                onError={() =>
                  setError("TikTak direct playback could not load this stream.")
                }
              />
            ) : (
              <div className="youtube-player" ref={hostRef} />
            )}
            <div className="youtube-player-info">
              <div>
                <strong>{selection.title}</strong>
                {selection.channel && <span>{selection.channel}</span>}
              </div>
              <div
                className="youtube-controls"
                aria-label="YouTube playback controls"
              >
                <button
                  onClick={() => seek(-10)}
                  aria-label="Rewind 10 seconds"
                >
                  <Rewind size={20} />
                  <span>10s</span>
                </button>
                <button
                  onClick={() =>
                    playing
                      ? playerRef.current?.pauseVideo()
                      : playerRef.current?.playVideo()
                  }
                  aria-label={playing ? "Pause YouTube" : "Play YouTube"}
                >
                  {playing ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button
                  onClick={() => seek(10)}
                  aria-label="Fast forward 10 seconds"
                >
                  <FastForward size={20} />
                  <span>10s</span>
                </button>
                <button
                  onClick={() => {
                    const player = playerRef.current;
                    if (!player) return;
                    if (player.isMuted()) {
                      player.unMute();
                      setMuted(false);
                    } else {
                      player.mute();
                      setMuted(true);
                    }
                  }}
                  aria-label={muted ? "Unmute YouTube" : "Mute YouTube"}
                >
                  {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <button
                  onClick={() =>
                    document
                      .querySelector<HTMLElement>(".youtube-player-card")
                      ?.requestFullscreen?.()
                  }
                  aria-label="Fullscreen YouTube"
                >
                  <Maximize size={20} />
                </button>
              </div>
              <SponsorBlockSettings compact />
              <YouTubeAutoplaySetting compact />
            </div>
          </section>
        ))}

      {section === "forYou" && !!account?.connected &&
        kind === "video" &&
        !!account.recentFeed?.length && (
          <section className="youtube-section">
            <h2>Related uploads from channels you watched</h2>
            <div className="youtube-grid">
              {account.recentFeed.slice(0, 12).map((item) => (
                <button
                  key={item.videoId}
                  className="youtube-card"
                  onClick={() => void select(item)}
                >
                  <img src={item.thumbnail} alt="" loading="lazy" />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.channel}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

      {(kind === "music" || section === "playlists") && !!account?.connected &&
        !!account.playlists?.filter((item) => item.kind === kind).length && (
          <section className="youtube-section">
            <h2>
              {kind === "music" ? "Saved music & playlists" : "Your playlists"}
            </h2>
            <div className="youtube-grid compact">
              {account.playlists
                .filter((item) => item.kind === kind)
                .map((item) => (
                  <button
                    key={item.playlistId}
                    className="youtube-card"
                    onClick={() => void select(item)}
                  >
                    {item.thumbnail ? (
                      <img src={item.thumbnail} alt="" loading="lazy" />
                    ) : (
                      <span className="youtube-fallback">
                        <Youtube />
                      </span>
                    )}
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.itemCount ?? 0} items</small>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        )}
      {kind === "video" && section === "playlists" && !account?.playlists?.some((item) => item.kind === "video") && (
        <section className="youtube-section"><h2>My Playlists</h2><p className="youtube-feed-empty">{account?.connected ? "No saved playlists found." : "Connect your YouTube account to see your playlists."}</p></section>
      )}

      {kind === "video" && section === "subscriptions" &&
        !!account?.connected &&
        (!!account.subscriptions?.length || !!account.subscriptionFeed?.length) && (
          <section className="youtube-section">
            <h2>Subscriptions</h2>
            {!!account.subscriptionFeed?.length && (
              <div className="youtube-grid">
                {account.subscriptionFeed.map((item) => (
                  <button key={item.videoId} className="youtube-card" onClick={() => void select(item)}>
                    <img src={item.thumbnail} alt="" loading="lazy" />
                    <span><strong>{item.title}</strong><small>{item.channel}</small></span>
                  </button>
                ))}
              </div>
            )}
            <div className="youtube-subscriptions">
              {account.subscriptions?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void loadSubscription(item.id, item.title)}
                  aria-label={`Search videos from ${item.title}`}
                >
                  {item.thumbnail && (
                    <img src={item.thumbnail} alt="" loading="lazy" />
                  )}
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </section>
        )}
      {kind === "video" && section === "subscriptions" && !account?.subscriptions?.length && !account?.subscriptionFeed?.length && (
        <section className="youtube-section"><h2>Subscriptions</h2><p className="youtube-feed-empty">{account?.connected ? "No subscriptions found." : "Connect your YouTube account to see subscribed channels."}</p></section>
      )}

      {(kind === "music" || section === "history") &&
        (!!history.filter((item) => item.kind === kind).length || !!account?.historyFeed?.length) && (
        <section className="youtube-section">
          <h2>
            <History size={20} /> Recently played
          </h2>
          <div className="youtube-grid compact">
            {[...history.filter((item) => item.kind === kind), ...(kind === "video" ? account?.historyFeed ?? [] : [])]
              .filter((item, index, items) => items.findIndex((entry) => entry.videoId === item.videoId) === index)
              .map((item, index) => (
                <button
                  key={`${item.videoId ?? item.playlistId}-${index}`}
                  className="youtube-card"
                  onClick={() => {
                    const saved = read<Progress[]>("progress", []).find(
                      (entry) => youtubeVideoIdFromItem(entry.item) === item.videoId,
                    );
                    void select(item, false, saved?.seconds ?? 0);
                  }}
                >
                  {item.thumbnail ? (
                    <img src={item.thumbnail} alt="" loading="lazy" />
                  ) : (
                    <span className="youtube-fallback">
                      <Youtube />
                    </span>
                  )}
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {item.channel ??
                        (item.playlistId ? "Playlist" : "YouTube")}
                    </small>
                  </span>
                </button>
              ))}
          </div>
        </section>
      )}
      {kind === "video" && section === "history" && !history.some((item) => item.kind === "video") && !account?.historyFeed?.length && (
        <section className="youtube-section"><h2>History</h2><p className="youtube-feed-empty">Videos you watch in TikTak TV will appear here.</p></section>
      )}
    </div>
  );
}
