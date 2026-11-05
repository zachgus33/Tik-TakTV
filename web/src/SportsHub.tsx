import { useEffect, useMemo, useState } from "react";
import { Heart, Play, Trophy } from "lucide-react";
import type { Item, Programme } from "./types";
import ChannelArt from "./ChannelArt";
import { loadSportsScores, matchScore, type ScoreEvent } from "./sports-scores";

export type SportKind =
  | "football"
  | "basketball"
  | "baseball"
  | "hockey"
  | "soccer"
  | "fighting"
  | "racing"
  | "golf"
  | "tennis"
  | "wrestling"
  | "other";

const SPORTS: {
  id: SportKind;
  label: string;
  icon: string;
  words: string[];
}[] = [
  {
    id: "football",
    label: "Football",
    icon: "🏈",
    words: ["nfl", "ncaa football", "college football", "football"],
  },
  {
    id: "basketball",
    label: "Basketball",
    icon: "🏀",
    words: ["nba", "wnba", "basketball", "march madness"],
  },
  {
    id: "baseball",
    label: "Baseball",
    icon: "⚾",
    words: ["mlb", "baseball", "world series"],
  },
  { id: "hockey", label: "Hockey", icon: "🏒", words: ["nhl", "hockey"] },
  {
    id: "soccer",
    label: "Soccer",
    icon: "⚽",
    words: [
      "soccer",
      "premier league",
      "champions league",
      "mls",
      "fifa",
      "serie a",
      "la liga",
      "bundesliga",
    ],
  },
  {
    id: "fighting",
    label: "Fighting",
    icon: "🥊",
    words: ["ufc", "mma", "boxing", "fight night"],
  },
  {
    id: "racing",
    label: "Racing",
    icon: "🏁",
    words: [
      "nascar",
      "formula 1",
      "formula one",
      "f1",
      "indycar",
      "motogp",
      "racing",
    ],
  },
  {
    id: "golf",
    label: "Golf",
    icon: "⛳",
    words: ["pga", "lpga", "golf", "masters"],
  },
  {
    id: "tennis",
    label: "Tennis",
    icon: "🎾",
    words: ["atp", "wta", "tennis", "wimbledon", "us open"],
  },
  {
    id: "wrestling",
    label: "Wrestling",
    icon: "💪",
    words: ["wwe", "aew", "wrestling", "smackdown", "raw"],
  },
];

export type SportsEvent = {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
  sport: SportKind;
  channels: Item[];
};

const normalized = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const hasPhrase = (text: string, phrase: string) =>
  ` ${text} `.includes(` ${normalized(phrase)} `);

export function isInactiveSportsSlot(title: string, description = "") {
  return /\b(no live sport|no live event|off air|offair|sign off|sendepause|programming unavailable|not currently broadcasting|this is ultra hd|channel is currently inactive)\b/.test(
    normalized(`${title} ${description}`),
  );
}

export function classifySport(
  title: string,
  channel = "",
  category = "",
  description = "",
): SportKind | null {
  const titleText = normalized(title);
  for (const sport of SPORTS)
    if (sport.words.some((word) => hasPhrase(titleText, word)))
      return sport.id;
  // Short guide descriptions can clarify intentionally generic event titles
  // such as NFL RedZone's "Every Sunday Afternoon". Long descriptions often
  // contain scraped site navigation or plot text with incidental sports words,
  // so they must never decide whether an entry belongs in Sports.
  const descriptionText = normalized(description);
  if (descriptionText.length > 0 && descriptionText.length <= 220)
    for (const sport of SPORTS)
      if (sport.words.some((word) => hasPhrase(descriptionText, word)))
        return sport.id;
  const context = normalized(`${channel} ${category}`);
  const matchup = /\b(vs?|versus|at|x)\b/.test(titleText);
  if (matchup)
    for (const sport of SPORTS)
      if (sport.words.some((word) => hasPhrase(context, word)))
        return sport.id;
  if (matchup && /sport|espn|fox|cbs|nbc|tnt|league|cup/.test(context))
    return "other";
  return null;
}

