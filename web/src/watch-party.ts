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
  members?: PartyMember[];
  playback: Playback;
  state: PartyState;
};

export type PartyMember = {
  key: string;
  name: string;
  avatar?: string;
  host: boolean;
  self: boolean;
};

export type PartyIdentity = { name: string; avatar?: string };

async function partyRequest<T>(body: Record<string, unknown>) {
  const response = await serviceRequest("/party", body);
  const data = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(
      data.error || `Watch Together returned HTTP ${response.status}.`,
    );
  return data;
}

export function createParty(
  playback: Playback,
  position: number,
  paused: boolean,
  member: PartyIdentity,
) {
  const lastCreated = Number(
    sessionStorage.getItem("tiktak:last-party-create") ?? 0,
  );
  if (Date.now() - lastCreated < 5000)
    return Promise.reject(
      new Error(
        "Please wait a few seconds before creating another Watch Together room.",
      ),
    );
  sessionStorage.setItem("tiktak:last-party-create", String(Date.now()));
  return partyRequest<PartySession>({
    action: "create",
    playback,
    position,
    paused,
    member,
  });
}

export function joinParty(id: string, member: PartyIdentity) {
  return partyRequest<PartySession>({ action: "join", id, member });
}

export function partyState(
  id: string,
  update?: { position: number; paused: boolean },
  member?: PartyIdentity,
) {
  return partyRequest<PartySession>({ action: "state", id, update, member });
}

export function endParty(id: string) {
  return partyRequest<{ ok: true; ended: true }>({ action: "end", id });
}

export function removePartyMember(id: string, memberKey: string) {
  return partyRequest<PartySession>({ action: "kick", id, memberKey });
}

export function partyLink(id: string) {
  const url = new URL(location.href);
  url.searchParams.set("party", id);
  url.hash = "home";
  return url.href;
}
