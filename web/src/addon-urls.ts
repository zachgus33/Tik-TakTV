/** Keep configured add-on query parameters on every Stremio resource URL. */
export function manifestUrl(base: string): string {
  const url = new URL(base.trim());
  if (!url.pathname.endsWith("/manifest.json"))
    url.pathname = `${url.pathname.replace(/\/$/, "")}/manifest.json`;
  return url.href;
}

export function baseFromManifest(manifest: string): string {
  const url = new URL(manifest);
  url.pathname = url.pathname.replace(/\/manifest\.json$/, "").replace(/\/$/, "");
  return url.href.replace(/\/$/, "");
}

export function addonResourceUrl(
  base: string,
  resource: "catalog" | "meta" | "stream" | "subtitles",
  type: string,
  id: string,
  extra?: string,
): string {
  const url = new URL(baseFromManifest(manifestUrl(base)));
  const path = `${url.pathname.replace(/\/$/, "")}/${resource}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  url.pathname = extra ? `${path}/${extra}.json` : `${path}.json`;
  return url.href;
}
