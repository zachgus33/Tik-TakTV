import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Folder, Play } from "lucide-react";
import { catalog, safeSourceUrl, safeUrl } from "./api";
import { relayedArtwork } from "./ChannelArt";
import {
  type Collection,
  type CollectionFolder,
  type CollectionSource,
  folderLabel,
  sourceCatalog,
} from "./collections";
import { tmdbCollection } from "./tmdb";
import { traktCollection } from "./trakt-collections";
import { itemKey, type Addon, type Item } from "./types";

type SourceRow = {
  key: string;
  title: string;
  items: Item[];
  loading: boolean;
  error?: string;
};

function sources(folder: CollectionFolder): CollectionSource[] {
  return (
    (folder.sources?.length ? folder.sources : folder.catalogSources) ?? []
  );
}

function rowTitle(
  source: CollectionSource,
  index: number,
  folder: CollectionFolder,
  folderIndex: number,
  addons: Addon[],
) {
  const explicit = typeof source.title === "string" ? source.title.trim() : "";
  if (explicit) return explicit;
  const catalogName = sourceCatalog(source, addons)?.catalog.name;
  if (catalogName) return catalogName;
  const media = ["tv", "series"].includes(
    String(source.mediaType ?? source.type).toLowerCase(),
  )
    ? "Series"
    : "Movies";
  return `${folderLabel(folder, folderIndex)} (${media}${index ? ` ${index + 1}` : ""})`;
}

function mediaLabel(source: CollectionSource) {
  return ["tv", "series"].includes(
    String(source.mediaType ?? source.type).toLowerCase(),
  )
    ? "Series"
    : "Movies";
}

async function resolveSource(
  source: CollectionSource,
  addons: Addon[],
  signal: AbortSignal,
  profileName: string,
) {
  if (source.provider?.toLowerCase() === "tmdb")
    return tmdbCollection(source, signal);
  if (source.provider?.toLowerCase() === "trakt")
    return traktCollection(source, profileName, signal);
  if (source.provider && source.provider !== "addon")
    throw new Error(`${source.provider} is not available in the web app.`);
  const resolved = sourceCatalog(source, addons);
  if (!resolved) throw new Error("The add-on catalog used by this row is not available.");
  if (!source.catalogId || !source.type)
    throw new Error("This Nuvio source is missing its catalog information.");
  return catalog(
    resolved.addon,
    source.type,
    resolved.catalog.id,
    "",
    signal,
    source.genre,
  );
}

function MediaCard({
  item,
  onOpen,
}: {
  item: Item;
  onOpen: (item: Item) => void;
}) {
  const poster = safeSourceUrl(item.poster);
  const [displayPoster, setDisplayPoster] = useState(
    poster?.startsWith("http:") ? "" : poster ?? "",
  );
  useEffect(() => {
    let cancelled = false;
    setDisplayPoster(poster?.startsWith("http:") ? "" : poster ?? "");
    if (poster?.startsWith("http:"))
      void relayedArtwork(poster).then(
        (url) => { if (!cancelled) setDisplayPoster(url); },
        () => {},
      );
    return () => { cancelled = true; };
  }, [poster]);
  return (
    <button className="media-card" onClick={() => onOpen(item)}>
      <div className="poster">
        {displayPoster ? (
          <img
            src={displayPoster}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => {
              if (!poster || displayPoster !== poster) {
                setDisplayPoster("");
                return;
              }
              void relayedArtwork(poster).then(setDisplayPoster, () => setDisplayPoster(""));
            }}
          />
        ) : (
          <div className="art-fallback">
            <Folder />
          </div>
        )}
      </div>
      <strong>{item.name}</strong>
      <span className="card-meta">
        {[item.year, item.type === "series" ? "Series" : "Movie"]
          .filter(Boolean)
          .join(" · ")}
      </span>
    </button>
  );
}

