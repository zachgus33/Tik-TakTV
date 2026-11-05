import type { SportKind, SportsEvent } from "./SportsHub";

export type ScoreTeam = {
  id: string;
  name: string;
  shortName: string;
  abbreviation: string;
  logo?: string;
  color?: string;
  score?: string;
  home: boolean;
  winner: boolean;
  record?: string;
};

export type ScoreEvent = {
  id: string;
  sport: SportKind;
  league: string;
  leagueName: string;
  name: string;
  shortName: string;
  start: number;
  state: "pre" | "in" | "post";
  detail: string;
  clock?: string;
  period?: number;
  venue?: string;
  broadcasts: string[];
  teams: ScoreTeam[];
};

const FEEDS: Array<[SportKind, string, string]> = [
  ["football", "football/nfl", "NFL"],
  ["football", "football/college-football", "College Football"],
  ["basketball", "basketball/nba", "NBA"],
  ["basketball", "basketball/wnba", "WNBA"],
  ["basketball", "basketball/mens-college-basketball", "College Basketball"],
  ["hockey", "hockey/nhl", "NHL"],
  ["baseball", "baseball/mlb", "MLB"],
  ["soccer", "soccer/eng.1", "Premier League"],
  ["soccer", "soccer/usa.1", "MLS"],
  ["soccer", "soccer/uefa.champions", "UEFA Champions League"],
  ["fighting", "mma/ufc", "UFC"],
  ["racing", "racing/f1", "Formula 1"],
  ["golf", "golf/pga", "PGA"],
  ["tennis", "tennis/atp", "ATP"],
];

const safeImage = (value: unknown) => {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

export function parseScoreboard(
  raw: unknown,
  sport: SportKind,
  fallbackLeague: string,
): ScoreEvent[] {
  const root = raw as Record<string, any>;
  const leagueName =
    text(root?.leagues?.[0]?.name) ||
    text(root?.leagues?.[0]?.abbreviation) ||
    fallbackLeague;
  return (Array.isArray(root?.events) ? root.events : []).flatMap(
    (event: Record<string, any>) => {
      const competition = event?.competitions?.[0];
      if (!competition) return [];
      const state = text(event?.status?.type?.state);
      const start = Date.parse(text(event.date));
      if (!Number.isFinite(start)) return [];
      const teams: ScoreTeam[] = (
        Array.isArray(competition.competitors) ? competition.competitors : []
      ).map((side: Record<string, any>) => ({
        id: text(side?.team?.id),
        name: text(side?.team?.displayName) || text(side?.team?.name) || "Team",
        shortName:
          text(side?.team?.shortDisplayName) ||
          text(side?.team?.name) ||
          "Team",
        abbreviation: text(side?.team?.abbreviation),
        logo: safeImage(side?.team?.logo),
        color: text(side?.team?.color),
        score: side.score == null ? undefined : String(side.score),
        home: side.homeAway === "home",
        winner: side.winner === true,
        record: text(side?.records?.[0]?.summary) || undefined,
      }));
      const broadcasts = (
        Array.isArray(competition.broadcasts) ? competition.broadcasts : []
      ).flatMap((broadcast: Record<string, any>) =>
        Array.isArray(broadcast.names) ? broadcast.names.map(String) : [],
      );
      return [
        {
          id: text(event.id),
          sport,
          league: text(root?.leagues?.[0]?.slug) || fallbackLeague,
          leagueName,
          name: text(event.name),
          shortName: text(event.shortName) || text(event.name),
          start,
          state: state === "in" || state === "post" ? state : "pre",
          detail:
            text(event?.status?.type?.shortDetail) ||
            text(event?.status?.type?.detail),
          clock: text(event?.status?.displayClock) || undefined,
          period:
            Number(event?.status?.period) > 0
              ? Number(event.status.period)
              : undefined,
          venue: text(competition?.venue?.fullName) || undefined,
          broadcasts: [...new Set<string>(broadcasts)],
          teams,
        } satisfies ScoreEvent,
      ];
    },
  );
}

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set([
  "live",
  "sports",
  "sport",
  "game",
  "match",
  "football",
  "basketball",
  "baseball",
  "hockey",
  "soccer",
  "vs",
  "at",
  "the",
]);

const words = (value: string) =>
  normalize(value)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP.has(word));

export function matchScore(
  event: SportsEvent,
  scores: ScoreEvent[],
): ScoreEvent | undefined {
  const title = normalize(event.title);
  const description = normalize(event.description);
  const titleWords = new Set(words(event.title));
  let best: { value: ScoreEvent; points: number } | undefined;
  for (const score of scores) {
    if (score.sport !== event.sport) continue;
    const hours = Math.abs(score.start - event.start) / 3_600_000;
    if (hours > 8) continue;
    let teamMatches = 0;
    for (const team of score.teams) {
      const names = [team.name, team.shortName, team.abbreviation]
        .map(normalize)
        .filter((name) => name.length >= 3);
      if (names.some((name) => title.includes(name))) teamMatches += 1;
    }
    const scoreWords = new Set(words(`${score.name} ${score.shortName}`));
    const overlap = [...titleWords].filter((word) =>
      scoreWords.has(word),
    ).length;
    const venue = normalize(score.venue ?? "");
    const venueMatch = venue.length >= 5 && description.includes(venue);
    const points = teamMatches * 45 + overlap * 8 + (venueMatch ? 65 : 0) - hours;
    if (
      (teamMatches >= 2 || venueMatch || points >= 50) &&
      (!best || points > best.points)
    )
      best = { value: score, points };
  }
  return best?.value;
}

let cached: { at: number; events: ScoreEvent[] } | undefined;
let pending: Promise<ScoreEvent[]> | undefined;

const date = (time: number) => {
  const value = new Date(time);
  return `${value.getUTCFullYear()}${String(value.getUTCMonth() + 1).padStart(2, "0")}${String(value.getUTCDate()).padStart(2, "0")}`;
};

export function loadSportsScores(force = false): Promise<ScoreEvent[]> {
  if (!force && cached && Date.now() - cached.at < 45_000)
    return Promise.resolve(cached.events);
  if (pending) return pending;
  // ESPN accepts a single YYYYMMDD value here. Its scoreboard API returns 400
  // for the apparent YYYYMMDD-YYYYMMDD range form, which previously left the
  // Sports page with no score cards at all.
  // Scoreboards use the event's US calendar date, while TikTak can be opened
  // after midnight UTC with a guide that is still showing the previous local
  // evening. Query the two dates surrounding the current 24-hour window as
  // separate requests; ESPN rejects its apparent date-range syntax.
  const ranges = [date(Date.now() - 43_200_000), date(Date.now() + 43_200_000)]
    .filter((value, index, values) => values.indexOf(value) === index);
  pending = Promise.allSettled(
    FEEDS.flatMap(([sport, path, name]) => ranges.map(async (range) => {
      const response = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=${range}&limit=500`,
        { headers: { Accept: "application/json" }, cache: "no-store" },
      );
      if (!response.ok) throw new Error(`Score feed ${response.status}`);
      return parseScoreboard(await response.json(), sport, name);
    })),
  )
    .then((results) =>
      results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      ),
    )
    .then((events) => {
      const unique = [...new Map(events.map((event) => [event.id, event])).values()];
      cached = { at: Date.now(), events: unique };
      return unique;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}
