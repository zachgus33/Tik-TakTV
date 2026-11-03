import {
  FastForward,
  History,
  Maximize,
  Music2,
  Pause,
  Play,
  Rewind,
  Search,
  ShieldCheck,
  Volume2,
  VolumeX,
  Youtube,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  parseYouTubeSelection,
  searchYouTube,
  sponsorSegments,
  type SponsorSegment,
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
  const [kind, setKind] = useState<YouTubeKind>("video");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<YouTubeSelection[]>([]);
  const [selection, setSelection] = useState<YouTubeSelection | null>(null);
  const [history, setHistory] = useState(readHistory);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("");
  const [sponsorEnabled, setSponsorEnabled] = useState(
    () => localStorage.getItem("tiktak:youtube-sponsorblock") !== "0",
  );
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const segmentsRef = useRef<SponsorSegment[]>([]);
  const segmentVideoRef = useRef("");

  const remember = (next: YouTubeSelection) => {
    const value = [
      next,
      ...history.filter(
        (item) =>
          item.videoId !== next.videoId || item.playlistId !== next.playlistId,
      ),
    ].slice(0, 12);
    setHistory(value);
    localStorage.setItem(historyKey, JSON.stringify(value));
  };

  const select = (next: YouTubeSelection) => {
    setSelection(next);
    setError("");
    remember(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const direct = parseYouTubeSelection(query);
    if (direct) {
      select(direct);
      return;
    }
    if (!query.trim()) return;
    setBusy(true);
    setError("");
    try {
      const found = await searchYouTube(query, kind);
      setResults(found);
      if (!found.length) setError("No embeddable YouTube results were found.");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "YouTube search failed.",
      );
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
            controls: 1,
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
              setPlaying(event.data === window.YT?.PlayerState.PLAYING);
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
      playerRef.current = null;
      player?.destroy();
    };
  }, [selection]);

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
            onClick={() => setKind("video")}
            role="tab"
            aria-selected={kind === "video"}
          >
            <Youtube size={18} /> Videos
          </button>
          <button
            className={kind === "music" ? "active" : ""}
            onClick={() => setKind("music")}
            role="tab"
            aria-selected={kind === "music"}
          >
            <Music2 size={18} /> Music
          </button>
        </div>
      </section>

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

      {selection && (
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
      )}

      {!!results.length && (
        <section className="youtube-section">
          <h2>Search results</h2>
          <div className="youtube-grid">
            {results.map((result) => (
              <button
                key={result.videoId}
                className="youtube-card"
                onClick={() => select(result)}
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

      {!!history.length && (
        <section className="youtube-section">
          <h2>
            <History size={20} /> Recently played
          </h2>
          <div className="youtube-grid compact">
            {history.map((item, index) => (
              <button
                key={`${item.videoId ?? item.playlistId}-${index}`}
                className="youtube-card"
                onClick={() => select(item)}
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
