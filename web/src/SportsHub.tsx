import {
  memo,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Heart, Play, Trophy } from "lucide-react";
import type { Item, Programme } from "./types";
import ChannelArt from "./ChannelArt";
import {
  loadSportsScores,
  matchScore,
  matchScoreToGuideEvent,
  type ScoreEvent,
} from "./sports-scores";

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
    words: ["pga", "lpga", "golf"],
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
  if (
    /\b(news|newscast|weather|teleshopping|shopping|basketball wives|movie|documentary|documentaries)\b/.test(
      titleText,
    )
  )
    return null;
  // "Masters" appears in many ordinary show and music titles. Only treat it
  // as golf when the title explicitly identifies the tournament.
  if (/^(?:the )?masters(?: golf| tournament)?$/.test(titleText)) return "golf";
  for (const sport of SPORTS)
    if (sport.words.some((word) => hasPhrase(titleText, word))) return sport.id;
  const context = normalized(`${channel} ${category}`);
  const sportsContext =
    /\b(sport|sports|espn|ppv|redzone)\b/.test(context) ||
    SPORTS.some((sport) =>
      sport.words.some((word) => hasPhrase(context, word)),
    );
  // Short guide descriptions can clarify intentionally generic event titles
  // such as NFL RedZone's "Every Sunday Afternoon". Long descriptions often
  // contain scraped site navigation or plot text with incidental sports words,
  // so they must never decide whether an entry belongs in Sports.
  const descriptionText = normalized(description);
  const eventDescription =
    descriptionText.length > 0 &&
    descriptionText.length <= 220 &&
    /\b(live|game|match|action|coverage|round|tournament|championship|season|race|racing|league|tour|final)\b/.test(
      descriptionText,
    );
  if (eventDescription)
    for (const sport of SPORTS) {
      const word = sport.words.find((candidate) =>
        hasPhrase(descriptionText, candidate),
      );
      if (!word) continue;
      const phrase = normalized(word).replace(/\s+/g, "\\s+");
      const specific =
        /^(nfl|nba|wnba|mlb|nhl|ufc|mma|pga|lpga|atp|wta|wwe|aew|mls|fifa|nascar|indycar|motogp|f1)$/i.test(
          word,
        );
      const eventWord =
        "game|match|action|coverage|round|tournament|championship|season|league|tour|final|race|racing";
      if (
        specific ||
        (sportsContext &&
          (new RegExp(`\\b${phrase}\\b.{0,12}\\b(?:${eventWord})\\b`).test(
            descriptionText,
          ) ||
            new RegExp(`\\b(?:${eventWord})\\b.{0,12}\\b${phrase}\\b`).test(
              descriptionText,
            )))
      )
        return sport.id;
    }
  const matchup = /\b(vs?|versus|x)\b/.test(titleText);
  if (matchup)
    for (const sport of SPORTS)
      if (sport.words.some((word) => hasPhrase(context, word))) return sport.id;
  if (matchup && /sport|espn|league|cup/.test(context)) return "other";
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

export function prioritizeLiveScoreEvents(
  events: SportsEvent[],
  scores: ScoreEvent[],
  now: number,
  maximum = 12,
) {
  const scoreByEvent = new Map<string, ScoreEvent>();
  for (const event of events) {
    const score = matchScore(event, scores);
    if (score) scoreByEvent.set(event.id, score);
  }
  const liveScores = events
    .filter((event) => {
      const score = scoreByEvent.get(event.id);
      return (
        event.start <= now &&
        event.end > now &&
        score?.state === "in" &&
        score.teams.some((team) => team.score !== undefined)
      );
    })
    .slice(0, maximum);
  const priorityIds = new Set(liveScores.map((event) => event.id));
  return {
    liveScores,
    remaining: events.filter((event) => !priorityIds.has(event.id)),
    scoreByEvent,
  };
}

export function standaloneScoreEvents(
  scores: ScoreEvent[],
  matchedScoreIds: Set<string>,
  now: number,
  sport: SportKind | "all" = "all",
  maximum = 48,
) {
  const windowStart = now - 12 * 60 * 60_000;
  const windowEnd = now + 48 * 60 * 60_000;
  const statePriority: Record<ScoreEvent["state"], number> = {
    in: 0,
    pre: 1,
    post: 2,
  };
  return scores
    .filter(
      (score) =>
        !matchedScoreIds.has(score.id) &&
        score.start >= windowStart &&
        score.start < windowEnd &&
        (sport === "all" || score.sport === sport),
    )
    .sort(
      (a, b) =>
        statePriority[a.state] - statePriority[b.state] || a.start - b.start,
    )
    .slice(0, maximum);
}

