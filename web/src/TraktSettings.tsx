import { useEffect, useState } from "react";

export const traktClientId = "--qC8Ym0uHVAfspvqjhVxFAM72ugEOgPzx68b31BHsY";
const clientId = traktClientId;
const redirectUri = "https://www.tiktaktv.me/trakt-callback.html";
const pendingKey = "tiktak:trakt-pending";
const callbackKey = "tiktak:trakt-callback";

type Token = {
  access_token: string;
  refresh_token: string;
  created_at: number;
  expires_in: number;
};
type DeviceCode = { device_code: string; user_code: string; verification_url: string; expires_in: number; interval: number };

const tokenKey = (profile: string) => `tiktak:trakt:${encodeURIComponent(profile)}`;
const scrobbleKey = (profile: string) => `tiktak:trakt-scrobble:${encodeURIComponent(profile)}`;
export const traktScrobblingEnabled = (profile: string): boolean =>
  localStorage.getItem(scrobbleKey(profile)) === "1";
const loadToken = (profile: string): Token | null => {
  try {
    const value = localStorage.getItem(tokenKey(profile));
    return value ? JSON.parse(value) as Token : null;
  } catch { return null; }
};

async function postToken(body: Record<string, string>): Promise<Token> {
  const response = await fetch("https://api.trakt.tv/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, ...body }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Trakt sign-in failed (HTTP ${response.status})${detail ? `: ${detail.slice(0, 160)}` : "."}`);
  }
  return await response.json() as Token;
}

async function validToken(profile: string, current: Token): Promise<Token> {
  if (current.created_at + current.expires_in > Date.now() / 1000 + 60) return current;
  const refreshed = await postToken({
    refresh_token: current.refresh_token,
    grant_type: "refresh_token",
    redirect_uri: redirectUri,
  });
  localStorage.setItem(tokenKey(profile), JSON.stringify(refreshed));
  return refreshed;
}

