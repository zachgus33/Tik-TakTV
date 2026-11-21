const key = (profile: string) =>
  `tiktak:search-history:${encodeURIComponent(profile.trim().toLocaleLowerCase() || "local")}`;

export function readSearchHistory(profile: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key(profile)) || "[]");
    return Array.isArray(value)
      ? value.map(String).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 10)
      : [];
  } catch {
    return [];
  }
}

export function recordSearch(profile: string, query: string) {
  const value = query.trim();
  if (value.length < 2) return readSearchHistory(profile);
  const next = [
    value,
    ...readSearchHistory(profile).filter((item) => item !== value),
  ].slice(0, 10);
  localStorage.setItem(key(profile), JSON.stringify(next));
  return next;
}

export function removeSearch(profile: string, query: string) {
  const next = readSearchHistory(profile).filter((item) => item !== query);
  localStorage.setItem(key(profile), JSON.stringify(next));
  return next;
}

export function clearSearchHistory(profile: string) {
  localStorage.setItem(key(profile), "[]");
  return [] as string[];
}
