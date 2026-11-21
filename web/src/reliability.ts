import { getService, serviceRequest } from "./connection";
import { sourceFetch } from "./connection";
import type { Addon, Provider, Stream } from "./types";
import {
  codecCompatibility,
  compatibilityPlaybackMode,
  debridStream,
  directStream,
} from "./stream-selection";
import { validateTorboxKey } from "./torbox";
import { validateRealDebridKey } from "./realdebrid";
import { categories } from "./api";
import { manifestUrl } from "./addon-urls";

export type HealthResult = {
  id: string;
  label: string;
  status: "ready" | "warning" | "error";
  detail: string;
  fix?: string;
};

export function browserCapabilities() {
  const video = document.createElement("video");
  return {
    h264: !!video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
    hls: !!video.canPlayType("application/vnd.apple.mpegurl"),
    webm: !!video.canPlayType('video/webm; codecs="vp9,opus"'),
    pip: "pictureInPictureEnabled" in document,
    safari: /^((?!chrome|android).)*safari/i.test(navigator.userAgent),
  };
}

async function reachable(url: string, signal?: AbortSignal) {
  const response = await sourceFetch(url, {
    signal,
    cache: "no-store",
    credentials: "omit",
    referrerPolicy: "no-referrer",
  });
  const problem = response.status === 403 && new URL(url).hostname === "friend.tiktaktv.invalid"
    ? (await response.clone().json().catch(() => null)) as { error?: unknown } | null
    : null;
  return {
    ok: response.ok,
    status: response.status,
    sharedExpired: problem?.error === "Shared add-on access expired.",
  };
}

export async function runHealthChecks(input: {
  addons: Addon[];
  torboxKey: string;
  realDebridKey: string;
  provider: Provider | null;
  signal?: AbortSignal;
}): Promise<HealthResult[]> {
  const caps = browserCapabilities();
  const service = getService();
  const manifestChecks = await Promise.allSettled(
    input.addons.map((addon) =>
      reachable(manifestUrl(addon.base), input.signal),
    ),
  );
  const online = manifestChecks.filter(
    (result) => result.status === "fulfilled" && result.value.ok,
  ).length;
  const unreachable = manifestChecks.flatMap((result, index) =>
    result.status === "fulfilled" && result.value.ok
      ? []
      : [{
          name: input.addons[index].manifest.name || "Unnamed add-on",
          status: result.status === "fulfilled" ? result.value.status : null,
        }],
  );
  const failedNames = unreachable.map((item) => item.name).join(", ");
  const forbidden = unreachable.filter((item) => item.status === 403).length;
  const sharedExpired = manifestChecks.filter(
    (result) => result.status === "fulfilled" && result.value.sharedExpired,
  ).length;
  let debridReady = false;
  let debridError = "";
  try {
    if (input.torboxKey) await validateTorboxKey(input.torboxKey);
    else if (input.realDebridKey)
      await validateRealDebridKey(input.realDebridKey);
    debridReady = !!(input.torboxKey || input.realDebridKey);
  } catch (reason) {
    debridError =
      reason instanceof Error
        ? reason.message
        : "Debrid authentication failed.";
  }
  let liveReady = false;
  if (input.provider) {
    try {
      await categories(input.provider, "live", input.signal);
      liveReady = true;
    } catch {
      liveReady = false;
    }
  }
  let serviceReady = false;
  let serviceDetail = "";
  if (service) {
    try {
      const response = await serviceRequest("/health", undefined, input.signal);
      serviceReady = response.ok;
      const health = (await response.json().catch(() => ({}))) as {
        version?: number;
        uptimeSeconds?: number;
      };
      if (serviceReady) {
        const hours = Math.floor(Number(health.uptimeSeconds ?? 0) / 3600);
        serviceDetail = `Connected to companion protocol v${health.version ?? 1}${hours ? ` · up ${hours}h` : ""}. Relays, conversion, downloads, and Watch Together are available.`;
        try {
          const statusResponse = await serviceRequest(
            "/status",
            {},
            input.signal,
          );
          const status = (await statusResponse.json()) as {
            load?: { jobs?: number; parties?: number };
            capacity?: { jobs?: number; parties?: number };
          };
          if (statusResponse.ok && status.load && status.capacity)
            serviceDetail += ` Current load: ${status.load.jobs ?? 0}/${status.capacity.jobs ?? "?"} media jobs and ${status.load.parties ?? 0}/${status.capacity.parties ?? "?"} rooms.`;
        } catch {
          // Older companion versions remain supported by the health check.
        }
      }
    } catch {
      try {
        const response = await serviceRequest("/status", {}, input.signal);
        serviceReady = response.ok;
      } catch {
        serviceReady = false;
      }
    }
  }
  return [
    {
      id: "addons",
      label: "Streaming add-ons",
      status:
        online === input.addons.length && online > 0
          ? "ready"
          : online
            ? "warning"
            : "error",
      detail: `${online} of ${input.addons.length} installed manifests responded.${failedNames ? ` Not responding: ${failedNames}.` : ""}`,
      fix:
        online < input.addons.length
          ? sharedExpired
            ? `${sharedExpired} add-on${sharedExpired === 1 ? " has" : "s have"} expired friend-code access. Re-enter the code in Settings → Playback → Friend setup to refresh the shared setup.`
            : forbidden
              ? `${forbidden} add-on${forbidden === 1 ? "" : "s"} returned HTTP 403. Check their source permissions in Add-ons.`
            : "Refresh unreachable manifests or verify their configured HTTPS URLs."
          : undefined,
    },
    {
      id: "debrid",
      label: "Debrid connection",
      status: debridReady ? "ready" : debridError ? "error" : "warning",
      detail:
        debridError ||
        (input.torboxKey
          ? "TorBox is configured for this profile."
          : input.realDebridKey
            ? "Real-Debrid is configured for this profile."
            : "No direct debrid API key is configured."),
      fix: !debridReady
        ? debridError
          ? "Reconnect the debrid account with a valid personal API key."
          : "Connect TorBox or Real-Debrid, or use a debrid-configured add-on."
        : undefined,
    },
    {
      id: "service",
      label: "Compatibility service",
      status: serviceReady ? "ready" : service ? "error" : "warning",
      detail: serviceReady
        ? serviceDetail ||
          "Connected and available for remuxing, transcoding, downloads, and relays."
        : service
          ? "Configured, but it did not answer the health check."
          : "Not connected. Direct browser-compatible streams still work.",
      fix: !serviceReady
        ? "Reconnect the playback service before using MKV conversion or protected streams."
        : undefined,
    },
    {
      id: "browser",
      label: "Browser playback",
      status: caps.h264 ? "ready" : "warning",
      detail: `H.264 ${caps.h264 ? "supported" : "not detected"}; native HLS ${caps.hls ? "supported" : "handled by the web player"}; WebM ${caps.webm ? "supported" : "limited"}.`,
      fix: !caps.h264
        ? "Use a current Safari, Chrome, Edge, or Firefox release."
        : undefined,
    },
    {
      id: "live",
      label: "Live TV",
      status: input.provider ? (liveReady ? "ready" : "error") : "warning",
      detail: input.provider
        ? liveReady
          ? `${input.provider.name || "IPTV"} answered a live-channel request${serviceReady ? " with browser-safe conversion available" : ""}.`
          : `${input.provider.name || "IPTV"} did not answer the live-channel check.`
        : "No Live TV provider is connected.",
      fix: !input.provider
        ? "Connect an Xtream or playlist source in Live TV settings."
        : undefined,
    },
  ];
}