export async function traktAccessToken(profile: string): Promise<string | null> {
  const current = loadToken(profile);
  return current ? (await validToken(profile, current)).access_token : null;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function TraktSettings({ profileName }: { profileName: string }) {
  const [token, setToken] = useState<Token | null>(() => loadToken(profileName));
  const [scrobblingEnabled, setScrobblingEnabled] = useState(() => traktScrobblingEnabled(profileName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);
  const [device, setDevice] = useState<(DeviceCode & { expiresAt: number }) | null>(null);

  useEffect(() => {
    setToken(loadToken(profileName));
    setScrobblingEnabled(traktScrobblingEnabled(profileName));
  }, [profileName]);

  useEffect(() => {
    if (!device || token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped) return;
      if (Date.now() >= device.expiresAt) {
        setDevice(null);
        setError("Trakt activation code expired. Request a new one.");
        return;
      }
      try {
        const response = await fetch("https://api.trakt.tv/oauth/device/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: device.device_code, client_id: clientId }),
        });
        if (response.ok) {
          const value = await response.json() as Token;
          localStorage.setItem(tokenKey(profileName), JSON.stringify(value));
          setToken(value);
          setDevice(null);
          return;
        }
        if (response.status !== 400 && response.status !== 429) {
          throw new Error(`Trakt activation failed (HTTP ${response.status}).`);
        }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Could not check Trakt activation.");
      }
      if (!stopped) timer = setTimeout(poll, Math.max(device.interval, 6) * 1000);
    };
    timer = setTimeout(poll, Math.max(device.interval, 6) * 1000);
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [device, profileName, token]);

  useEffect(() => {
    const saved = localStorage.getItem(callbackKey);
    if (!saved) return;
    localStorage.removeItem(callbackKey);
    const pending = localStorage.getItem(pendingKey) ?? sessionStorage.getItem(pendingKey);
    localStorage.removeItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    if (!pending) { setError("Trakt sign-in expired. Try connecting again."); return; }
    const callback = JSON.parse(saved) as { code?: string; state?: string; error?: string };
    const attempt = JSON.parse(pending) as { verifier: string; state: string; profile: string; createdAt: number };
    if (callback.error) { setError(`Trakt sign-in was ${callback.error}.`); return; }
    if (!callback.code || callback.state !== attempt.state || attempt.profile !== profileName ||
      !attempt.createdAt || Date.now() - attempt.createdAt > 10 * 60_000) {
      setError("Trakt sign-in could not be verified. Try connecting again.");
      return;
    }
    setBusy(true);
    void postToken({
      code: callback.code,
      code_verifier: attempt.verifier,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).then((value) => {
      localStorage.setItem(tokenKey(profileName), JSON.stringify(value));
      setToken(value);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Trakt sign-in failed."))
      .finally(() => setBusy(false));
  }, [profileName]);

  useEffect(() => {
    if (!token) { setUsername(""); setWatchlistCount(null); return; }
    let cancelled = false;
    void validToken(profileName, token).then(async (fresh) => {
      if (cancelled) return;
      setToken(fresh);
      const headers = {
        "trakt-api-version": "2",
        "trakt-api-key": clientId,
        Authorization: `Bearer ${fresh.access_token}`,
      };
      const [settings, movies, shows] = await Promise.all([
        fetch("https://api.trakt.tv/users/settings", { headers }),
        fetch("https://api.trakt.tv/sync/watchlist/movies", { headers }),
        fetch("https://api.trakt.tv/sync/watchlist/shows", { headers }),
      ]);
      if (!settings.ok || !movies.ok || !shows.ok) throw new Error("Could not load Trakt account data.");
      const user = await settings.json() as { user?: { username?: string } };
      const movieItems = await movies.json() as unknown[];
      const showItems = await shows.json() as unknown[];
      if (!cancelled) {
        setUsername(user.user?.username ?? "Trakt user");
        setWatchlistCount(movieItems.length + showItems.length);
      }
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : "Trakt is unavailable.");
    });
    return () => { cancelled = true; };
  }, [profileName, token?.access_token]);

  async function connect() {
    setError("");
    if (location.origin !== new URL(redirectUri).origin) {
      location.assign(`https://www.tiktaktv.me/#settings`);
      return;
    }
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    // OAuth can return in a new browser tab on mobile. sessionStorage is
    // tab-scoped, so it loses the PKCE verifier and silently drops sign-in.
    localStorage.setItem(pendingKey, JSON.stringify({ verifier, state, profile: profileName, createdAt: Date.now() }));
    const url = new URL("https://auth.trakt.tv/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    location.assign(url.href);
  }

  async function connectWithCode() {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("https://api.trakt.tv/oauth/device/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      if (!response.ok) throw new Error(`Could not request a Trakt activation code (HTTP ${response.status}).`);
      const value = await response.json() as DeviceCode;
      setDevice({ ...value, expiresAt: Date.now() + value.expires_in * 1000 });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request a Trakt activation code.");
    } finally { setBusy(false); }
  }

  async function disconnect() {
    const current = token;
    localStorage.removeItem(tokenKey(profileName));
    localStorage.removeItem(scrobbleKey(profileName));
    setScrobblingEnabled(false);
    setToken(null);
    setError("");
    if (current) {
      await fetch("https://api.trakt.tv/oauth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: current.access_token, client_id: clientId }),
      }).catch(() => undefined);
    }
  }

  return <section className="settings-card">
    <div className="card-heading"><div><h2>Trakt</h2><p>Optional access to your own Trakt watchlist.</p></div></div>
    <p>TikTak TV uses Trakt but is not endorsed or certified by Trakt.</p>
    {token ? <>
      <p>Connected as <strong>{username || "your Trakt account"}</strong>.</p>
      {watchlistCount !== null && <p>Your Trakt watchlist has {watchlistCount} movies and shows.</p>}
      <label className="check"><input type="checkbox" checked={scrobblingEnabled} onChange={(event) => {
        const enabled = event.target.checked;
        setScrobblingEnabled(enabled);
        if (enabled) localStorage.setItem(scrobbleKey(profileName), "1");
        else localStorage.removeItem(scrobbleKey(profileName));
      }} /> Scrobble movies and episodes to my Trakt account</label>
      <p className="hint">Off until you enable it. Collection visibility is controlled separately.</p>
      <button type="button" onClick={() => void disconnect()}>Disconnect Trakt</button>
    </> : <>
      <p>Connect only if you want to use Trakt. You will sign in to your own Trakt account.</p>
      <button type="button" disabled={busy} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect my Trakt"}</button>
      <button type="button" disabled={busy} onClick={() => void connectWithCode()}>Connect with activation code</button>
      {device && <p>Open <a href={device.verification_url} target="_blank" rel="noreferrer">{device.verification_url}</a> and enter <strong>{device.user_code}</strong>. This page will connect automatically.</p>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