function SportsHub({
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
  const [all, setAll] = useState<SportsEvent[]>([]);
  const [scanning, setScanning] = useState(true);
  const [scores, setScores] = useState<ScoreEvent[]>([]);
  const hasEvents = useRef(false);
  const scoreFingerprint = useRef("");
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
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let idle: number | undefined;
    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    let cursor = 0;
    const merged = new Map<string, SportsEvent>();
    // Keep the current results mounted while guide data refreshes. Clearing
    // the list made Sports look like the whole page reloaded and moved people
    // away from the event they were browsing.
    if (!hasEvents.current) setScanning(true);
    const schedule = () => {
      if (typeof idleWindow.requestIdleCallback === "function") {
        idle = idleWindow.requestIdleCallback(consume, { timeout: 120 });
      } else {
        // Older Android/Fire TV WebViews need an actual frame between slices.
        timer = globalThis.setTimeout(consume, 16);
      }
    };
    const consume = () => {
      if (cancelled) return;
      // Yield between small guide slices. Large IPTV accounts can contain
      // thousands of channels; scanning all of them in one render used to
      // freeze both browsers and Android/Fire TV WebViews.
      const batch = buildSportsEvents(
        channels.slice(cursor, cursor + 80),
        getPrograms,
        scanNow,
      );
      for (const event of batch) {
        const existing = merged.get(event.id);
        if (existing) {
          for (const channel of event.channels)
            if (!existing.channels.some((item) => item.id === channel.id))
              existing.channels.push(channel);
        } else merged.set(event.id, event);
      }
      cursor += 80;
      if (cursor < channels.length) {
        schedule();
        return;
      }
      const next = [...merged.values()].sort((a, b) => {
        const aLive = a.start <= scanNow && a.end > scanNow ? 0 : 1;
        const bLive = b.start <= scanNow && b.end > scanNow ? 0 : 1;
        return aLive - bLive || a.start - b.start;
      });
      hasEvents.current = next.length > 0;
      startTransition(() => {
        setAll(next);
        setScanning(false);
      });
    };
    schedule();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      if (idle !== undefined) idleWindow.cancelIdleCallback?.(idle);
    };
  }, [channels, getPrograms, scanNow]);
  const visible = useMemo(
    () =>
      all.filter((event) => {
        if (sport !== "all" && event.sport !== sport) return false;
        return !mine || followed.includes(event.id);
      }),
    [all, followed, mine, sport],
  );
  useEffect(() => setLimit(48), [mine, sport]);
  useEffect(() => {
    let active = true;
    const update = (force = false) => {
      if (force && document.visibilityState !== "visible") return;
      void loadSportsScores(force).then((events) => {
        if (!active) return;
        const fingerprint = events
          .map((event) =>
            [
              event.id,
              event.state,
              event.detail,
              ...event.teams.map((team) => team.score ?? ""),
            ].join(":"),
          )
          .join("|");
        if (fingerprint === scoreFingerprint.current) return;
        scoreFingerprint.current = fingerprint;
        startTransition(() => setScores(events));
      });
    };
    update();
    const timer = setInterval(() => update(true), 60_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") update(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const toggleFollow = (id: string) => {
    const next = followed.includes(id)
      ? followed.filter((item) => item !== id)
      : [...followed, id];
    setFollowed(next);
    localStorage.setItem("tiktak:sports-follows", JSON.stringify(next));
  };
  // A scored game can otherwise be buried after hundreds of generic sports
  // listings. Pull genuinely live, score-bearing matches into a priority row
  // before applying the progressive-render limit to everything else.
  const { liveScores, remaining, scoreByEvent } = useMemo(
    () => prioritizeLiveScoreEvents(visible, scores, now),
    [now, scores, visible],
  );
  const standaloneScoreCandidates = useMemo(() => {
    if (mine) return [];
    const matchedScoreIds = new Set(
      [...scoreByEvent.values()].map((score) => score.id),
    );
    return standaloneScoreEvents(scores, matchedScoreIds, now, sport);
  }, [mine, now, scoreByEvent, scores, sport]);
  const standaloneGuideMatches = useMemo(() => {
    const matches = new Map<string, SportsEvent>();
    for (const score of standaloneScoreCandidates) {
      const event = matchScoreToGuideEvent(score, all);
      if (event) matches.set(score.id, event);
    }
    return matches;
  }, [all, standaloneScoreCandidates]);
  const standaloneScores = useMemo(
    () =>
      [...standaloneScoreCandidates].sort(
        (a, b) =>
          Number(!standaloneGuideMatches.has(a.id)) -
          Number(!standaloneGuideMatches.has(b.id)),
      ),
    [standaloneGuideMatches, standaloneScoreCandidates],
  );
  const eventCount = visible.length + standaloneScores.length;
  const displayed = remaining.slice(0, limit);
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
          <Trophy size={17} /> All events · {eventCount}
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
      {scanning && !standaloneScores.length ? (
        <div className="sports-empty" role="status">
          <Trophy size={38} />
          <h2>Finding games in your guide…</h2>
          <p>You can keep using TikTak TV while Sports checks your channels.</p>
        </div>
      ) : !visible.length && !standaloneScores.length ? (
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
          {!!standaloneScores.length && (
            <ScoreboardSection
              scores={standaloneScores}
              guideMatches={standaloneGuideMatches}
              onPlay={onPlay}
              getArtwork={getArtwork}
            />
          )}
          {scanning && (
            <p className="sports-scan-note" role="status">
              Checking your TV guide for channels that carry these games…
            </p>
          )}
          {!!liveScores.length && (
            <EventSection
              title="Live scores"
              events={liveScores}
              now={now}
              followed={followed}
              onFollow={toggleFollow}
              onPlay={onPlay}
              getArtwork={getArtwork}
              scoreByEvent={scoreByEvent}
              priority
            />
          )}
          {!!live.length && (
            <EventSection
              title="Live now"
              events={live}
              now={now}
              followed={followed}
              onFollow={toggleFollow}
              onPlay={onPlay}
              getArtwork={getArtwork}
              scoreByEvent={scoreByEvent}
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
              scoreByEvent={scoreByEvent}
            />
          )}
          {remaining.length > displayed.length && (
            <button
              className="sports-show-more"
              onClick={() => setLimit((value) => value + 48)}
            >
              Show more events · {remaining.length - displayed.length} remaining
            </button>
          )}
        </>
      )}
    </section>
  );
}

