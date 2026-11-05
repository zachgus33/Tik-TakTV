import {
  FastForward,
  History,
  LogIn,
  LogOut,
  Maximize,
  Music2,
  Pause,
  Play,
  Rewind,
  Search,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  parseYouTubeSelection,
  disconnectYouTube,
  pollYouTubeDeviceSignIn,
  resolveYouTubePlaylist,
  searchYouTube,
  sponsorSegments,
  startYouTubeDeviceSignIn,
  youtubeAccount,
  type SponsorSegment,
  type YouTubeAccount,
  type YouTubeKind,
  type YouTubeSelection,
} from "./youtube";

type Player = {
  destroy(): void;
  getCurrentTime(): number;
  getDuration(): number;
  getIframe(): HTMLIFrameElement;
  getPlayerState(): number;
  getVideoData(): { video_id?: string; title?: string; author?: string };
  isMuted(): boolean;
  mute(): void;
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
    YT?: { Player: PlayerConstructor; PlayerState: { PLAYING: number } };
    onYouTubeIframeAPIReady?: () => void;
    __tiktakYouTubeApi?: Promise<void>;
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

const historyKey = "tiktak:youtube-history";

function readHistory(): YouTubeSelection[] {
  try {
    const value = JSON.parse(localStorage.getItem(historyKey) ?? "[]");
    return Array.isArray(value) ? value.slice(0, 12) : [];
  } catch {
    return [];
  }
}

export default function YouTubeHub() {
  const tvMode =
    document.documentElement.classList.contains("tv-mode") ||
    new URLSearchParams(location.search).get("tv") === "1" ||
    /TikTakTV-AndroidTV/i.test(navigator.userAgent);
  const [kind, setKind] = useState<YouTubeKind>("video");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSelection[]>([]);
  const [selection, setSelection] = useState<YouTubeSelection | null>(null);
  const [history, setHistory] = useState(readHistory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [tvControlsVisible, setTvControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("");
  const [account, setAccount] = useState<YouTubeAccount | null>(null);
  const [accountBusy, setAccountBusy] = useState(true);
  const [device, setDevice] = useState<{
    userCode: string;
    verificationUrl: string;
    interval: number;
  } | null>(null);
  const [sponsorEnabled, setSponsorEnabled] = useState(
    () => localStorage.getItem("tiktak:youtube-sponsorblock") !== "0",
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const tvControlsTimerRef = useRef<number>(0);
  const playingRef = useRef(false);
  const segmentsRef = useRef<SponsorSegment[]>([]);
  const segmentVideoRef = useRef("");
  const resultsRef = useRef<HTMLElement>(null);
  const [resultsTitle, setResultsTitle] = useState("Search results");

  playingRef.current = playing;
  const revealTvControls = useCallback(() => {
    if (!tvMode) return;
    window.clearTimeout(tvControlsTimerRef.current);
    setTvControlsVisible(true);
    if (!playingRef.current) return;
    tvControlsTimerRef.current = window.setTimeout(() => {
      setTvControlsVisible(false);
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(".youtube-tv-close, .youtube-player-info")) active.blur();
    }, 3500);
  }, [tvMode]);

  const loadAccount = async () => {
    setAccountBusy(true);
    try {
      setAccount(await youtubeAccount(false));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "YouTube sign-in failed.");
    } finally {
      setAccountBusy(false);
    }
  };

  useEffect(() => {
    void loadAccount();
  }, []);

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
        timer = window.setTimeout(poll, (result.interval ?? device.interval) * 1000);
      } catch (reason) {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Google sign-in expired.");
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
    ].slice(0, 12);
    setHistory(value);
    localStorage.setItem(historyKey, JSON.stringify(value));
  };

  const select = async (next: YouTubeSelection) => {
    setError("");
    try {
      const playable = await resolveYouTubePlaylist({
        ...next,
        kind: next.kind ?? kind,
      });
      setSelection(playable);
      remember(playable);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "This YouTube item could not be opened.");
    }
  };

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
      setResultsTitle(kind === "music" ? "Music search results" : "Video search results");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
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
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ block: "start" }));
      if (!found.length) setError(`No playable videos were found for ${title}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "That subscription could not be loaded.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!selection || !hostRef.current) return;
    let cancelled = false;
    let player: Player | null = null;
    setReady(false);
    setPlaying(false);
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
            },
            onError: () =>
              setError("This video cannot be played in an embedded player."),
          },
        });
      })
      .catch((reason) =>
        setError(reason instanceof Error ? reason.message : "YouTube failed."),
      );
    return () => {
      cancelled = true;
      window.dispatchEvent(
        new CustomEvent("tiktak-media-activity", { detail: { active: false } }),
      );
      playerRef.current = null;
      player?.destroy();
    };
  }, [selection, tvMode]);

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
    if (!ready || !sponsorEnabled) return;
    const timer = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || player.getPlayerState() !== window.YT?.PlayerState.PLAYING)
        return;
      const time = player.getCurrentTime();
      const segment = segmentsRef.current.find(
        (candidate) => time >= candidate.start && time < candidate.end - 0.15,
      );
      if (!segment) return;
      player.seekTo(segment.end, true);
      setNotice(`Skipped ${segment.category.replaceAll("_", " ")}`);
      window.setTimeout(() => setNotice(""), 2400);
    }, 500);
    return () => clearInterval(timer);
  }, [ready, sponsorEnabled]);

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
      if (active?.closest(".youtube-controls")) return;
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
          .querySelector<HTMLElement>(".tv-youtube-player .youtube-controls button")
          ?.focus();
      }
    };
    window.addEventListener("keydown", handleKeys, true);
    return () => window.removeEventListener("keydown", handleKeys, true);
  }, [tvMode, selection, playing, revealTvControls]);

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
                setError(reason instanceof Error ? reason.message : "Google sign-in failed.");
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
          <small>This screen will continue automatically after Google approves it.</small>
        </section>
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

      {error && (
        <div className="error" role="alert">
          {error}
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
                <span><strong>{result.title}</strong><small>{result.channel}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      {selection && (tvMode ? (
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
          ><X size={28} /></button>
          <div className="youtube-player" ref={hostRef} />
          <div className="youtube-player-info">
            <div><strong>{selection.title}</strong>{selection.channel && <span>{selection.channel}</span>}</div>
            <div className="youtube-controls" aria-label="YouTube playback controls">
              <button onClick={() => seek(-10)} aria-label="Rewind 10 seconds"><Rewind size={24} /><span>10s</span></button>
              <button data-tv-initial-focus onClick={() => playing ? playerRef.current?.pauseVideo() : playerRef.current?.playVideo()} aria-label={playing ? "Pause YouTube" : "Play YouTube"}>{playing ? <Pause size={30} /> : <Play size={30} />}</button>
              <button onClick={() => seek(10)} aria-label="Fast forward 10 seconds"><FastForward size={24} /><span>10s</span></button>
              <button onClick={() => { const player = playerRef.current; if (!player) return; if (player.isMuted()) { player.unMute(); setMuted(false); } else { player.mute(); setMuted(true); } }} aria-label={muted ? "Unmute YouTube" : "Mute YouTube"}>{muted ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
            </div>
          </div>
        </dialog>
      ) : (
        <section className="youtube-player-card">
          <div className="youtube-player" ref={hostRef} />
          <div className="youtube-player-info">
            <div>
              <strong>{selection.title}</strong>
              {selection.channel && <span>{selection.channel}</span>}
            </div>
            <div
              className="youtube-controls"
              aria-label="YouTube playback controls"
            >
              <button onClick={() => seek(-10)} aria-label="Rewind 10 seconds">
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
            <label className="youtube-sponsor-toggle">
              <input
                type="checkbox"
                checked={sponsorEnabled}
                onChange={(event) => {
                  setSponsorEnabled(event.target.checked);
                  localStorage.setItem(
                    "tiktak:youtube-sponsorblock",
                    event.target.checked ? "1" : "0",
                  );
                }}
              />
              <ShieldCheck size={18} /> Skip SponsorBlock segments
            </label>
          </div>
        </section>
      ))}

      {!!account?.connected && !!(kind === "music" ? account.musicFeed : account.videoFeed)?.length && (
        <section className="youtube-section">
          <h2>{kind === "music" ? "Your music" : "Videos for you"}</h2>
          <div className="youtube-grid">
            {(kind === "music" ? account.musicFeed : account.videoFeed)!.map((item, index) => (
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
        </section>
      )}

      {!!account?.connected && !!account.playlists?.filter((item) => item.kind === kind).length && (
        <section className="youtube-section">
          <h2>{kind === "music" ? "Saved music & playlists" : "Your playlists"}</h2>
          <div className="youtube-grid compact">
            {account.playlists.filter((item) => item.kind === kind).map((item) => (
              <button
                key={item.playlistId}
                className="youtube-card"
                onClick={() => void select(item)}
              >
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" loading="lazy" />
                ) : (
                  <span className="youtube-fallback"><Youtube /></span>
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

      {kind === "video" &&
        !!account?.connected &&
        !!account.subscriptions?.length && (
          <section className="youtube-section">
            <h2>Subscriptions</h2>
            <div className="youtube-subscriptions">
              {account.subscriptions.map((item) => (
                <button
                  key={item.id}
                  onClick={() => void loadSubscription(item.id, item.title)}
                  aria-label={`Search videos from ${item.title}`}
                >
                  {item.thumbnail && <img src={item.thumbnail} alt="" loading="lazy" />}
                  <strong>{item.title}</strong>
                </button>
              ))}
            </div>
          </section>
        )}

      {!!history.filter((item) => item.kind === kind).length && (
        <section className="youtube-section">
          <h2>
            <History size={20} /> Recently played
          </h2>
          <div className="youtube-grid compact">
            {history.filter((item) => item.kind === kind).map((item, index) => (
              <button
                key={`${item.videoId ?? item.playlistId}-${index}`}
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
                  <small>
                    {item.channel ?? (item.playlistId ? "Playlist" : "YouTube")}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