export function streamCompatibility(stream: Stream) {
  const protectedHeaders = (
    stream.behaviorHints?.proxyHeaders as
      | { request?: Record<string, string> }
      | undefined
  )?.request;
  if (
    stream.url &&
    debridStream(stream) &&
    stream.behaviorHints?.notWebReady !== true &&
    !Object.keys(protectedHeaders ?? {}).length
  )
    return {
      label: "Direct play",
      kind: "direct" as const,
      detail:
        "The resolved debrid stream will be tried directly. Compatibility conversion is available if playback fails.",
    };
  const mode = compatibilityPlaybackMode(stream);
  if (mode && (stream.url || stream.infoHash))
    return {
      label: "Conversion required",
      kind: "convert" as const,
      detail: `${mode === "remux" ? "Container remux" : "Codec conversion"} through the compatibility service.`,
    };
  if (!directStream(stream) && !stream.infoHash)
    return {
      label: "Unsupported",
      kind: "unsupported" as const,
      detail: "No playable HTTPS or torrent source was provided.",
    };
  return {
    label: "Direct play",
    kind: "direct" as const,
    detail:
      codecCompatibility(stream) > 0
        ? "Optimized for browser playback."
        : "Expected to play directly in this browser.",
  };
}

export type DownloadJob = {
  id: string;
  name: string;
  status: "preparing" | "ready" | "started" | "failed";
  detail: string;
  at: number;
  url?: string;
  statusPath?: string;
  bytes?: number;
  progressSeconds?: number;
  stage?: "copy" | "transcode";
};
const DOWNLOADS_KEY = "nuvio:downloads";
const DOWNLOAD_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
function downloadsKey() {
  const profile = localStorage.getItem("tiktak:active-profile-owner") || "local";
  return `${DOWNLOADS_KEY}:${profile}`;
}
export function downloadJobs(): DownloadJob[] {
  try {
    const key = downloadsKey();
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as DownloadJob[];
    const current = stored.filter((job) => Date.now() - job.at <= DOWNLOAD_RETENTION_MS);
    if (current.length !== stored.length) localStorage.setItem(key, JSON.stringify(current));
    return current;
  } catch {
    return [];
  }
}
export function updateDownloadJob(job: DownloadJob) {
  const jobs = [
    job,
    ...downloadJobs().filter((item) => item.id !== job.id),
  ].slice(0, 30);
  localStorage.setItem(downloadsKey(), JSON.stringify(jobs));
  window.dispatchEvent(new Event("downloads-changed"));
}
export function clearDownloadJobs() {
  localStorage.removeItem(downloadsKey());
  window.dispatchEvent(new Event("downloads-changed"));
}
export function removeDownloadJob(id: string) {
  localStorage.setItem(
    downloadsKey(),
    JSON.stringify(downloadJobs().filter((job) => job.id !== id)),
  );
  window.dispatchEvent(new Event("downloads-changed"));
}
