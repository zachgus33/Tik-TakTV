import { getService } from "./connection";
import { safeUrl } from "./api";
import type { Stream } from "./types";

export function quality(text: string): number {
  const values = [
    ...text.matchAll(
      /(?:^|[^\d])(480|576|720|1080|1440|2160|4320)[pi]?(?=$|[^\d])/gi,
    ),
  ].map((m) => Number(m[1]));
  if (/\b4k\b|\buhd\b/i.test(text)) values.push(2160);
  if (/\b8k\b/i.test(text)) values.push(4320);
  return Math.max(0, ...values);
}
export function streamQuality(stream: Stream) {
  return quality(
    [stream.name, stream.title, stream.behaviorHints?.filename]
      .filter(Boolean)
      .join(" "),
  );
}
export function seeders(stream: Stream): number {
  if (Number.isFinite(stream.seeders)) return Math.max(0, stream.seeders!);
  const text = `${stream.name ?? ""} ${stream.title ?? ""}`;
  const match = /(?:👤|👥|seeders?\s*[:=]?|seeds?\s*[:=]?)\s*([\d,]+)/i.exec(
    text,
  );
  return match ? Number(match[1].replaceAll(",", "")) : -1;
}
export function directStream(stream: Stream): boolean {
  const service = getService();
  const headers = stream.behaviorHints?.proxyHeaders as
    { request?: Record<string, string> } | undefined;
  return (
    !!safeUrl(stream.url) &&
    (!!service || !Object.keys(headers?.request ?? {}).length) &&
    (stream.behaviorHints?.notWebReady !== true || !!service)
  );
}
export function needsCompatibilityTranscode(stream: Stream): boolean {
  const source = [stream.url, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(" ");
  return (
    stream.behaviorHints?.notWebReady === true ||
    /\.(?:mkv|avi|wmv|flv|ts)(?:[?#\s]|$)/i.test(source)
  );
}
function sourcePriority(stream: Stream): number {
  const text = `${stream.name ?? ""} ${stream.title ?? ""}`;
  if (/\[TB\+\].*torrentio/i.test(text)) return 3;
  if (/torrentio/i.test(text)) return 2;
  if (/\[TB\+\]/i.test(text)) return 1;
  if (/\bdownload\b/i.test(text)) return -1;
  return 0;
}
export function rankedStreams(streams: Stream[], hasTorbox: boolean): Stream[] {
  return streams
    .filter(
      (s) =>
        streamQuality(s) >= 720 &&
        (directStream(s) || (!!s.infoHash && hasTorbox)),
    )
    .sort(
      (a, b) =>
        Number(directStream(b)) - Number(directStream(a)) ||
        Number(!needsCompatibilityTranscode(b)) -
          Number(!needsCompatibilityTranscode(a)) ||
        sourcePriority(b) - sourcePriority(a) ||
        seeders(b) - seeders(a) ||
        streamQuality(b) - streamQuality(a),
    );
}
