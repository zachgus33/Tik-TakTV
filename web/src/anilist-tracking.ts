import { anilistAccessToken } from "./ExternalTrackingSettings";

type MediaRef = { id?: number; idMal?: number };
type Entry = { id: number; status: string; progress: number; score: number } | null;
type Media = { id: number; episodes: number | null; format: string; mediaListEntry: Entry };

export function anilistMediaRef(id: string): MediaRef | null {
  const direct = /^anilist:(\d+)$/i.exec(id)?.[1];
  if (direct) return { id: Number(direct) };
  const mal = /^mal:(\d+)$/i.exec(id)?.[1];
  return mal ? { idMal: Number(mal) } : null;
}

async function graphql<T>(profile: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const token = anilistAccessToken(profile);
  if (!token) throw new Error("Connect AniList in Settings first.");
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json() as { data?: T; errors?: { message: string }[] };
  if (!response.ok || body.errors?.length || !body.data)
    throw new Error(body.errors?.[0]?.message || `AniList request failed (HTTP ${response.status}).`);
  return body.data;
}

export async function anilistMedia(profile: string, id: string): Promise<Media | null> {
  const ref = anilistMediaRef(id);
  if (!ref) return null;
  const result = await graphql<{ Media: Media | null }>(profile,
    "query($id:Int,$idMal:Int){Media(id:$id,idMal:$idMal,type:ANIME){id episodes format mediaListEntry{id status progress score(format:POINT_10)}}}",
    ref);
  return result.Media;
}

export async function rateAniList(profile: string, id: string, rating: number | null): Promise<void> {
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 10))
    throw new Error("Choose a rating from 1 to 10.");
  const media = await anilistMedia(profile, id);
  if (!media) throw new Error("This title has no AniList anime ID.");
  await graphql(profile,
    "mutation($id:Int!,$scoreRaw:Int!){SaveMediaListEntry(mediaId:$id,scoreRaw:$scoreRaw){id}}",
    { id: media.id, scoreRaw: rating === null ? 0 : rating * 10 });
}

export async function recordAniListEpisode(profile: string, id: string, episode?: number): Promise<void> {
  const media = await anilistMedia(profile, id);
  if (!media) return;
  const watched = media.format === "MOVIE" ? 1 : episode;
  if (!watched || watched <= (media.mediaListEntry?.progress || 0) || media.mediaListEntry?.status === "COMPLETED") return;
  await graphql(profile,
    "mutation($id:Int!,$progress:Int!,$status:MediaListStatus!){SaveMediaListEntry(mediaId:$id,progress:$progress,status:$status){id}}",
    { id: media.id, progress: watched,
      status: media.format === "MOVIE" || (media.episodes && watched >= media.episodes) ? "COMPLETED" : "CURRENT" });
}
