import type { Episode, Item } from "./types";
import { simklRequest, simklScrobblingEnabled } from "./ExternalTrackingSettings";

type Action = "start" | "pause" | "stop";
const queues = new Map<string, { pending: Promise<void>; lastSend: number }>();

export function simklScrobbleContent(item: Item, episode?: Episode): Record<string, unknown> | null {
  if (item.type === "live") return null;
  const imdb = item.id.match(/(?:^|[^a-z])(?:imdb:)?(tt\d{7,10})(?:$|[^\d])/i)?.[1];
  const tmdb = item.id.match(/(?:^|[^a-z])tmdb:(\d+)(?:$|[^\d])/i)?.[1];
  const simkl = item.id.match(/(?:^|[^a-z])simkl:(\d+)(?:$|[^\d])/i)?.[1];
  const ids = imdb ? { imdb } : tmdb ? { tmdb } : simkl ? { simkl } : null;
  if (!ids) return null;
  const media = { title: item.name, ...(item.year ? { year: Number(item.year) } : {}), ids };
  if (item.type === "series") {
    if (!episode || !Number.isInteger(episode.season) || !Number.isInteger(episode.episode)) return null;
    return { show: media, episode: { season: episode.season, number: episode.episode } };
  }
  return { movie: media };
}

export function createSimklScrobbler(item: Item, episode: Episode | undefined, profile: string) {
  const content = simklScrobbleContent(item, episode);
  let active = false;
  let started = false;
  let stopped = false;
  const send = (action: Action, progress: number) => {
    if (!content || !profile || !simklScrobblingEnabled(profile)) return;
    const queue = queues.get(profile) || { pending: Promise.resolve(), lastSend: 0 };
    queues.set(profile, queue);
    queue.pending = queue.pending.then(async () => {
      if (!simklScrobblingEnabled(profile)) return;
      // Simkl serializes scrobbles per user with a 20-second lock.
      const wait = Math.max(0, 21_000 - (Date.now() - queue.lastSend));
      if (wait) await new Promise<void>(resolve => setTimeout(resolve, wait));
      if (!simklScrobblingEnabled(profile)) return;
      queue.lastSend = Date.now();
      await simklRequest(profile, `/scrobble/${action}`, {
        ...content, progress: Math.round(Math.min(100, Math.max(0, progress)) * 100) / 100,
      });
    }).catch(error => console.warn("Simkl scrobble failed", error));
  };
  return {
    start(progress: number) { if (stopped || active || !content) return; active = true; started = true; send("start", progress); },
    pause(progress: number) { if (stopped || !active) return; active = false; send("pause", progress); },
    stop(progress: number) { if (stopped || !started) return; stopped = true; active = false; send("stop", progress); },
  };
}
