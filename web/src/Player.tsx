import { useEffect, useRef, useState } from "react";
import { Airplay, Maximize, PictureInPicture2, X } from "lucide-react";
import type Hls from "hls.js";
import type { Episode, Item } from "./types";
import { safeUrl } from "./api";
import { storeProgress } from "./storage";

export type Playback = {
  item: Item;
  url: string;
  episode?: Episode;
  resume?: number;
};
export default function Player({
  playback,
  onClose,
}: {
  playback: Playback;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [subtitles, setSubtitles] = useState<{ url: string; name: string }[]>(
    [],
  );
  const [quality, setQuality] = useState<{ label: string; value: number }[]>(
    [],
  );
  const hlsRef = useRef<Hls | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const subtitleRef = useRef(subtitles);
  subtitleRef.current = subtitles;
  useEffect(() => {
    dialogRef.current?.showModal();
    return () => {
      for (const s of subtitleRef.current) URL.revokeObjectURL(s.url);
    };
  }, []);
  useEffect(() => {
    const video = videoRef.current!;
    let disposed = false;
    let lastSave = 0;
    setError("");
    setNotice("");
    setQuality([]);
    const url = safeUrl(playback.url);
    if (!url) {
      setError("This stream needs a secure HTTPS connection.");
      return;
    }
    const persist = () =>
      storeProgress(
        playback.item,
        video.currentTime,
        video.duration,
        playback.episode,
      );
    const time = () => {
      if (Date.now() - lastSave > 5000) {
        persist();
        lastSave = Date.now();
      }
    };
    const loaded = () => {
      if (
        playback.resume &&
        playback.item.type !== "live" &&
        Number.isFinite(video.duration)
      )
        video.currentTime = Math.min(
          playback.resume,
          Math.max(0, video.duration - 1),
        );
    };
    const failed = () =>
      setError(
        "Playback failed. The source may be offline, block browser access, or use an unsupported codec. Try another stream. Some sources require a separate media server.",
      );
    const play = () =>
      video.play().catch(() => {
        if (!disposed) setNotice("Tap the video’s play button to start.");
      });
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("timeupdate", time);
    video.addEventListener("pause", persist);
    video.addEventListener("ended", persist);
    video.addEventListener("error", failed);
    window.addEventListener("pagehide", persist);
    const isHls =
      /\.m3u8(?:[?#]|$)/i.test(playback.url) ||
      (playback.item.source === "xtream" && playback.item.type === "live");
    if (isHls && !video.canPlayType("application/vnd.apple.mpegurl")) {
      void import("hls.js")
        .then(({ default: HlsClass }) => {
          if (disposed) return;
          if (!HlsClass.isSupported()) {
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
            void play();
          });
          hls.on(HlsClass.Events.ERROR, (_, data) => {
            if (data.fatal) {
              hls.destroy();
              hlsRef.current = null;
              failed();
            }
          });
          hls.loadSource(url);
          hls.attachMedia(video);
        })
        .catch(() =>
          setError(
            "The video player could not load. Check your connection and retry.",
          ),
        );
    } else {
      video.src = url;
      void play();
    }
    return () => {
      disposed = true;
      persist();
      video.removeEventListener("loadedmetadata", loaded);
      video.removeEventListener("timeupdate", time);
      video.removeEventListener("pause", persist);
      video.removeEventListener("ended", persist);
      video.removeEventListener("error", failed);
      window.removeEventListener("pagehide", persist);
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [playback, retry]);
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
        video.currentTime,
        video.duration,
        playback.episode,
      );
    onClose();
  }
  return (
    <dialog ref={dialogRef} className="player-dialog" onCancel={close}>
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
        <button
          className="icon-button"
          onClick={close}
          aria-label="Close player"
        >
          <X />
        </button>
      </div>
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        poster={playback.item.background}
        aria-label={playback.item.name}
      >
        {subtitles.map((s) => (
          <track
            key={s.url}
            src={s.url}
            kind="subtitles"
            label={s.name}
            srcLang="en"
            default
          />
        ))}
      </video>
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
      <div className="player-tools">
        <button onClick={airplay}>
          <Airplay size={18} /> AirPlay
        </button>
        <button onClick={pip}>
          <PictureInPicture2 size={18} /> Picture in Picture
        </button>
        <button onClick={fullscreen}>
          <Maximize size={18} /> Fullscreen
        </button>
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
        <label className="button file-button">
          Load subtitles
          <input
            type="file"
            accept=".vtt,text/vtt"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 2_000_000) {
                setNotice("Choose a WebVTT file smaller than 2 MB.");
                return;
              }
              const text = await file.text();
              if (!text.trim().startsWith("WEBVTT")) {
                setNotice("Choose a WebVTT (.vtt) subtitle file.");
                return;
              }
              for (const s of subtitles) URL.revokeObjectURL(s.url);
              setSubtitles([
                {
                  url: URL.createObjectURL(
                    new Blob([text], { type: "text/vtt" }),
                  ),
                  name: file.name,
                },
              ]);
            }}
          />
        </label>
      </div>
    </dialog>
  );
}
