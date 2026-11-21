function timestampSeconds(value: string) {
  const parts = value.split(":").map(Number);
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
}

function formatTimestamp(value: number, includeHours: boolean) {
  const safe = Math.max(0, value);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = (safe % 60).toFixed(3).padStart(6, "0");
  return includeHours || hours
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${String(minutes).padStart(2, "0")}:${seconds}`;
}

export function shiftWebVtt(text: string, offsetSeconds: number) {
  if (!Number.isFinite(offsetSeconds) || offsetSeconds === 0) return text;
  return text.replace(
    /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})(\s+-->\s+)((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/g,
    (_, start: string, arrow: string, end: string) =>
      `${formatTimestamp(timestampSeconds(start) + offsetSeconds, start.split(":").length === 3)}${arrow}${formatTimestamp(timestampSeconds(end) + offsetSeconds, end.split(":").length === 3)}`,
  );
}

export type ParsedSubtitleCue = {
  startTime: number;
  endTime: number;
  text: string;
};

export function cleanSubtitleText(text: string) {
  return text
    .replace(/<(?:\d+:)?\d{1,2}:\d{2}(?:[.,]\d+)?>/g, "")
    .replace(/<[^>]+>/g, "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:transcribed|transcript)\s*[:\-]\s*/i, "")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

const subtitleLanguageNames: Record<string, string> = {
  ar: "Arabic",
  ara: "Arabic",
  chi: "Chinese",
  de: "German",
  deu: "German",
  en: "English",
  eng: "English",
  es: "Spanish",
  spa: "Spanish",
  fr: "French",
  fra: "French",
  fre: "French",
  ger: "German",
  hi: "Hindi",
  hin: "Hindi",
  it: "Italian",
  ita: "Italian",
  ja: "Japanese",
  jpn: "Japanese",
  ko: "Korean",
  kor: "Korean",
  nl: "Dutch",
  nld: "Dutch",
  pl: "Polish",
  pol: "Polish",
  por: "Portuguese",
  pt: "Portuguese",
  ru: "Russian",
  rus: "Russian",
  tr: "Turkish",
  tur: "Turkish",
  zh: "Chinese",
  zho: "Chinese",
};

export function subtitleLanguageName(value?: string) {
  const normalized = String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .replaceAll("_", "-");
  if (!normalized || normalized === "und") return "";
  const base = normalized.split("-")[0];
  return (
    subtitleLanguageNames[normalized] ??
    subtitleLanguageNames[base] ??
    normalized.toLocaleUpperCase()
  );
}

export function subtitlePickerName(
  name?: string,
  language?: string,
  index = 0,
) {
  const text = cleanSubtitleText(String(name ?? "")).trim();
  const languageName = subtitleLanguageName(language);
  const generic =
    !text ||
    /^(?:add-?on|captions?|subtitles?(?:\s+\d+)?|opensubtitles?(?:\s+v?\d+)?)$/i.test(
      text,
    ) ||
    /^(?:\d{4,}|[a-f0-9]{8,}|[a-f0-9-]{16,})$/i.test(text);
  if (generic) return languageName || `Subtitle ${index + 1}`;
  if (
    languageName &&
    !text.toLocaleLowerCase().includes(languageName.toLocaleLowerCase())
  )
    return `${languageName} · ${text}`;
  return text;
}

export function hlsErrorTargetsSubtitles(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const data = value as {
    details?: unknown;
    reason?: unknown;
    frag?: { type?: unknown };
    context?: { type?: unknown };
  };
  return /subtitle|caption|texttrack/i.test(
    [data.details, data.reason, data.frag?.type, data.context?.type]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Produce a browser-safe WebVTT track. Generated subtitle providers sometimes
 * include right-edge cue positioning, a visible "Transcribed:" label, and
 * long overlapping cue windows. Those are especially disruptive in iOS PWA
 * playback, where Safari can stack every active cue off the side of the video.
 */
export function normalizeWebVtt(text: string) {
  const parsed = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n\r?\n/)
    .flatMap((block) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes("-->"));
      if (timingIndex < 0) return [];
      const match = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/.exec(
        lines[timingIndex],
      );
      if (!match) return [];
      const body = lines
        .slice(timingIndex + 1)
        .map(cleanSubtitleText)
        .filter(Boolean)
        .join("\n");
      if (!body) return [];
      return [
        {
          startTime: timestampSeconds(match[1]),
          endTime: timestampSeconds(match[2]),
          body,
          includeHours: match[1].split(":").length === 3,
        },
      ];
    })
    .sort((left, right) => left.startTime - right.startTime);
  const cues = parsed.filter(
    (cue, index) =>
      !parsed
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.body.toLocaleLowerCase() === cue.body.toLocaleLowerCase() &&
            earlier.endTime > cue.startTime,
        ),
  );
  return `WEBVTT\n\n${cues
    .map((cue, index) => {
      const nextStart = cues[index + 1]?.startTime;
      const naturalEnd = Math.min(cue.endTime, cue.startTime + 6);
      const endTime =
        nextStart != null && naturalEnd > nextStart
          ? Math.max(cue.startTime + 0.04, nextStart - 0.04)
          : naturalEnd;
      return `${formatTimestamp(cue.startTime, cue.includeHours)} --> ${formatTimestamp(
        Math.max(cue.startTime + 0.04, endTime),
        cue.includeHours,
      )}\n${cue.body}`;
    })
    .join("\n\n")}`;
}

export function parseWebVttCues(text: string): ParsedSubtitleCue[] {
  const cues: ParsedSubtitleCue[] = [];
  const blocks = text.replace(/^\uFEFF/, "").split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter(Boolean);
    const timingIndex = lines.findIndex((line) => line.includes("-->"));
    if (timingIndex < 0) continue;
    const match = /((?:\d{2}:)?\d{2}:\d{2}\.\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}\.\d{3})/.exec(
      lines[timingIndex],
    );
    if (!match) continue;
    const body = cleanSubtitleText(
      lines.slice(timingIndex + 1).join("\n").replace(/<[^>]+>/g, ""),
    );
    if (!body) continue;
    cues.push({
      startTime: timestampSeconds(match[1]),
      endTime: timestampSeconds(match[2]),
      text: body,
    });
  }
  return cues;
}

function cuesToWebVtt(cues: ParsedSubtitleCue[]) {
  return normalizeWebVtt(
    `WEBVTT\n\n${cues
      .filter((cue) => cue.endTime > cue.startTime && cue.text.trim())
      .sort((left, right) => left.startTime - right.startTime)
      .map(
        (cue) =>
          `${formatTimestamp(cue.startTime, true)} --> ${formatTimestamp(cue.endTime, true)}\n${cleanSubtitleText(cue.text)}`,
      )
      .join("\n\n")}`,
  );
}

function assCues(text: string): ParsedSubtitleCue[] {
  let inEvents = false;
  let fields = [
    "Layer",
    "Start",
    "End",
    "Style",
    "Name",
    "MarginL",
    "MarginR",
    "MarginV",
    "Effect",
    "Text",
  ];
  const cues: ParsedSubtitleCue[] = [];
  for (const raw of text.replaceAll("\r", "").split("\n")) {
    const line = raw.trim();
    if (/^\[events]$/i.test(line)) {
      inEvents = true;
      continue;
    }
    if (/^\[.*]$/.test(line)) {
      inEvents = false;
      continue;
    }
    if (!inEvents) continue;
    if (/^format:/i.test(line)) {
      fields = line
        .slice(line.indexOf(":") + 1)
        .split(",")
        .map((field) => field.trim());
      continue;
    }
    if (!/^dialogue:/i.test(line)) continue;
    const parts = line
      .slice(line.indexOf(":") + 1)
      .split(/,(?=(?:[^{}]*\{[^{}]*})*[^{}]*$)/);
    const startIndex = fields.findIndex((field) => /^start$/i.test(field));
    const endIndex = fields.findIndex((field) => /^end$/i.test(field));
    const textIndex = fields.findIndex((field) => /^text$/i.test(field));
    const start = timestampSeconds(parts[startIndex >= 0 ? startIndex : 1]);
    const end = timestampSeconds(parts[endIndex >= 0 ? endIndex : 2]);
    const body = cleanSubtitleText(
      parts
        .slice(textIndex >= 0 ? textIndex : 9)
        .join(",")
        .replace(/\{[^}]*}/g, "")
        .replaceAll("\\N", "\n")
        .replaceAll("\\n", "\n")
        .replaceAll("\\h", " "),
    );
    if (end > start && body)
      cues.push({ startTime: start, endTime: end, text: body });
  }
  return cues;
}

function ttmlSeconds(value: string) {
  const trimmed = value.trim();
  const unit = /^([\d.]+)(ms|h|m|s)$/i.exec(trimmed);
  if (unit) {
    const multiplier =
      unit[2].toLowerCase() === "h"
        ? 3600
        : unit[2].toLowerCase() === "m"
          ? 60
          : unit[2].toLowerCase() === "ms"
            ? 0.001
            : 1;
    return Number(unit[1]) * multiplier;
  }
  const frameTime = /^(\d+):(\d+):(\d+):(\d+)$/.exec(trimmed);
  if (frameTime)
    return (
      Number(frameTime[1]) * 3600 +
      Number(frameTime[2]) * 60 +
      Number(frameTime[3]) +
      Number(frameTime[4]) / 30
    );
  return timestampSeconds(trimmed.replace(",", "."));
}

function ttmlCues(text: string): ParsedSubtitleCue[] {
  return [...text.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi)].flatMap(
    (match) => {
      const attrs = match[1];
      const attribute = (name: string) =>
        new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(
          attrs,
        )?.[1];
      const begin = attribute("begin") ?? attribute("start");
      if (!begin) return [];
      const startTime = ttmlSeconds(begin);
      const endTime = attribute("end")
        ? ttmlSeconds(attribute("end")!)
        : startTime + 3;
      const body = cleanSubtitleText(
        match[2].replace(/<br\s*\/?\s*>/gi, "\n"),
      );
      return endTime > startTime && body
        ? [{ startTime, endTime, text: body }]
        : [];
    },
  );
}

/** Browser adaptation of the mobile cue parser: VTT, SRT, ASS/SSA and
 * TTML/DFXP are normalized into one WebVTT renderer. */
export function subtitleToWebVtt(text: string, sourceUrl = "") {
  const cleaned = text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n");
  const path = sourceUrl.split(/[?#]/)[0].toLocaleLowerCase();
  const sample = cleaned.slice(0, 4096).toLocaleLowerCase();
  if (
    path.endsWith(".ass") ||
    path.endsWith(".ssa") ||
    (sample.includes("[events]") && sample.includes("dialogue:"))
  )
    return cuesToWebVtt(assCues(cleaned));
  if (
    /\.(?:ttml|dfxp|xml)$/.test(path) ||
    /<tt[\s>]/i.test(cleaned.slice(0, 512))
  )
    return cuesToWebVtt(ttmlCues(cleaned));
  if (path.endsWith(".vtt") || /^\s*WEBVTT/i.test(cleaned))
    return normalizeWebVtt(cleaned);
  return normalizeWebVtt(
    `WEBVTT\n\n${cleaned
      .replace(/^(\d+)\s*$/gm, "")
      .replace(/(\d{2}:\d{2}:\d{2}),([0-9]{3})/g, "$1.$2")}`,
  );
}

export function runtimeSeconds(runtime?: string) {
  if (!runtime) return 0;
  const value = runtime.trim();
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(value)) return timestampSeconds(value);
  const hours = Number(/([\d.]+)\s*(?:h|hr|hour)/i.exec(value)?.[1] ?? 0);
  const minutes = Number(/([\d.]+)\s*(?:m|min|minute)/i.exec(value)?.[1] ?? 0);
  if (hours || minutes) return hours * 3600 + minutes * 60;
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    const number = Number(value);
    return number > 600 ? number : number * 60;
  }
  return 0;
}