export function buildSportsEvents(
  channels: Item[],
  getPrograms: (channel: Item) => Programme[],
  now: number,
): SportsEvent[] {
  const events = new Map<string, SportsEvent>();
  const horizon = now + 36 * 60 * 60_000;
  for (const channel of channels) {
    for (const programme of getPrograms(channel)) {
      if (programme.end <= now - 2 * 60 * 60_000 || programme.start >= horizon)
        continue;
      if (isInactiveSportsSlot(programme.title, programme.description))
        continue;
      const sport = classifySport(
        programme.title,
        channel.name,
        channel.category,
        programme.description,
      );
      if (!sport) continue;
      const key = `${normalized(programme.title)}:${Math.round(programme.start / 300_000)}`;
      const existing = events.get(key);
      if (existing) {
        if (!existing.channels.some((item) => item.id === channel.id))
          existing.channels.push(channel);
      } else
        events.set(key, {
          id: key,
          title: programme.title,
          description: programme.description,
          start: programme.start,
          end: programme.end,
          sport,
          channels: [channel],
        });
    }
  }
  return [...events.values()].sort((a, b) => {
    const aLive = a.start <= now && a.end > now ? 0 : 1;
    const bLive = b.start <= now && b.end > now ? 0 : 1;
    return aLive - bLive || a.start - b.start;
  });
}

