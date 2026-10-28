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
  const match = /(?:\u{1F464}|\u{1F465}|seeders?\s*[:=]?|seeds?\s*[:=]?)\s*([\d,]+)/iu.exec(
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
  return compatibilityPlaybackMode(stream) !== undefined;
}
function streamDescriptor(stream: Stream): string {
  return [
    stream.name,
    stream.title,
    stream.url,
    stream.behaviorHints?.filename,
  ]
    .filter(Boolean)
    .join(" ");
}
export function codecCompatibility(stream: Stream): number {
  const source = streamDescriptor(stream);
  if (/\b(?:av1|x265|h\.?265|hevc)\b/i.test(source)) return -2;
  if (/\b(?:x264|h\.?264|avc)\b/i.test(source)) return 2;
  if (/\.(?:mp4|m4v)(?:[?#\s]|$)/i.test(source)) return 1;
  return 0;
}
export function languageCompatibility(stream: Stream): number {
  const source = streamDescriptor(stream);
  if (
    /\b(?:eng(?:lish)?|dual[ ._-]*audio|multi[ ._-]*(?:audio|lang)|dub(?:bed)?)\b|🇬🇧|🇺🇸/iu.test(
      source,
    )
  )
    return 2;
  if (
    /\b(?:ita(?:lian)?|french|fra|rus(?:sian)?|spanish|castellano|latino|german|deu|japanese|jpn|hindi|polish|portuguese|korean)\b|🇮🇹|🇫🇷|🇷🇺|🇪🇸|🇩🇪|🇯🇵|🇮🇳|🇵🇱|🇵🇹|🇰🇷/iu.test(
      source,
    )
  )
    return -2;
  return 0;
}
export function compatibilityPlaybackMode(
  stream: Stream,
): "remux" | "transcode" | undefined {
  const source = streamDescriptor(stream);
  if (
    stream.behaviorHints?.notWebReady === true ||
    /\b(?:av1|x265|h\.?265|hevc)\b/i.test(source) ||
    /\.(?:avi|wmv|flv)(?:[?#\s]|$)/i.test(source)
  )
    return "transcode";
  // Container-copying MKV into HLS can preserve timestamps and keyframe
  // spacing that browsers reject even when FFmpeg can read the source.
  if (/\.mkv(?:[?#\s]|$)/i.test(source)) return "transcode";
  if (/\.ts(?:[?#\s]|$)/i.test(source)) return "remux";
  return undefined;
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
        languageCompatibility(b) - languageCompatibility(a) ||
        codecCompatibility(b) - codecCompatibility(a) ||
        Number(!needsCompatibilityTranscode(b)) -
          Number(!needsCompatibilityTranscode(a)) ||
        sourcePriority(b) - sourcePriority(a) ||
        seeders(b) - seeders(a) ||
        streamQuality(b) - streamQuality(a),
    );
}
export function autoplayStreams(
  streams: Stream[],
  hasTorbox: boolean,
): Stream[] {
  return rankedStreams(streams, hasTorbox).filter((stream) => {
    if (!directStream(stream)) return false;
    const descriptor = streamDescriptor(stream);
    // Uncached add-on results can still look like HTTPS media URLs. These
    // labels mean selecting the URL starts a debrid download instead.
    if (/\[(?:tb|rd|ad)\s+download\]|\bdownload\s+to\s+debrid\b/i.test(descriptor))
      return false;
    // A missing torrent file index creates a resolver link that cannot point
    // at playable media.
    if (/\/resolve\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/undefined(?:\/|$)/i.test(stream.url ?? ""))
      return false;
    return true;
  });
}
