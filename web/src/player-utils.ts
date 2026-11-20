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
      lines.slice(timingIndex + 1).join(" ").replace(/<[^>]+>/g, ""),
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
