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
export function streamDescriptor(stream: Stream): string {
  return [
    stream.addonName,
    stream.name,
    stream.title,
    stream.url,
    stream.behaviorHints?.filename,
  ]
    .filter(Boolean)
    .join(" ");
}

export function streamSubtitlePriority(stream: Stream): number {
  const descriptor = streamDescriptor(stream);
  if (
    /\b(?:embedded|multi[ ._-]?subs?|multiple[ ._-]?subs?)\b/i.test(descriptor)
  )
    return 3;
  if ((stream.subtitles?.length ?? 0) > 0) return 2;
  if (/\b(?:subs?|subtitles?|closed[ ._-]?captions?|cc)\b/i.test(descriptor))
    return 1;
  return 0;
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
export type StreamBadgeFilter = {
  id?: string;
  groupId?: string;
  name: string;
  pattern: string;
  imageURL?: string;
  isEnabled?: boolean;
  tagColor?: string;
  textColor?: string;
  borderColor?: string;
};
export type StreamBadgeImport = {
  sourceUrl: string;
  filters: StreamBadgeFilter[];
  groups?: { id?: string; name?: string; color?: string }[];
  isActive: boolean;
};
export type StreamPreferences = {
  /** Legacy download filters retained for existing profiles. */
  maxQuality: number;
  maxSizeGb: number;
  excludedTerms: string[];
  codec: "any" | "h264";
  autoPlayMode: "manual" | "first" | "regex";
  autoPlaySource: "all" | "addons";
  autoPlaySelectedAddons: string[];
  autoPlayRegex: string;
  autoPlayTimeoutSeconds: number;
  reuseLastLink: boolean;
  reuseLastLinkHours: number;
  preferBingeGroup: boolean;
  reuseBingeGroup: boolean;
  streamBadgeImports: StreamBadgeImport[];
  showFileSizeBadges: boolean;
  showAddonNameBadge: boolean;
  streamBadgePlacement: "top" | "bottom";
  pinnedSources: { id: string; name: string }[];
  updatedAt: number;
};
export const defaultStreamPreferences: StreamPreferences = {
  maxQuality: 4320,
  maxSizeGb: 0,
  excludedTerms: [],
  codec: "any",
  autoPlayMode: "first",
  autoPlaySource: "all",
  autoPlaySelectedAddons: [],
  autoPlayRegex: "",
  autoPlayTimeoutSeconds: 3,
  reuseLastLink: false,
  reuseLastLinkHours: 24,
  preferBingeGroup: true,
  reuseBingeGroup: true,
  streamBadgeImports: [],
  showFileSizeBadges: true,
  showAddonNameBadge: true,
  streamBadgePlacement: "bottom",
  pinnedSources: [],
  updatedAt: 0,
};

export function parseExcludedTerms(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.flatMap((entry) => String(entry).split(/[,;\n]/))
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const seen = new Set<string>();
  return raw
    .map((term) => term.trim())
    .filter((term) => {
      const key = term.toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeStreamPreferences(value: unknown): StreamPreferences {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<StreamPreferences>)
      : {};
  return {
    maxQuality: Number(saved.maxQuality) || 4320,
    maxSizeGb: Math.max(0, Number(saved.maxSizeGb) || 0),
    excludedTerms: parseExcludedTerms(saved.excludedTerms),
    codec: saved.codec === "h264" ? "h264" : "any",
    autoPlayMode:
      saved.autoPlayMode === "manual" ||
      saved.autoPlayMode === "first" ||
      saved.autoPlayMode === "regex"
        ? saved.autoPlayMode
        : "first",
    autoPlaySource: saved.autoPlaySource === "addons" ? "addons" : "all",
    autoPlaySelectedAddons: Array.isArray(saved.autoPlaySelectedAddons)
      ? [...new Set(saved.autoPlaySelectedAddons.map(String).filter(Boolean))]
      : [],
    autoPlayRegex:
      typeof saved.autoPlayRegex === "string" ? saved.autoPlayRegex : "",
    autoPlayTimeoutSeconds:
      Number(saved.autoPlayTimeoutSeconds) === Number.POSITIVE_INFINITY ||
      Number(saved.autoPlayTimeoutSeconds) >= Number.MAX_SAFE_INTEGER
        ? Number.MAX_SAFE_INTEGER
        : Math.min(
            30,
            Math.max(0, Number(saved.autoPlayTimeoutSeconds ?? 3) || 0),
          ),
    reuseLastLink: saved.reuseLastLink === true,
    reuseLastLinkHours: Math.min(
      720,
      Math.max(1, Number(saved.reuseLastLinkHours ?? 24) || 24),
    ),
    preferBingeGroup: saved.preferBingeGroup !== false,
    reuseBingeGroup: saved.reuseBingeGroup !== false,
    streamBadgeImports: Array.isArray(saved.streamBadgeImports)
      ? saved.streamBadgeImports
          .filter(
            (entry): entry is StreamBadgeImport =>
              !!entry &&
              typeof entry === "object" &&
              typeof entry.sourceUrl === "string" &&
              Array.isArray(entry.filters),
          )
          .slice(0, 3)
          .map((entry, index) => ({
            sourceUrl: entry.sourceUrl.trim(),
            filters: entry.filters
              .filter(
                (filter) =>
                  filter &&
                  typeof filter.name === "string" &&
                  typeof filter.pattern === "string",
              )
              .map((filter) => ({ ...filter })),
            groups: Array.isArray(entry.groups)
              ? entry.groups.map((group) => ({ ...group }))
              : [],
            isActive:
              entry.isActive === true ||
              (!saved.streamBadgeImports?.some(
                (candidate) => candidate.isActive === true,
              ) &&
                index === 0),
          }))
          .filter((entry) => entry.sourceUrl && entry.filters.length)
      : [],
    showFileSizeBadges: saved.showFileSizeBadges !== false,
    showAddonNameBadge: saved.showAddonNameBadge !== false,
    streamBadgePlacement:
      saved.streamBadgePlacement === "top" ? "top" : "bottom",
    pinnedSources: Array.isArray(saved.pinnedSources)
      ? saved.pinnedSources
          .filter(
            (source) =>
              source &&
              typeof source.id === "string" &&
              typeof source.name === "string",
          )
          .map((source) => ({
            id: source.id.trim(),
            name: source.name.trim(),
          }))
          .filter(
            (source, index, all) =>
              source.id &&
              source.name &&
              all.findIndex((candidate) => candidate.id === source.id) ===
                index,
          )
      : [],
    updatedAt: Math.max(0, Number(saved.updatedAt) || 0),
  };
}
export function streamPreferences(): StreamPreferences {
  if (typeof localStorage === "undefined") return defaultStreamPreferences;
  try {
    return normalizeStreamPreferences(
      JSON.parse(localStorage.getItem("tiktak:stream-preferences") || "{}"),
    );
  } catch {
    return defaultStreamPreferences;
  }
}
export function saveStreamPreferences(preferences: StreamPreferences) {
  const normalized = normalizeStreamPreferences(preferences);
  localStorage.setItem("tiktak:stream-preferences", JSON.stringify(normalized));
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("tiktak:stream-preferences-changed"));
  return normalized;
}

const audioLanguageAliases: [string, RegExp][] = [
  ["original", /(?:^|[^a-z])(?:original|orig|default)(?:[^a-z]|$)/i],
  ["en", /(?:^|[^a-z])(?:en|eng|english)(?:[^a-z]|$)/i],
  ["es", /(?:^|[^a-z])(?:es|spa|spanish|español)(?:[^a-z]|$)/i],
  ["fr", /(?:^|[^a-z])(?:fr|fre|fra|french|français)(?:[^a-z]|$)/i],
  ["de", /(?:^|[^a-z])(?:de|ger|deu|german|deutsch)(?:[^a-z]|$)/i],
  ["it", /(?:^|[^a-z])(?:it|ita|italian|italiano)(?:[^a-z]|$)/i],
  ["pt", /(?:^|[^a-z])(?:pt|por|portuguese|português)(?:[^a-z]|$)/i],
  ["ja", /(?:^|[^a-z])(?:ja|jpn|jap|japanese)(?:[^a-z]|$)/i],
  ["ko", /(?:^|[^a-z])(?:ko|kor|korean)(?:[^a-z]|$)/i],
  ["zh", /(?:^|[^a-z])(?:zh|chi|zho|chinese|mandarin)(?:[^a-z]|$)/i],
  ["hi", /(?:^|[^a-z])(?:hi|hin|hindi)(?:[^a-z]|$)/i],
  ["ar", /(?:^|[^a-z])(?:ar|ara|arabic)(?:[^a-z]|$)/i],
  ["ru", /(?:^|[^a-z])(?:ru|rus|russian)(?:[^a-z]|$)/i],
];
export function audioLanguageKey(value: string): string {
  const cleaned = value.trim().toLowerCase();
  for (const [key, matcher] of audioLanguageAliases)
    if (matcher.test(cleaned)) return key;
  return cleaned.match(/^[a-z]{2,3}(?=[-_\s]|$)/)?.[0] ?? cleaned;
}
export function preferredAudioLanguage(): string {
  if (typeof localStorage !== "undefined") {
    const stored = localStorage.getItem("tiktak:audio-language")?.trim();
    if (stored) return audioLanguageKey(stored);
  }
  if (typeof navigator !== "undefined")
    for (const language of navigator.languages ?? [navigator.language]) {
      const key = audioLanguageKey(language ?? "");
      if (key) return key;
    }
  return "en";
}
export function preferredAudioLanguages(): string[] {
  const primary = preferredAudioLanguage();
  const secondary =
    typeof localStorage === "undefined"
      ? ""
      : audioLanguageKey(
          localStorage.getItem("tiktak:secondary-audio-language") ?? "",
        );
  return [...new Set([primary, secondary].filter(Boolean))];
}
export function audioLanguageScore(values: string[]): number {
  const preferred = preferredAudioLanguages();
  const keys = values.map(audioLanguageKey).filter(Boolean);
  const preferredIndex = preferred.findIndex((language) =>
    keys.some((key) => key === language),
  );
  if (preferredIndex >= 0) return Math.max(2, 3 - preferredIndex);
  if (keys.some((key) => key === "multiple" || key === "multi")) return 1;
  return keys.length ? -1 : 0;
}
export function streamAudioLanguageScore(stream: Stream): number {
  return audioLanguageScore(streamAudioLanguages(stream));
}
export function preferredAudioTrackIndex(
  tracks: { label?: string; language?: string }[],
): number | undefined {
  let bestIndex: number | undefined;
  let bestScore = 0;
  tracks.forEach((track, index) => {
    const score = audioLanguageScore(
      [track.label, track.language].filter(Boolean) as string[],
    );
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}
export function validStreamRegex(pattern: string): boolean {
  const value = pattern.trim();
  if (!value || !/[\p{L}\p{N}]/u.test(value)) return false;
  try {
    new RegExp(value, "i");
    return true;
  } catch {
    return false;
  }
}
export function streamMatchesRegex(stream: Stream, pattern: string): boolean {
  try {
    return new RegExp(pattern.trim(), "i").test(streamDescriptor(stream));
  } catch {
    return false;
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
  // A resolved debrid URL serves the original media file; resolving it does
  // not change an MKV container or an HEVC/DTS codec into browser-safe media.
  // Respect the filename/codec hints so autoplay can choose a real MP4 first
  // instead of failing direct playback and entering a preparation loop.
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

export function mobilePlaybackDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android.+Mobile/i.test(ua)) return true;
  return (
    navigator.maxTouchPoints > 1 &&
    typeof screen !== "undefined" &&
    Math.min(screen.width, screen.height) <= 1024
  );
}

export function mobileAutoPlayScore(stream: Stream): number {
  const reportedQuality = streamQuality(stream);
  const directReady = compatibilityPlaybackMode(stream) === undefined;
  const languageBonus = streamAudioLanguageScore(stream) * 18;
  const qualityScore = !reportedQuality
    ? 8
    : reportedQuality <= 1080
      ? (reportedQuality / 1080) * 60
      : Math.max(5, 60 - ((reportedQuality - 1080) / 1080) * 45);
  const seederScore = Math.log10(Math.max(0, seeders(stream)) + 1) * 5;
  return (
    (directReady ? 100 : 0) +
    audioCompatibility(stream) * 18 +
    qualityScore +
    seederScore +
    languageBonus +
    (debridStream(stream) ? 8 : 0) +
    ((stream.subtitles?.length ?? 0) > 0 ? 4 : 0)
  );
}

export function autoplayStreams(
  streams: Stream[],
  _hasTorbox: boolean,
  installedOrder: string[] = [],
  preferredBingeGroup?: string,
): Stream[] {
  const preferences = streamPreferences();
  if (preferences.autoPlayMode === "manual") return [];
  const addonRank = new Map(
    installedOrder.map((name, index) => [name.toLocaleLowerCase(), index]),
  );
  let ordered = streams
    .map((stream, index) => ({ stream, index }))
    .sort(
      (left, right) =>
        Number(compatibilityPlaybackMode(left.stream) !== undefined) -
          Number(compatibilityPlaybackMode(right.stream) !== undefined) ||
        Number(debridStream(right.stream)) -
          Number(debridStream(left.stream)) ||
        (addonRank.get(left.stream.addonName?.toLocaleLowerCase() ?? "") ??
          Number.MAX_SAFE_INTEGER) -
          (addonRank.get(right.stream.addonName?.toLocaleLowerCase() ?? "") ??
            Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map(({ stream }) => stream);
  if (
    preferences.preferBingeGroup &&
    preferences.reuseBingeGroup &&
    preferredBingeGroup
  ) {
    const preferred = ordered.filter(
      (stream) => stream.behaviorHints?.bingeGroup === preferredBingeGroup,
    );
    if (preferred.length)
      ordered = [
        ...preferred,
        ...ordered.filter((stream) => !preferred.includes(stream)),
      ];
  }
  const eligible = ordered.filter((stream) => {
    if (!directStream(stream)) return false;
    if (
      preferences.autoPlaySelectedAddons.length > 0 &&
      !preferences.autoPlaySelectedAddons.some(
        (selected) =>
          selected === stream.addonId ||
          selected.toLocaleLowerCase() ===
            stream.addonName?.toLocaleLowerCase(),
      )
    )
      return false;
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
  const sourceFiltered = eligible.filter((stream) => {
    const reportedQuality = streamQuality(stream);
    if (reportedQuality && reportedQuality > preferences.maxQuality)
      return false;
    if (
      preferences.maxSizeGb &&
      sizeGb(stream) &&
      sizeGb(stream) > preferences.maxSizeGb
    )
      return false;
    if (
      preferences.excludedTerms.some((term) =>
        streamDescriptor(stream)
          .toLocaleLowerCase()
          .includes(term.toLocaleLowerCase()),
      )
    )
      return false;
    if (preferences.codec === "h264" && codecCompatibility(stream) < 1)
      return false;
    return true;
  });
  const filtered =
    preferences.autoPlayMode === "regex"
      ? validStreamRegex(preferences.autoPlayRegex)
        ? eligible.filter((stream) =>
            streamMatchesRegex(stream, preferences.autoPlayRegex),
          )
        : []
      : sourceFiltered;
  const matched =
    preferences.autoPlayMode === "first"
      ? ordered.filter((stream) => filtered.includes(stream))
      : filtered;
  // Mobile Enhanced deliberately preserves provider/add-on order here. Regex
  // controls eligibility, not a second hidden quality sort.
  return matched;
}

/** Every direct result remains available for manual choice. Autoplay limits
 * and regexes only affect automatic selection, never the source picker. */
export function sourcePickerStreams(
  streams: Stream[],
  installedOrder: string[] = [],
  allowUnresolvedDebrid = false,
): Stream[] {
  const preferences = streamPreferences();
  const seen = new Set<string>();
  const addonRank = new Map(
    installedOrder.map((name, index) => [name.toLocaleLowerCase(), index]),
  );
  const pinnedRank = new Map(
    preferences.pinnedSources.map((source, index) => [source.id, index]),
  );
  return streams
    .filter(
      (stream) =>
        directStream(stream) || (allowUnresolvedDebrid && !!stream.infoHash),
    )
    .filter((stream) => {
      const descriptor = streamDescriptor(stream);
      if (
        /\[(?:tb|rd|ad)\s+download\]|\bdownload\s+to\s+debrid\b/i.test(
          descriptor,
        )
      )
        return false;
      const key = `${stream.url ?? ""}|${stream.infoHash ?? ""}|${stream.fileIdx ?? ""}|${stream.behaviorHints?.filename ?? ""}`;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((stream, index) => ({ stream, index }))
    .sort(
      (left, right) =>
        (pinnedRank.get(left.stream.addonId ?? "") ?? Number.MAX_SAFE_INTEGER) -
          (pinnedRank.get(right.stream.addonId ?? "") ??
            Number.MAX_SAFE_INTEGER) ||
        Number(debridStream(right.stream)) -
          Number(debridStream(left.stream)) ||
        (addonRank.get(left.stream.addonName?.toLocaleLowerCase() ?? "") ??
          Number.MAX_SAFE_INTEGER) -
          (addonRank.get(right.stream.addonName?.toLocaleLowerCase() ?? "") ??
            Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
    .map(({ stream }) => stream);
}
