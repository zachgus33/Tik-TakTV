/** Keep Trakt credentials with one account profile, even when names match. */
export function traktProfileIdentityFor(ownerId: string, profileIndex: number) {
  return ownerId && Number.isInteger(profileIndex) && profileIndex > 0
    ? `profile:${ownerId}:${profileIndex}`
    : "";
}

export function traktProfileIdentity(name: string): string {
  const identity = localStorage.getItem("tiktak:active-profile-owner");
  if (identity) return `profile:${identity}`;
  return name;
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
