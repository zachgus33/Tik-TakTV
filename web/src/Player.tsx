import { getService, prepareMedia, sourceFetch } from "./connection";
import { useEffect, useRef, useState } from "react";
import {
  Airplay,
  Check,
  Copy,
  Link,
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import type Hls from "hls.js";
import type { Addon, Episode, Item, Subtitle } from "./types";
import { addonSubtitles, safeUrl } from "./api";
import { storeProgress } from "./storage";
import { liveAudioCodec } from "./media-compatibility";
import {
  createParty,
  partyLink,
  partyState,
  type PartySession,
} from "./watch-party";

export type Playback = {
  item: Item;
  url: string;
  episode?: Episode;
  resume?: number;
  requestHeaders?: Record<string, string>;
  hls?: boolean;
  mode?: "direct" | "remux" | "transcode";
  subtitles?: Subtitle[];
  subtitleRequest?: { addons: Addon[]; id: string };
  prepared?: boolean;
  relay?: boolean;
  party?: { id: string; host: boolean };
};
function srtToVtt(text: string) {
  return `WEBVTT\n\n${text
    .replace(/^\uFEFF/, "")
    .replace(/^(\d+)\s*$/gm, "")
    .replace(/(\d{2}:\d{2}:\d{2}),([0-9]{3})/g, "$1.$2")}`;
}
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
function VideoPlayer({
  playback,
  onClose,
  onFailure,
}: {
  playback: Playback;
  onClose: () => void;
  onFailure?: () => boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekEnd, setSeekEnd] = useState(0);
  const [subtitles, setSubtitles] = useState<{ url: string; name: string }[]>(
    [],
  );
  const [subtitleCandidates, setSubtitleCandidates] = useState<Subtitle[]>(
    playback.subtitles ?? [],
  );
  const [quality, setQuality] = useState<{ label: string; value: number }[]>(
    [],
  );
  const [audioTracks, setAudioTracks] = useState<
    { label: string; value: number; source: "hls" | "native" }[]
  >([]);
  const [party, setParty] = useState<PartySession | null>(null);
  const [partyBusy, setPartyBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const hlsRef = useRef<Hls | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const subtitleRef = useRef(subtitles);
  subtitleRef.current = subtitles;
  useEffect(() => {
    if (!playback.party) return;
    setParty(
      (current) =>
        current ?? {
          id: playback.party!.id,
          host: playback.party!.host,
          participants: 1,
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
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);
  useEffect(() => {
    return () => {
      for (const s of subtitleRef.current) URL.revokeObjectURL(s.url);
    };
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setSubtitleCandidates(playback.subtitles ?? []);
    if (playback.subtitleRequest)
      void addonSubtitles(
        playback.subtitleRequest.addons,
        playback.item,
        playback.subtitleRequest.id,
        c.signal,
      ).then((loaded) => {
        if (!c.signal.aborted) setSubtitleCandidates(loaded);
      });
    return () => c.abort();
  }, [playback]);
  useEffect(() => {
    const c = new AbortController();
    const candidates = subtitleCandidates.slice(0, 12);
    if (!candidates.length) return () => c.abort();
    void Promise.allSettled(
      candidates.map(async (candidate, index) => {
        const response = await sourceFetch(candidate.url, {
          signal: c.signal,
          cache: "force-cache",
        });
        if (!response.ok) throw new Error();
        const raw = await response.text();
        const text = raw.trimStart().startsWith("WEBVTT") ? raw : srtToVtt(raw);
        return {
          url: URL.createObjectURL(new Blob([text], { type: "text/vtt" })),
          name: candidate.name ?? `Subtitle ${index + 1}`,
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
  }, [subtitleCandidates]);
  useEffect(() => {
    const video = videoRef.current!;
    let disposed = false;
    let lastSave = 0;
    let hlsRecoveries = 0;
    setError("");
    setNotice("");
    setQuality([]);
    setAudioTracks([]);
    setPlaying(false);
    setCurrentTime(0);
    setSeekEnd(0);
    const url =
      safeUrl(playback.url) ??
      (getService()?.url.startsWith("http://127.0.0.1:") &&
      playback.url.startsWith(getService()!.url + "/media/")
        ? playback.url
        : undefined);
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
      setCurrentTime(video.currentTime || 0);
      const available = video.seekable.length
        ? video.seekable.end(video.seekable.length - 1)
        : Number.isFinite(video.duration)
          ? video.duration
          : 0;
      setSeekEnd(available);
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
      const nativeTracks = (
        video as HTMLVideoElement & {
          audioTracks?: {
            length: number;
            [index: number]: { label?: string; language?: string };
          };
        }
      ).audioTracks;
      if (nativeTracks?.length && nativeTracks.length > 1)
        setAudioTracks(
          Array.from({ length: nativeTracks.length }, (_, value) => ({
            value,
            source: "native" as const,
            label:
              nativeTracks[value].label ||
              nativeTracks[value].language ||
              `Audio ${value + 1}`,
          })),
        );
    };
    const failed = () => {
      if (onFailure?.()) return;
      setError(
        "Playback failed. The source may be offline, block browser access, or use an unsupported codec. Try another stream. Some sources require a separate media server.",
      );
    };
    const playingStarted = () => setPlaying(true);
    const playingStopped = () => setPlaying(false);
    const play = async () => {
      try {
        await video.play();
      } catch {
        if (!disposed) setNotice("Tap the video’s play button to start.");
      }
    };
    video.addEventListener("loadedmetadata", loaded);
    video.addEventListener("timeupdate", time);
    video.addEventListener("progress", time);
    video.addEventListener("durationchange", time);
    video.addEventListener("play", playingStarted);
    video.addEventListener("pause", playingStopped);
    video.addEventListener("pause", persist);
    video.addEventListener("ended", persist);
    video.addEventListener("error", failed);
    window.addEventListener("pagehide", persist);
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
            if (hls.audioTracks.length > 1)
              setAudioTracks(
                hls.audioTracks.map((track, value) => ({
                  value,
                  source: "hls" as const,
                  label: track.lang || track.name || `Audio ${value + 1}`,
                })),
              );
            void play();
          });
          hls.on(HlsClass.Events.ERROR, (_, data) => {
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
      video.removeEventListener("progress", time);
      video.removeEventListener("durationchange", time);
      video.removeEventListener("play", playingStarted);
      video.removeEventListener("pause", playingStopped);
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
            ? { position: video.currentTime || 0, paused: video.paused }
            : undefined,
        );
        if (disposed) return;
        setParty(result);
        if (!party.host) {
          const elapsed = result.state.paused
            ? 0
            : Math.max(0, result.state.serverTime - result.state.updatedAt) /
              1000;
          const target = Math.max(0, result.state.position + elapsed);
          if (Math.abs((video.currentTime || 0) - target) > 1.25)
            video.currentTime = target;
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
        if (!disposed)
          setNotice(
            e instanceof Error ? e.message : "Watch Together disconnected.",
          );
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
        video.currentTime || 0,
        video.paused,
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
        controls={playback.item.type === "live"}
        playsInline
        preload="metadata"
        poster={playback.item.background}
        aria-label={playback.item.name}
      >
        {subtitles.map((s, index) => (
          <track
            key={s.url}
            src={s.url}
            kind="subtitles"
            label={s.name}
            srcLang={s.name.match(/\b[a-z]{2,3}\b/i)?.[0] ?? "und"}
            default={index === 0}
          />
        ))}
      </video>
      {playback.item.type !== "live" && (
        <div className="vod-controls" aria-label="Playback controls">
          <button
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
          <button
            type="button"
            aria-label="Rewind 10 seconds"
            onClick={() => {
              const video = videoRef.current;
              if (video)
                video.currentTime = Math.max(0, video.currentTime - 10);
            }}
          >
            <RotateCcw size={18} />
            <span>10</span>
          </button>
          <span>{formatPlayerTime(currentTime)}</span>
          <input
            type="range"
            aria-label="Playback position"
            min="0"
            max={Math.max(1, seekEnd)}
            step="0.1"
            value={Math.min(currentTime, Math.max(1, seekEnd))}
            onChange={(event) => {
              const video = videoRef.current;
              if (video) video.currentTime = Number(event.target.value);
            }}
          />
          <span>{formatPlayerTime(seekEnd)}</span>
        </div>
      )}
      {party && (
        <div className="party-status" role="status">
          <span>
            <strong>Watch Together</strong>
            {party.host ? "You control this room" : "Following the host"} ·{" "}
            {party.participants} watching
          </span>
          <button type="button" onClick={() => void copyPartyLink()}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copied" : "Copy invite"}
          </button>
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
      <div className="player-tools">
        {playback.item.type !== "live" && !party && (
          <button disabled={partyBusy} onClick={() => void startParty()}>
            <Link size={18} />
            {partyBusy ? "Starting room…" : "Watch Together"}
          </button>
        )}
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
        {audioTracks.length > 1 && (
          <select
            aria-label="Audio language"
            onChange={(e) => {
              const selected = audioTracks[Number(e.target.value)];
              if (!selected) return;
              if (selected.source === "hls" && hlsRef.current) {
                hlsRef.current.audioTrack = selected.value;
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
            }}
          >
            {audioTracks.map((track, index) => (
              <option key={`${track.source}-${track.value}`} value={index}>
                {track.label}
              </option>
            ))}
          </select>
        )}
        {subtitles.length > 1 && (
          <select
            aria-label="Subtitle language"
            defaultValue="0"
            onChange={(event) => {
              const tracks = videoRef.current?.textTracks;
              if (!tracks) return;
              const selected = Number(event.target.value);
              for (let index = 0; index < tracks.length; index += 1)
                tracks[index].mode =
                  index === selected ? "showing" : "disabled";
            }}
          >
            {subtitles.map((subtitle, index) => (
              <option key={subtitle.url} value={index}>
                {subtitle.name}
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

export default function Player({
  playback,
  onClose,
}: {
  playback: Playback;
  onClose: () => void;
}) {
  const [ready, setReady] = useState<Playback | null>(null);
  const [error, setError] = useState("");
  const fallbackStarted = useRef(false);
  const fallbackController = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    setReady(null);
    setError("");
    fallbackStarted.current = false;
    const cleanup = () => {
      c.abort();
      fallbackController.current?.abort();
      fallbackController.current = null;
    };
    if (playback.prepared) {
      setReady(playback);
      return cleanup;
    }
    void prepareMedia(
      playback.url,
      playback.requestHeaders,
      c.signal,
      playback.mode,
      playback.mode === "transcode"
        ? liveAudioCodec(navigator.userAgent)
        : undefined,
      playback.item.type === "live",
      playback.relay,
    ).then(
      (url) => {
        if (!c.signal.aborted)
          setReady({
            ...playback,
            url,
            hls:
              !/\.webm(?:[?#]|$)/i.test(url) &&
              (playback.hls ||
                playback.mode === "remux" ||
                playback.mode === "transcode" ||
                getService()?.mode === "remux" ||
                getService()?.mode === "transcode" ||
                /\.m3u8(?:[?#]|$)/i.test(playback.url)),
          });
      },
      (e) => {
        if (!c.signal.aborted) setError(e.message);
      },
    );
    return cleanup;
  }, [playback]);
  const recoverWithCompatibility = () => {
    const service = getService();
    if (
      fallbackStarted.current ||
      !service ||
      !playback.relay ||
      playback.item.type === "live" ||
      playback.url.startsWith(`${service.url}/media/`)
    )
      return false;
    fallbackStarted.current = true;
    setReady(null);
    setError("");
    const controller = new AbortController();
    fallbackController.current = controller;
    void prepareMedia(
      playback.url,
      playback.requestHeaders,
      controller.signal,
      "transcode",
      liveAudioCodec(navigator.userAgent),
      false,
      true,
    ).then(
      (url) => {
        if (!controller.signal.aborted)
          setReady({
            ...playback,
            url,
            hls: !/\.webm(?:[?#]|$)/i.test(url),
            mode: "transcode",
            prepared: true,
          });
      },
      (reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "This source could not be converted for this browser.",
          );
      },
    );
    return true;
  };
  if (ready)
    return (
      <VideoPlayer
        playback={ready}
        onClose={onClose}
        onFailure={recoverWithCompatibility}
      />
    );
  return (
    <dialog
      open
      className="player-dialog player-preparing"
      aria-label="Preparing playback"
    >
      <span className="spinner" />
      <h2>
        {error
          ? "Could not prepare playback"
          : `Preparing ${playback.item.name}`}
      </h2>
      <p role={error ? "alert" : "status"}>
        {error || "Optimizing the selected source for your browser…"}
      </p>
      <button onClick={onClose}>{error ? "Close player" : "Cancel"}</button>
    </dialog>
  );
}
