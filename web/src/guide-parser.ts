import { SaxesParser } from "saxes";
import type { Programme } from "./types";

export function xmltvTime(value: string): number {
  const match =
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*(?:([+-])(\d{2})(\d{2}))?$/.exec(
      value.trim(),
    );
  if (!match) return NaN;
  const [, y, m, d, h, min, s, sign, oh, om] = match;
  const offset = sign
    ? (Number(oh) * 60 + Number(om)) * (sign === "+" ? 1 : -1)
    : 0;
  return Date.UTC(+y, +m - 1, +d, +h, +min, +(s ?? 0)) - offset * 60_000;
}
export type GuideTargets = { ids?: string[]; names?: string[] };

export function createGuideParser(now = Date.now(), targets: GuideTargets = {}) {
  const programmes: Record<string, Programme[]> = Object.create(null);
  const aliases: Record<string, string> = Object.create(null);
  const artwork: Record<string, string> = Object.create(null);
  const parser = new SaxesParser({ xmlns: false });
  let current: (Programme & { channel: string }) | null = null;
  let field = "";
  let text = "";
  let count = 0;
  let channelId = "";
  let channelName = "";
  const targetIds = new Set((targets.ids ?? []).filter(Boolean));
  const normalizedTargetIds = new Set(
    (targets.ids ?? []).map(normalizeGuideTarget).filter(Boolean),
  );
  const targetNames = new Set((targets.names ?? []).map(normalizeGuideTarget).filter(Boolean));
  const includedChannelIds = new Set<string>();
  const dirtyProgrammeIds = new Set<string>();
  const dirtyAliases: Record<string, string> = Object.create(null);
  const dirtyArtwork: Record<string, string> = Object.create(null);
  const targeted = targetIds.size > 0 || targetNames.size > 0;
  parser.on("opentag", (tag) => {
    if (tag.name === "channel") {
      channelId = String(tag.attributes.id ?? "");
      channelName = "";
    }
    if (channelId && tag.name === "icon") {
      const source = String(tag.attributes.src ?? "").trim();
      if (source) {
        artwork[channelId] = source;
        dirtyArtwork[channelId] = source;
      }
    }
    if (tag.name === "programme") {
      const channel = String(tag.attributes.channel ?? "");
      const start = xmltvTime(String(tag.attributes.start ?? ""));
      const end = xmltvTime(String(tag.attributes.stop ?? ""));
      current =
        channel &&
        (!targeted ||
          targetIds.has(channel) ||
          normalizedTargetIds.has(normalizeGuideTarget(channel)) ||
          includedChannelIds.has(channel)) &&
        end > now &&
        start < now + 24 * 3600_000 &&
        end > start &&
        count < 500_000
          ? {
              id: `${channel}:${start}`,
              channel,
              start,
              end,
              title: "",
              description: "",
            }
          : null;
    }
    if (
      (current && (tag.name === "title" || tag.name === "desc")) ||
      (channelId && tag.name === "display-name")
    ) {
      field = tag.name;
      text = "";
    }
  });
  const append = (part: string) => {
    if (field) text = (text + part).slice(0, 3000);
  };
  parser.on("text", append);
  parser.on("cdata", append);
  parser.on("closetag", (tag) => {
    if (current && tag.name === field) {
      if (field === "title" && !current.title) current.title = text.trim();
      if (field === "desc" && !current.description)
        current.description = text.trim();
      field = "";
      text = "";
    }
    if (channelId && tag.name === "display-name" && field === "display-name") {
      if (!channelName) channelName = text.trim();
      field = "";
      text = "";
    }
    if (tag.name === "channel" && channelId) {
      const included =
        !targeted ||
        targetIds.has(channelId) ||
        normalizedTargetIds.has(normalizeGuideTarget(channelId)) ||
        targetNames.has(normalizeGuideTarget(channelName));
      if (included) {
        includedChannelIds.add(channelId);
        aliases[channelId] = channelId;
        dirtyAliases[channelId] = channelId;
        if (channelName) aliases[channelName] = channelId;
        if (channelName) dirtyAliases[channelName] = channelId;
      } else {
        delete artwork[channelId];
      }
      channelId = "";
      channelName = "";
    }
    if (tag.name === "programme" && current) {
      const { channel, ...programme } = current;
      const list = programmes[channel] ?? (programmes[channel] = []);
      if (list.length < 40) {
        list.push(programme);
        dirtyProgrammeIds.add(channel);
        count++;
      }
      current = null;
    }
  });
  return {
    write(chunk: string) {
      parser.write(chunk);
    },
    finish() {
      parser.close();
      for (const list of Object.values(programmes))
        list.sort((a, b) => a.start - b.start);
      return programmes;
    },
    aliases() {
      return aliases;
    },
    artwork() {
      return artwork;
    },
    drain() {
      const changedProgrammes: Record<string, Programme[]> = Object.create(null);
      for (const id of dirtyProgrammeIds) changedProgrammes[id] = programmes[id];
      dirtyProgrammeIds.clear();
      const changedAliases = { ...dirtyAliases };
      const changedArtwork = { ...dirtyArtwork };
      for (const key of Object.keys(dirtyAliases)) delete dirtyAliases[key];
      for (const key of Object.keys(dirtyArtwork)) delete dirtyArtwork[key];
      return {
        programmes: changedProgrammes,
        aliases: changedAliases,
        artwork: changedArtwork,
      };
    },
  };
}

function normalizeGuideTarget(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/^\s*[a-z]{2,3}\s*[|:\-]\s*/i, "")
    .replace(/\b(?:uhd|fhd|hd|sd|4k|1080p|720p|raw)\b/gi, "")
    .replace(/[^a-z0-9]+/g, "");
}
