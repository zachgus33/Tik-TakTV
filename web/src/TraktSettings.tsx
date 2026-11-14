import { useEffect, useState } from "react";

const clientId = "--qC8Ym0uHVAfspvqjhVxFAM72ugEOgPzx68b31BHsY";
const redirectUri = `${location.origin}/trakt-callback.html`;
const pendingKey = "tiktak:trakt-pending";
const callbackKey = "tiktak:trakt-callback";

type Token = {
  access_token: string;
  refresh_token: string;
  created_at: number;
  expires_in: number;
};

const tokenKey = (profile: string) => `tiktak:trakt:${encodeURIComponent(profile)}`;
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
  if (!response.ok) throw new Error(`Trakt sign-in failed (HTTP ${response.status}).`);
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

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export default function TraktSettings({ profileName }: { profileName: string }) {
  const [token, setToken] = useState<Token | null>(() => loadToken(profileName));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [watchlistCount, setWatchlistCount] = useState<number | null>(null);

  useEffect(() => { setToken(loadToken(profileName)); }, [profileName]);

  useEffect(() => {
    const saved = sessionStorage.getItem(callbackKey);
    if (!saved) return;
    sessionStorage.removeItem(callbackKey);
    const pending = sessionStorage.getItem(pendingKey);
    sessionStorage.removeItem(pendingKey);
    if (!pending) { setError("Trakt sign-in expired. Try connecting again."); return; }
    const callback = JSON.parse(saved) as { code?: string; state?: string; error?: string };
    const attempt = JSON.parse(pending) as { verifier: string; state: string; profile: string };
    if (callback.error) { setError(`Trakt sign-in was ${callback.error}.`); return; }
    if (!callback.code || callback.state !== attempt.state || attempt.profile !== profileName) {
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
    const verifier = base64Url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    const state = base64Url(crypto.getRandomValues(new Uint8Array(24)));
    sessionStorage.setItem(pendingKey, JSON.stringify({ verifier, state, profile: profileName }));
    const url = new URL("https://auth.trakt.tv/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    location.assign(url.href);
  }

  async function disconnect() {
    const current = token;
    localStorage.removeItem(tokenKey(profileName));
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
      <button type="button" onClick={() => void disconnect()}>Disconnect Trakt</button>
    </> : <>
      <p>Connect only if you want to use Trakt. You will sign in to your own Trakt account.</p>
      <button type="button" disabled={busy} onClick={() => void connect()}>{busy ? "Connecting…" : "Connect my Trakt"}</button>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}
