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
    const body = lines
      .slice(timingIndex + 1)
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
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