function ScoreboardSection({
  scores,
  guideMatches,
  onPlay,
  getArtwork,
}: {
  scores: ScoreEvent[];
  guideMatches: Map<string, SportsEvent>;
  onPlay: (channel: Item) => void;
  getArtwork: (channel: Item) => string | undefined;
}) {
  return (
    <section className="sports-event-section" aria-label="Scores and schedules">
      <div className="sports-section-title">
        <span className="live-dot" /> <h2>Scores &amp; schedules</h2>
        <span>{scores.length} events</span>
      </div>
      <div className="sports-event-grid">
        {scores.map((score) => {
          const kind = SPORTS.find((item) => item.id === score.sport);
          const guideMatch = guideMatches.get(score.id);
          return (
            <article className="sports-event" key={`score-${score.id}`}>
              <div className="sports-event-meta">
                <span>
                  {kind?.icon || "🏅"} {kind?.label || "Sports"}
                </span>
                <time>
                  {score.state === "in"
                    ? "LIVE NOW"
                    : new Date(score.start).toLocaleString([], {
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                </time>
              </div>
              <h3>{score.shortName || score.name}</h3>
              <ScoreCard score={score} />
              {guideMatch ? (
                <div className="sports-channels">
                  {guideMatch.channels.slice(0, 3).map((channel) => (
                    <button
                      key={`score-${score.id}-${channel.id}`}
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
              ) : (
                <p>Score and schedule only · no matching channel in your guide.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

// Player window changes and unrelated app state must not rerender a Sports
// result tree that can represent thousands of guide entries.
export default memo(SportsHub);

function EventSection({
  title,
  events,
  now,
  followed,
  onFollow,
  onPlay,
  getArtwork,
  scoreByEvent,
  priority = false,
}: {
  title: string;
  events: SportsEvent[];
  now: number;
  followed: string[];
  onFollow: (id: string) => void;
  onPlay: (channel: Item) => void;
  getArtwork: (channel: Item) => string | undefined;
  scoreByEvent: Map<string, ScoreEvent>;
  priority?: boolean;
}) {
  return (
    <section
      className={`sports-event-section${priority ? " sports-score-priority" : ""}`}
      aria-label={title}
    >
      <div className="sports-section-title">
        <span className="live-dot" /> <h2>{title}</h2>
        <span>{events.length} events</span>
      </div>
      <div className="sports-event-grid">
        {events.map((event) => {
          const kind = SPORTS.find((item) => item.id === event.sport);
          const live = event.start <= now && event.end > now;
          const score = scoreByEvent.get(event.id);
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
