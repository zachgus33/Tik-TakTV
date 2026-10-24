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
export function createGuideParser(now = Date.now()) {
  const programmes: Record<string, Programme[]> = Object.create(null);
  const aliases: Record<string, string> = Object.create(null);
  const parser = new SaxesParser({ xmlns: false });
  let current: (Programme & { channel: string }) | null = null;
  let field = "";
  let text = "";
  let count = 0;
  let channelId = "";
  let channelName = "";
  parser.on("opentag", (tag) => {
    if (tag.name === "channel") {
      channelId = String(tag.attributes.id ?? "");
      channelName = "";
    }
    if (tag.name === "programme") {
      const channel = String(tag.attributes.channel ?? "");
      const start = xmltvTime(String(tag.attributes.start ?? ""));
      const end = xmltvTime(String(tag.attributes.stop ?? ""));
      current =
        channel &&
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
      aliases[channelId] = channelId;
      if (channelName) aliases[channelName] = channelId;
      channelId = "";
      channelName = "";
    }
    if (tag.name === "programme" && current) {
      const { channel, ...programme } = current;
      const list = programmes[channel] ?? (programmes[channel] = []);
      if (list.length < 40) {
        list.push(programme);
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
  };
}
