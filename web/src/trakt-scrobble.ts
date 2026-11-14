import type { Episode, Item } from "./types";
import { traktAccessToken, traktClientId, traktScrobblingEnabled } from "./TraktSettings";

type Action = "start" | "pause" | "stop";
type TraktIds = { imdb?: string; tmdb?: number };

export function scrobbleContent(item: Item, episode?: Episode): Record<string, unknown> | null {
  if (item.type === "live") return null;
  const imdb = item.id.match(/(?:^|[^a-z])(?:imdb:)?(tt\d{7,10})(?:$|[^\d])/i)?.[1];
  const tmdb = item.id.match(/(?:^|[^a-z])tmdb:(\d+)(?:$|[^\d])/i)?.[1];
  const ids: TraktIds = imdb ? { imdb } : tmdb ? { tmdb: Number(tmdb) } : {};
  if (!ids.imdb && !ids.tmdb) return null;
  if (item.type === "series") {
    if (!episode || !Number.isInteger(episode.season) || !Number.isInteger(episode.episode)) return null;
    return { show: { ids }, episode: { season: episode.season, number: episode.episode } };
  }
  return { movie: { ids } };
}

export function createTraktScrobbler(item: Item, episode: Episode | undefined, profile: string) {
  const content = scrobbleContent(item, episode);
  let active = false;
  let started = false;
  let stopped = false;
  let pending = Promise.resolve();
  let lastSend = 0;

  const send = (action: Action, progress: number) => {
    if (!content || !profile || !traktScrobblingEnabled(profile)) return;
    const percentage = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
    pending = pending.then(async () => {
      if (!traktScrobblingEnabled(profile)) return;
      const token = await traktAccessToken(profile);
      if (!token || !traktScrobblingEnabled(profile)) return;
      // Trakt permits one authenticated POST per second. Keep event order intact.
      const wait = Math.max(0, 1100 - (Date.now() - lastSend));
      if (wait) await new Promise<void>((resolve) => setTimeout(resolve, wait));
      if (!traktScrobblingEnabled(profile)) return;
      lastSend = Date.now();
      const response = await fetch(`https://api.trakt.tv/scrobble/${action}`, {
        method: "POST",
        keepalive: action === "stop",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "trakt-api-version": "2",
          "trakt-api-key": traktClientId,
        },
        body: JSON.stringify({ ...content, progress: percentage }),
      });
      if (!response.ok) console.warn(`Trakt scrobble ${action} failed (HTTP ${response.status})`);
    }).catch((error) => console.warn("Trakt scrobble failed", error));
  };

  return {
    start(progress: number) {
      if (stopped || active || !content || !traktScrobblingEnabled(profile)) return;
      active = true;
      started = true;
      send("start", progress);
    },
    pause(progress: number) {
      if (stopped || !active) return;
      active = false;
      send("pause", progress);
    },
    stop(progress: number) {
      if (stopped || !started) return;
      stopped = true;
      active = false;
      send("stop", progress);
    },
  };
}