export default function SportsHub({
  channels,
  getPrograms,
  getArtwork,
  now,
  onPlay,
}: {
  channels: Item[];
  getPrograms: (channel: Item) => Programme[];
  getArtwork: (channel: Item) => string | undefined;
  now: number;
  onPlay: (channel: Item) => void;
}) {
  const [sport, setSport] = useState<SportKind | "all">("all");
  const [mine, setMine] = useState(false);
  const [limit, setLimit] = useState(48);
  const [scores, setScores] = useState<ScoreEvent[]>([]);
  const [followed, setFollowed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("tiktak:sports-follows") || "[]");
    } catch {
      return [];
    }
  });
  // Guide listings change slowly. Rebuilding thousands of channel matches on
  // every 30-second clock tick made large IPTV accounts pause periodically.
  const scanNow = Math.floor(now / 900_000) * 900_000;
  const all = useMemo(
    () => buildSportsEvents(channels, getPrograms, scanNow),
    [channels, getPrograms, scanNow],
  );
  const visible = all.filter((event) => {
    if (sport !== "all" && event.sport !== sport) return false;
    return !mine || followed.includes(event.id);
  });
  useEffect(() => setLimit(48), [mine, sport]);
  useEffect(() => {
    let active = true;
    const update = (force = false) =>
      void loadSportsScores(force).then((events) => {
        if (active) setScores(events);
      });
    update();
    const timer = setInterval(() => update(true), 45_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const toggleFollow = (id: string) => {
    const next = followed.includes(id)
      ? followed.filter((item) => item !== id)
      : [...followed, id];
    setFollowed(next);
    localStorage.setItem("tiktak:sports-follows", JSON.stringify(next));
  };
  const displayed = visible.slice(0, limit);
  const live = displayed.filter(
    (event) => event.start <= now && event.end > now,
  );
  const upcoming = displayed.filter((event) => event.start > now);
  return (
    <section className="sports-hub" aria-label="Sports">
      <div className="sports-toolbar">
        <button
          className={mine ? "active" : ""}
          onClick={() => setMine((value) => !value)}
        >
          <Heart size={17} fill={mine ? "currentColor" : "none"} /> My sports
        </button>
        <button
          className={!mine ? "active" : ""}
          onClick={() => setMine(false)}
        >
          <Trophy size={17} /> All events · {visible.length}
        </button>
        <div className="sports-kinds" aria-label="Filter by sport">
          <button
            className={sport === "all" ? "active" : ""}
            onClick={() => setSport("all")}
            aria-label="All sports"
          >
            ★
          </button>
          {SPORTS.map((item) => (
            <button
              key={item.id}
              className={sport === item.id ? "active" : ""}
              onClick={() => setSport(item.id)}
              title={item.label}
              aria-label={item.label}
            >
              {item.icon}
            </button>
          ))}
        </div>
      </div>
      {!visible.length ? (
        <div className="sports-empty">
          <Trophy size={38} />
          <h2>
            {mine
              ? "Follow a game to build My sports"
              : "No sports are listed in this guide window"}
          </h2>
          <p>
            {mine
              ? "Select the heart on any event and it will stay easy to find here."
              : "Sports appear automatically when your IPTV guide lists a live or upcoming event."}
          </p>
        </div>
      ) : (
        <>
          {!!live.length && (
            <EventSection
              title="Live now"
              events={live}
              now={now}
              followed={followed}
              onFollow={toggleFollow}
              onPlay={onPlay}
              getArtwork={getArtwork}
              scores={scores}
            />
          )}
          {!!upcoming.length && (
            <EventSection
              title="Coming up"
              events={upcoming}
              now={now}
              followed={followed}
              onFollow={toggleFollow}
              onPlay={onPlay}
              getArtwork={getArtwork}
              scores={scores}
            />
          )}
          {visible.length > displayed.length && (
            <button
              className="sports-show-more"
              onClick={() => setLimit((value) => value + 48)}
            >
              Show more events · {visible.length - displayed.length} remaining
            </button>
          )}
        </>
      )}
    </section>
  );
}

function EventSection({
  title,
  events,
  now,
  followed,
  onFollow,
  onPlay,
  getArtwork,
  scores,
}: {
  title: string;
  events: SportsEvent[];
  now: number;
  followed: string[];
  onFollow: (id: string) => void;
  onPlay: (channel: Item) => void;
  getArtwork: (channel: Item) => string | undefined;
  scores: ScoreEvent[];
}) {
  return (
    <section className="sports-event-section">
      <div className="sports-section-title">
        <span className="live-dot" /> <h2>{title}</h2>
        <span>{events.length} events</span>
      </div>
      <div className="sports-event-grid">
        {events.map((event) => {
          const kind = SPORTS.find((item) => item.id === event.sport);
          const live = event.start <= now && event.end > now;
          const score = matchScore(event, scores);
          return (
            <article className="sports-event" key={event.id}>
              <div className="sports-event-meta">
                <span>
                  {kind?.icon || "🏅"} {kind?.label || "Sports"}
                </span>
                <time>
                  {live
                    ? "LIVE NOW"
                    : new Date(event.start).toLocaleString([], {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                </time>
              </div>
              <h3>{event.title}</h3>
              {score && <ScoreCard score={score} />}
              {event.description && <p>{event.description}</p>}
              <div className="sports-channels">
                {event.channels.slice(0, 3).map((channel) => (
                  <button
                    key={`${event.id}-${channel.id}`}
                    onClick={() => onPlay(channel)}
                  >
                    <ChannelArt
                      channel={channel}
                      guideArtwork={getArtwork(channel)}
                    />
                    <strong>{channel.name}</strong>
                    <Play size={16} fill="currentColor" />
                  </button>
                ))}
              </div>
              <button
                className="sports-follow"
                onClick={() => onFollow(event.id)}
                aria-label={`${followed.includes(event.id) ? "Unfollow" : "Follow"} ${event.title}`}
              >
                <Heart
                  size={18}
                  fill={followed.includes(event.id) ? "currentColor" : "none"}
                />{" "}
                {followed.includes(event.id) ? "Following" : "Follow"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ScoreCard({ score }: { score: ScoreEvent }) {
  const teams = [...score.teams].sort(
    (a, b) => Number(a.home) - Number(b.home),
  );
  return (
    <div className={`sports-score sports-score-${score.state}`}>
      <div className="sports-score-league">
        <span>{score.leagueName}</span>
        <strong>
          {score.detail || (score.state === "in" ? "LIVE" : "Scheduled")}
        </strong>
      </div>
      {teams.map((team) => (
        <div
          className="sports-score-team"
          key={`${score.id}-${team.id}-${team.home}`}
        >
          {team.logo ? (
            <img src={team.logo} alt="" />
          ) : (
            <span>{team.abbreviation.slice(0, 3)}</span>
          )}
          <strong>{team.shortName}</strong>
          {team.record && <small>{team.record}</small>}
          <b>{team.score ?? "—"}</b>
        </div>
      ))}
      {(score.venue || score.broadcasts.length > 0) && (
        <div className="sports-score-foot">
          {[score.venue, score.broadcasts.join(" · ")]
            .filter(Boolean)
            .join(" · ")}
        </div>
      )}
    </div>
  );
}