export default function CollectionsView({
  collection,
  folder,
  folderIndex,
  addons,
  library,
  profileName,
  onOpen,
  onBack,
}: {
  collection: Collection;
  folder: CollectionFolder;
  folderIndex: number;
  addons: Addon[];
  library: Item[];
  profileName: string;
  onOpen: (item: Item) => void;
  onBack: () => void;
}) {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const folderSources = useMemo(() => sources(folder), [folder]);

  useEffect(() => {
    const controller = new AbortController();
    const local = library.filter((item) =>
      folder.itemKeys?.includes(itemKey(item)),
    );
    const baseTitles = folderSources.map((source, index) =>
      rowTitle(source, index, folder, folderIndex, addons),
    );
    const titleCounts = new Map<string, number>();
    for (const title of baseTitles) {
      const key = title.trim().toLocaleLowerCase();
      titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
    }
    const initial: SourceRow[] = folderSources.map((source, index) => {
      const baseTitle = baseTitles[index];
      const duplicate =
        (titleCounts.get(baseTitle.trim().toLocaleLowerCase()) ?? 0) > 1;
      return {
        key: `${index}:${source.provider ?? "addon"}:${source.catalogId ?? "catalog"}`,
        title: duplicate ? `${baseTitle} (${mediaLabel(source)})` : baseTitle,
        items: [],
        loading: true,
      };
    });
    if (local.length)
      initial.unshift({
        key: "saved",
        title: `${folderLabel(folder, folderIndex)} — Saved`,
        items: local,
        loading: false,
      });
    setRows(initial);
    folderSources.forEach((source, sourceIndex) => {
      const key = `${sourceIndex}:${source.provider ?? "addon"}:${source.catalogId ?? "catalog"}`;
      void resolveSource(source, addons, controller.signal, profileName).then(
        (items) => {
          if (controller.signal.aborted) return;
          setRows((current) =>
            current.map((row) =>
              row.key === key
                ? {
                    ...row,
                    items: [
                      ...new Map(
                        items.map((item) => [itemKey(item), item]),
                      ).values(),
                    ],
                    loading: false,
                  }
                : row,
            ),
          );
        },
        (reason) => {
          if (controller.signal.aborted) return;
          setRows((current) =>
            current.map((row) =>
              row.key === key
                ? {
                    ...row,
                    loading: false,
                    error:
                      reason instanceof Error
                        ? reason.message
                        : "This row is temporarily unavailable.",
                  }
                : row,
            ),
          );
        },
      );
    });
    return () => controller.abort();
  }, [addons, folder, folderIndex, folderSources, library, profileName]);

  const allItems = rows.flatMap((row) => row.items);
  const featured =
    allItems.find((item) => safeUrl(item.background)) ?? allItems[0];
  const backdrop =
    safeUrl(folder.heroBackdropUrl) ?? safeUrl(featured?.background);
  const visibleRows = rows.filter(
    (row) => row.loading || row.error || row.items.length,
  );

  return (
    <section
      className="collection-browser"
      aria-label={`${collection.title}: ${folderLabel(folder, folderIndex)}`}
    >
      <div
        className="collection-browser-hero"
        style={backdrop ? { backgroundImage: `url("${backdrop}")` } : undefined}
      >
        <div className="collection-browser-shade" />
        <button className="collection-browser-back" onClick={onBack}>
          <ArrowLeft size={17} /> Back to Home
        </button>
        <div className="collection-browser-copy">
          <span className="eyebrow">{folderLabel(folder, folderIndex)}</span>
          <h1>{featured?.name ?? folderLabel(folder, folderIndex)}</h1>
          {featured && (
            <>
              <div className="metadata">
                {featured.year && <span>{featured.year}</span>}
                <span>{featured.type === "series" ? "Series" : "Movie"}</span>
                <span className="badge">
                  {folderLabel(folder, folderIndex)}
                </span>
              </div>
              {featured.description && <p>{featured.description}</p>}
              <button
                className="primary collection-browser-play"
                onClick={() => onOpen(featured)}
              >
                <Play size={18} fill="currentColor" /> Explore title
              </button>
            </>
          )}
        </div>
      </div>
      <div className="collection-browser-rows">
        {visibleRows.map((row) => (
          <section className="media-row" key={row.key} aria-label={row.title}>
            <div className="row-heading">
              <h2>{row.title}</h2>
            </div>
            {row.loading ? (
              <div className="collection-row-skeleton" role="status">
                Loading {row.title}…
              </div>
            ) : row.error ? (
              <p className="collection-row-error">
                Temporarily unavailable. {row.error}
              </p>
            ) : (
              <div className="rail">
                {row.items.map((item) => (
                  <MediaCard key={itemKey(item)} item={item} onOpen={onOpen} />
                ))}
              </div>
            )}
          </section>
        ))}
        {!visibleRows.length && (
          <p className="muted collection-browser-empty">
            This folder has no titles yet.
          </p>
        )}
      </div>
    </section>
  );
}
