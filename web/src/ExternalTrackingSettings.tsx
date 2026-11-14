import { useEffect, useState } from "react";

export const simklWebClientId = "adc2981e4eca8f5811f0a8fd4319ab1e93505388be698fdab9b3d0c1a7e9a70a";
export const anilistClientId = "56991";
const simklRedirect = "https://www.tiktaktv.me/simkl-callback.html";
const anilistRedirect = "https://www.tiktaktv.me/anilist-callback.html";
type Provider = "simkl" | "anilist";
type SimklToken = { access_token: string; refresh_token: string; expires_in: number; scope: string; saved_at: number };
type AniListToken = { access_token: string; expires_at: number };
const key = (provider: Provider, profile: string) => `tiktak:${provider}:${encodeURIComponent(profile)}`;
const pendingKey = (provider: Provider) => `tiktak:${provider}-pending`;
const callbackKey = (provider: Provider) => `tiktak:${provider}-callback`;

function load<T>(provider: Provider, profile: string): T | null {
  try { return JSON.parse(localStorage.getItem(key(provider, profile)) || "null") as T | null; }
  catch { return null; }
}

function random() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function simklTokenRequest(params: Record<string, string>): Promise<SimklToken> {
  const response = await fetch("https://api.simkl.com/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: simklWebClientId, ...params }),
  });
  if (!response.ok) throw new Error(`Simkl sign-in failed (HTTP ${response.status}).`);
  const value = await response.json() as Omit<SimklToken, "saved_at">;
  if (!value.scope?.includes("media:write")) throw new Error("Simkl did not grant tracking access. Connect again.");
  return { ...value, saved_at: Date.now() };
}

export async function simklAccessToken(profile: string): Promise<string | null> {
  const value = load<SimklToken>("simkl", profile);
  if (!value) return null;
  if (value.saved_at + value.expires_in * 1000 > Date.now() + 60_000) return value.access_token;
  const fresh = await simklTokenRequest({ grant_type: "refresh_token", refresh_token: value.refresh_token });
  localStorage.setItem(key("simkl", profile), JSON.stringify(fresh));
  return fresh.access_token;
}

export function anilistAccessToken(profile: string): string | null {
  const value = load<AniListToken>("anilist", profile);
  return value && value.expires_at > Date.now() ? value.access_token : null;
}

const scrobbleKey = (provider: Provider, profile: string) =>
  `tiktak:${provider}-scrobble:${encodeURIComponent(profile)}`;
export function simklScrobblingEnabled(profile: string): boolean {
  return localStorage.getItem(scrobbleKey("simkl", profile)) === "1";
}
export function anilistProgressEnabled(profile: string): boolean {
  return localStorage.getItem(scrobbleKey("anilist", profile)) === "1";
}

export async function simklRequest(profile: string, path: string, body?: unknown): Promise<Response> {
  const token = await simklAccessToken(profile);
  if (!token) throw new Error("Connect Simkl in Settings first.");
  const url = new URL(`https://api.simkl.com${path}`);
  url.searchParams.set("client_id", simklWebClientId);
  url.searchParams.set("app-name", "TikTak TV Web");
  url.searchParams.set("app-version", "1.0");
  const response = await fetch(url.href, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`Simkl request failed (HTTP ${response.status}).`);
  return response;
}

