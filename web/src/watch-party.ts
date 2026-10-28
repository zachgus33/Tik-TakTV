import { serviceRequest } from "./connection";
import type { Playback } from "./Player";

export type PartyState = {
  position: number;
  paused: boolean;
  updatedAt: number;
  serverTime: number;
  revision: number;
};

export type PartySession = {
  id: string;
  host: boolean;
  participants: number;
  playback: Playback;
  state: PartyState;
};

async function partyRequest<T>(body: Record<string, unknown>) {
  const response = await serviceRequest("/party", body);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(data.error || `Watch Together returned HTTP ${response.status}.`);
  return data;
}

export function createParty(
  playback: Playback,
  position: number,
  paused: boolean,
) {
  return partyRequest<PartySession>({
    action: "create",
    playback,
    position,
    paused,
  });
}

export function joinParty(id: string) {
  return partyRequest<PartySession>({ action: "join", id });
}

export function partyState(
  id: string,
  update?: { position: number; paused: boolean },
) {
  return partyRequest<PartySession>({ action: "state", id, update });
}

export function partyLink(id: string) {
  const url = new URL(location.href);
  url.searchParams.set("party", id);
  url.hash = "home";
  return url.href;
}
