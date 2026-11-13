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
const languageMatchers: [string, RegExp][] = [
  ["English", /\b(?:english|eng)\b|(?:^|\s)🇬🇧(?:\s|$)|(?:^|\s)🇺🇸(?:\s|$)/i],
  ["Spanish", /\b(?:spanish|español|spa)\b|(?:^|\s)🇪🇸(?:\s|$)/i],
  ["French", /\b(?:french|français|fre|fra)\b|(?:^|\s)🇫🇷(?:\s|$)/i],
  ["German", /\b(?:german|deutsch|ger|deu)\b|(?:^|\s)🇩🇪(?:\s|$)/i],
  ["Italian", /\b(?:italian|italiano|ita)\b|(?:^|\s)🇮🇹(?:\s|$)/i],
  [
    "Portuguese",
    /\b(?:portuguese|português|por)\b|(?:^|\s)🇵🇹(?:\s|$)|(?:^|\s)🇧🇷(?:\s|$)/i,
  ],
  ["Japanese", /\b(?:japanese|jpn|jap)\b|(?:^|\s)🇯🇵(?:\s|$)/i],
  ["Korean", /\b(?:korean|kor)\b|(?:^|\s)🇰🇷(?:\s|$)/i],
  ["Chinese", /\b(?:chinese|mandarin|chi|zho)\b|(?:^|\s)🇨🇳(?:\s|$)/i],
  ["Hindi", /\b(?:hindi|hin)\b|(?:^|\s)🇮🇳(?:\s|$)/i],
  ["Arabic", /\b(?:arabic|ara)\b|(?:^|\s)🇸🇦(?:\s|$)/i],
  ["Russian", /\b(?:russian|rus)\b|(?:^|\s)🇷🇺(?:\s|$)/i],
];
export function streamAudioLanguages(stream: Stream): string[] {
  const supplied = [
    ...(stream.behaviorHints?.audioLanguages ?? []),
    stream.behaviorHints?.language,
  ]
    .flatMap((value) => String(value ?? "").split(/[,/|]/))
    .map((value) => value.trim())
    .filter(Boolean);
  const text = [stream.name, stream.title, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(" ");
  const detected = languageMatchers
    .filter(([, pattern]) => pattern.test(text))
    .map(([name]) => name);
  if (/\b(?:multi[ -]?(?:audio|dub)|dual[ -]?audio)\b/i.test(text))
    detected.push("Multiple");
  return [...new Set([...supplied, ...detected])];
}
export function seeders(stream: Stream): number {
  if (Number.isFinite(stream.seeders)) return Math.max(0, stream.seeders!);
  const text = `${stream.name ?? ""} ${stream.title ?? ""}`;
  const match =
    /(?:\u{1F464}|\u{1F465}|seeders?\s*[:=]?|seeds?\s*[:=]?)\s*([\d,]+)/iu.exec(
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
  return [stream.name, stream.title, stream.url, stream.behaviorHints?.filename]
    .filter(Boolean)
    .join(" ");
}
export type StreamAudioCodec =
  "aac" | "mp3" | "opus" | "ac3" | "eac3" | "dts" | "truehd";
export function streamAudioCodec(stream: Stream): StreamAudioCodec | undefined {
  const source = streamDescriptor(stream);
  if (/\b(?:truehd|true[ ._-]?hd|mlp)\b/i.test(source)) return "truehd";
  if (/\b(?:dts[ ._-]?hd|dts[ ._-]?ma|dts)\b/i.test(source)) return "dts";
  if (/\b(?:e[ ._-]?ac[ ._-]?3|eac3|ddp|dd\+)\b/i.test(source)) return "eac3";
  if (/\b(?:ac[ ._-]?3|dolby[ ._-]?digital)\b/i.test(source)) return "ac3";
  if (/\b(?:aac|he[ ._-]?aac)\b/i.test(source)) return "aac";
  if (/\b(?:mp3|mpeg[ ._-]?audio)\b/i.test(source)) return "mp3";
  if (/\bopus\b/i.test(source)) return "opus";
  return undefined;
}
export function audioCompatibility(stream: Stream): number {
  const codec = streamAudioCodec(stream);
  if (codec === "aac" || codec === "mp3" || codec === "opus") return 2;
  if (codec) return -2;
  return 0;
}
export type StreamPreferences = {
  maxQuality: number;
  maxSizeGb: number;
  excludedTerms: string[];
  codec: "any" | "h264";
};
export function streamPreferences(): StreamPreferences {
  if (typeof localStorage === "undefined")
    return { maxQuality: 4320, maxSizeGb: 0, excludedTerms: [], codec: "any" };
  try {
    const saved = JSON.parse(
      localStorage.getItem("tiktak:stream-preferences") || "{}",
    ) as Partial<StreamPreferences>;
    return {
      maxQuality: Number(saved.maxQuality) || 4320,
      maxSizeGb: Math.max(0, Number(saved.maxSizeGb) || 0),
      excludedTerms: Array.isArray(saved.excludedTerms)
        ? saved.excludedTerms.map(String).filter(Boolean)
        : [],
      codec: saved.codec === "h264" ? "h264" : "any",
    };
  } catch {
    return { maxQuality: 4320, maxSizeGb: 0, excludedTerms: [], codec: "any" };
  }
}
function sizeGb(stream: Stream) {
  const match = /(?:^|\s)([\d.]+)\s*(GB|MB)(?:\s|$)/i.exec(
    streamDescriptor(stream),
  );
  if (!match) return 0;
  const value = Number(match[1]);
  return match[2].toUpperCase() === "MB" ? value / 1024 : value;
}
export function debridStream(stream: Stream): boolean {
  return /\[(?:tb|rd|ad)\+?\]|\b(?:torbox|real[ -]?debrid|all[ -]?debrid)\b|\/resolve\/(?:torbox|realdebrid|real-debrid|alldebrid)\//i.test(
    streamDescriptor(stream),
  );
}
export function codecCompatibility(stream: Stream): number {
  const source = streamDescriptor(stream);
  if (/\b(?:av1|x265|h\.?265|hevc)\b/i.test(source)) return -2;
  if (/\b(?:x264|h\.?264|avc)\b/i.test(source)) return 2;
  if (/\.(?:mp4|m4v)(?:[?#\s]|$)/i.test(source)) return 1;
  return 0;
}
export function compatibilityPlaybackMode(
  stream: Stream,
): "remux" | "transcode" | undefined {
  const source = streamDescriptor(stream);
  if (audioCompatibility(stream) < 0) return "transcode";
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
export function rankedStreams(streams: Stream[], hasTorbox: boolean): Stream[] {
  const preferences = streamPreferences();
  return streams
    .filter(
      (s) =>
        streamQuality(s) >= 720 &&
        streamQuality(s) <= preferences.maxQuality &&
        (!preferences.maxSizeGb ||
          !sizeGb(s) ||
          sizeGb(s) <= preferences.maxSizeGb) &&
        !preferences.excludedTerms.some((term) =>
          streamDescriptor(s)
            .toLocaleLowerCase()
            .includes(term.toLocaleLowerCase()),
        ) &&
        (preferences.codec !== "h264" || codecCompatibility(s) >= 1) &&
        (directStream(s) || (!!s.infoHash && hasTorbox)),
    )
    .sort(
      (a, b) =>
        audioCompatibility(b) - audioCompatibility(a) ||
        streamQuality(b) - streamQuality(a) ||
        seeders(b) - seeders(a) ||
        codecCompatibility(b) - codecCompatibility(a),
    );
}
export function autoplayStreams(
  streams: Stream[],
  hasTorbox: boolean,
): Stream[] {
  const eligible = rankedStreams(streams, hasTorbox).filter((stream) => {
    if (!directStream(stream)) return false;
    if (stream.behaviorHints?.notWebReady === true) return false;
    const descriptor = streamDescriptor(stream);
    // Uncached add-on results can still look like HTTPS media URLs. These
    // labels mean selecting the URL starts a debrid download instead.
    if (
      /\[(?:tb|rd|ad)\s+download\]|\bdownload\s+to\s+debrid\b/i.test(descriptor)
    )
      return false;
    // A missing torrent file index creates a resolver link that cannot point
    // at playable media.
    if (
      /\/resolve\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/undefined(?:\/|$)/i.test(
        stream.url ?? "",
      )
    )
      return false;
    return true;
  });
  const browserReady = eligible.filter((stream) => !compatibilityPlaybackMode(stream));
  return browserReady.length ? [...browserReady, ...eligible.filter((stream) => !!compatibilityPlaybackMode(stream))] : eligible;
}