export default function ExternalTrackingSettings({ profileName, provider }: { profileName: string; provider: Provider }) {
  const [connected, setConnected] = useState(() => !!load(provider, profileName));
  const [account, setAccount] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scrobbling, setScrobbling] = useState(() => provider === "simkl" ?
    simklScrobblingEnabled(profileName) : anilistProgressEnabled(profileName));
  const name = provider === "simkl" ? "Simkl" : "AniList";

  useEffect(() => { setConnected(!!load(provider, profileName)); setAccount(""); setError("");
    setScrobbling(provider === "simkl" ? simklScrobblingEnabled(profileName) : anilistProgressEnabled(profileName)); }, [provider, profileName]);

  useEffect(() => {
    const raw = localStorage.getItem(callbackKey(provider));
    if (!raw) return;
    localStorage.removeItem(callbackKey(provider));
    const pendingRaw = localStorage.getItem(pendingKey(provider));
    localStorage.removeItem(pendingKey(provider));
    if (!pendingRaw) { setError(`${name} sign-in expired. Try again.`); return; }
    try {
      const pending = JSON.parse(pendingRaw) as { profile: string; state: string; verifier?: string; createdAt: number };
      const result = JSON.parse(raw) as { access_token?: string; expires_in?: string; token_type?: string; code?: string; state?: string; iss?: string; error?: string };
      if (pending.profile !== profileName || Date.now() - pending.createdAt > 10 * 60_000 || result.state !== pending.state)
        throw new Error(`${name} sign-in could not be verified. Try again.`);
      if (result.error) throw new Error(`${name} sign-in was cancelled.`);
      if (provider === "simkl") {
        if (result.iss !== "https://simkl.com" || !result.code || !pending.verifier)
          throw new Error("Simkl sign-in response was invalid.");
        setBusy(true);
        void simklTokenRequest({ grant_type: "authorization_code", code: result.code,
          redirect_uri: simklRedirect, code_verifier: pending.verifier })
          .then(value => { localStorage.setItem(key(provider, profileName), JSON.stringify(value)); setConnected(true); })
          .catch(cause => setError(cause instanceof Error ? cause.message : "Simkl sign-in failed."))
          .finally(() => setBusy(false));
      } else {
        if (!result.access_token || result.token_type?.toLowerCase() !== "bearer")
          throw new Error("AniList sign-in response was invalid.");
        const expires = Number(result.expires_in);
        if (!Number.isFinite(expires) || expires <= 0) throw new Error("AniList token lifetime was invalid.");
        localStorage.setItem(key(provider, profileName), JSON.stringify({ access_token: result.access_token,
          expires_at: Date.now() + expires * 1000 } satisfies AniListToken));
        setConnected(true);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : `${name} sign-in failed.`); }
  }, [name, profileName, provider]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    const run = async () => {
      if (provider === "simkl") {
        const response = await simklRequest(profileName, "/users/settings");
        const value = await response.json() as { user?: { name?: string } };
        if (active) setAccount(value.user?.name || "your Simkl account");
      } else {
        const token = anilistAccessToken(profileName);
        if (!token) { if (active) setConnected(false); return; }
        const response = await fetch("https://graphql.anilist.co", { method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query: "query { Viewer { name } }" }) });
        if (!response.ok) throw new Error(`AniList account check failed (HTTP ${response.status}).`);
        const value = await response.json() as { data?: { Viewer?: { name?: string } } };
        if (active) setAccount(value.data?.Viewer?.name || "your AniList account");
      }
    };
    void run().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : `${name} is unavailable.`); });
    return () => { active = false; };
  }, [connected, name, profileName, provider]);

  async function connect() {
    setError("");
    if (location.origin !== "https://www.tiktaktv.me") { location.assign("https://www.tiktaktv.me/#settings"); return; }
    const state = random();
    const pending: { profile: string; state: string; verifier?: string; createdAt: number } =
      { profile: profileName, state, createdAt: Date.now() };
    if (provider === "simkl") {
      const verifier = random() + random();
      pending.verifier = verifier;
      const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      const challenge = btoa(String.fromCharCode(...hash)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      localStorage.setItem(pendingKey(provider), JSON.stringify(pending));
      const url = new URL("https://simkl.com/oauth2/authorize");
      Object.entries({ client_id: simklWebClientId, redirect_uri: simklRedirect, response_type: "code",
        scope: "media:read media:write", state, code_challenge: challenge, code_challenge_method: "S256" })
        .forEach(([k, v]) => url.searchParams.set(k, v));
      location.assign(url.href);
    } else {
      localStorage.setItem(pendingKey(provider), JSON.stringify(pending));
      const url = new URL("https://anilist.co/api/v2/oauth/authorize");
      Object.entries({ client_id: anilistClientId, redirect_uri: anilistRedirect,
        response_type: "token", state }).forEach(([k, v]) => url.searchParams.set(k, v));
      location.assign(url.href);
    }
  }

  async function disconnect() {
    const token = provider === "simkl" ? await simklAccessToken(profileName).catch(() => null) : null;
    localStorage.removeItem(key(provider, profileName));
    localStorage.removeItem(scrobbleKey(provider, profileName));
    setScrobbling(false);
    setConnected(false); setAccount(""); setError("");
    if (token) void fetch("https://api.simkl.com/oauth2/revoke", { method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: simklWebClientId, token }) }).catch(() => undefined);
  }

  return <section className="settings-card">
    <div className="card-heading"><div><h2>{name}</h2><p>{provider === "simkl"
      ? "Optional movie, show and anime tracking for this profile."
      : "Optional anime list tracking for this profile."}</p></div></div>
    <p>{name} is separate from Trakt and your Nuvio watch history. Each profile connects its own account.</p>
    {connected ? <><p>Connected as <strong>{account || `your ${name} account`}</strong>.</p>
      {provider === "simkl" && <label className="check"><input type="checkbox" checked={scrobbling}
        onChange={event => { setScrobbling(event.target.checked);
          if (event.target.checked) localStorage.setItem(scrobbleKey(provider, profileName), "1");
          else localStorage.removeItem(scrobbleKey(provider, profileName));
        }} /> Scrobble playback to my Simkl account</label>}
      {provider === "anilist" && <label className="check"><input type="checkbox" checked={scrobbling}
        onChange={event => { setScrobbling(event.target.checked);
          if (event.target.checked) localStorage.setItem(scrobbleKey(provider, profileName), "1");
          else localStorage.removeItem(scrobbleKey(provider, profileName));
        }} /> Update my AniList anime progress after playback</label>}
      <button type="button" onClick={() => void disconnect()}>Disconnect {name}</button></>
      : <button type="button" disabled={busy} onClick={() => void connect()}>Connect {name}</button>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
