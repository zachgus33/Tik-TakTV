import { safeUrl } from "./api";
import { itemKey, type Item, type Addon, type Progress } from "./types";

export type CollectionSource = {
  provider?: string;
  addonId?: string;
  type?: string;
  catalogId?: string;
  genre?: string;
  [key: string]: unknown;
};
export type CollectionFolder = {
  id: string;
  title: string;
  sources?: CollectionSource[];
  catalogSources?: CollectionSource[];
  itemKeys?: string[];
  layout?: "wide" | "poster";
  tileShape?: "LANDSCAPE" | "POSTER" | string;
  coverImageUrl?: string;
  coverEmoji?: string;
  [key: string]: unknown;
};
export type Collection = {
  id: string;
  title: string;
  folders: CollectionFolder[];
  showOnHome?: boolean;
  backdropImageUrl?: string;
  pinToTop?: boolean;
  viewMode?: "FOLLOW_LAYOUT" | "TABS" | "tabs" | "rows" | string;
  showAllTab?: boolean;
  [key: string]: unknown;
};
export type Transfer = {
  format: "nuvio-enhanced-web";
  version: 1;
  addons: string[];
  collections: Collection[];
  library: Item[];
  progress: Progress[];
};
export function parseCollections(value: unknown): Collection[] {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      throw new Error("Collections must be valid JSON.");
    }
  }
  if (!Array.isArray(value) || value.length > 200)
    throw new Error(
      "Expected a Nuvio collections array (up to 200 collections).",
    );
  const seen = new Set<string>();
  return value.map((raw) => {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof raw.id !== "string" ||
      !raw.id ||
      typeof raw.title !== "string" ||
      !raw.title.trim() ||
      !Array.isArray(raw.folders) ||
      raw.folders.length > 200 ||
      seen.has(raw.id)
    )
      throw new Error(
        "Each collection needs a unique ID, title, and folders array.",
      );
    seen.add(raw.id);
    const folderIds = new Set<string>();
    const folders = raw.folders.map((f: Record<string, unknown>) => {
      if (
        !f ||
        typeof f.id !== "string" ||
        typeof f.title !== "string" ||
        !f.title.trim() ||
        folderIds.has(f.id)
      )
        throw new Error("Each folder needs a unique ID and title.");
      folderIds.add(f.id);
      for (const key of ["sources", "catalogSources"])
        if (
          f[key] !== undefined &&
          (!Array.isArray(f[key]) ||
            (f[key] as unknown[]).length > 100 ||
            (f[key] as unknown[]).some((s) => !s || typeof s !== "object"))
        )
          throw new Error("A folder contains an invalid source list.");
      return {
        ...f,
        itemKeys: Array.isArray(f.itemKeys)
          ? f.itemKeys.filter((k): k is string => typeof k === "string")
          : undefined,
      } as CollectionFolder;
    });
    return { ...raw, folders } as Collection;
  });
}
export function mergeCollections(
  current: Collection[],
  incoming: Collection[],
): Collection[] {
  const byId = new Map(current.map((c) => [c.id, c]));
  for (const c of incoming) byId.set(c.id, c);
  return [...byId.values()];
}
export function sourceAddon(
  source: CollectionSource,
  addons: Addon[],
): Addon | undefined {
  return addons.find(
    (a) =>
      a.manifest.id === source.addonId ||
      a.base === source.addonId ||
      `${a.base}/manifest.json` === source.addonId,
  );
}
export function addonUrls(text: string): string[] {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    input = text
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  const object =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : null;
  const list = object?.addons ?? input;
  if (!Array.isArray(list) || list.length > 100)
    throw new Error(
      "Paste one manifest URL per line, or an add-ons JSON array (up to 100).",
    );
  const urls = list.map((raw) =>
    typeof raw === "string"
      ? raw
      : (raw?.manifestUrl ??
        raw?.transportUrl ??
        raw?.url ??
        (raw?.base ? `${raw.base}/manifest.json` : "")),
  );
  if (
    urls.some(
      (url) =>
        typeof url !== "string" ||
        !safeUrl(url.replace(/^stremio:\/\//, "https://")) ||
        !new URL(url.replace(/^stremio:\/\//, "https://")).pathname.endsWith(
          "/manifest.json",
        ),
    )
  )
    throw new Error(
      "Every add-on needs its HTTPS or stremio:// manifest.json URL. Copy configured URLs from your existing add-ons.",
    );
  return [...new Set(urls)];
}
function importedItem(value: unknown): Item {
  const x = value as Item;
  if (
    !x ||
    typeof x.id !== "string" ||
    typeof x.name !== "string" ||
    !["movie", "series", "live"].includes(x.type) ||
    !["addon", "xtream", "playlist"].includes(x.source)
  )
    throw new Error("Invalid saved title in backup.");
  if (x.source === "addon" && !safeUrl(x.provider))
    throw new Error("Invalid add-on source in backup.");
  return {
    id: x.id,
    name: x.name,
    type: x.type,
    source: x.source,
    provider: x.provider,
    poster: safeUrl(x.poster),
    background: safeUrl(x.background),
    description: typeof x.description === "string" ? x.description : undefined,
    year: x.year,
    category: x.category,
    extension: x.extension,
    epgId: x.epgId,
  };
}
export function parseTransfer(text: string): Transfer {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Choose a valid JSON backup.");
  }
  if (data?.format !== "nuvio-enhanced-web" || data.version !== 1)
    throw new Error(
      "This is not a Nuvio Web backup. For native Nuvio collections, use Import collections. Native Enhanced settings backups do not contain your add-ons or full library.",
    );
  const library = Array.isArray(data.library)
    ? data.library.map(importedItem)
    : [];
  const progress: Progress[] = Array.isArray(data.progress)
    ? data.progress
        .map((p: Progress) => {
          if (
            !Number.isFinite(p.seconds) ||
            !Number.isFinite(p.duration) ||
            p.seconds < 0 ||
            p.duration <= 0
          )
            throw new Error("Invalid watch progress in backup.");
          return { ...p, item: importedItem(p.item) };
        })
        .slice(0, 100)
    : [];
  return {
    format: "nuvio-enhanced-web",
    version: 1,
    addons: addonUrls(JSON.stringify(data.addons ?? [])),
    collections: parseCollections(data.collections ?? []),
    library,
    progress,
  };
}
export function mergeItems(current: Item[], incoming: Item[]) {
  return [
    ...new Map([...current, ...incoming].map((i) => [itemKey(i), i])).values(),
  ];
}
export function downloadJson(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
export function downloadText(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
