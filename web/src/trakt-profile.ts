/** Keep Trakt credentials with one account profile, even when names match. */
export function traktProfileIdentity(name: string): string {
  if (!name) return "";
  const identity = localStorage.getItem("tiktak:active-profile-owner");
  if (!identity) return name;
  return `profile:${identity}`;
}

/** Move the old name-based login only to its first matching profile. */
export function migrateLegacyTraktProfile(name: string): void {
  const stable = traktProfileIdentity(name);
  if (!name || stable === name) return;
  const tokenKey = (profile: string) => `tiktak:trakt:${encodeURIComponent(profile)}`;
  const scrobbleKey = (profile: string) => `tiktak:trakt-scrobble:${encodeURIComponent(profile)}`;
  const legacyOwnerKey = `tiktak:trakt-legacy-owner:${encodeURIComponent(name)}`;
  if (!localStorage.getItem(legacyOwnerKey)) {
    const oldToken = localStorage.getItem(tokenKey(name));
    const oldScrobble = localStorage.getItem(scrobbleKey(name));
    if (oldToken || oldScrobble) {
      if (oldToken && !localStorage.getItem(tokenKey(stable)))
        localStorage.setItem(tokenKey(stable), oldToken);
      if (oldScrobble && !localStorage.getItem(scrobbleKey(stable)))
        localStorage.setItem(scrobbleKey(stable), oldScrobble);
      localStorage.setItem(legacyOwnerKey, stable);
      localStorage.removeItem(tokenKey(name));
      localStorage.removeItem(scrobbleKey(name));
    }
  }
}
