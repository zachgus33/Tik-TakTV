import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import CollectionsView from "./CollectionsView";
import { safeSourceUrl } from "./api";
import { relayedArtwork } from "./ChannelArt";
import { folderLabel, type Collection } from "./collections";
import type { Addon, Item } from "./types";

function CollectionCover({ source }: { source?: string }) {
  const url = safeSourceUrl(source);
  const [displayUrl, setDisplayUrl] = useState(url?.startsWith("http:") ? "" : url ?? "");
  useEffect(() => {
    let active = true;
    setDisplayUrl(url?.startsWith("http:") ? "" : url ?? "");
    if (url?.startsWith("http:"))
      void relayedArtwork(url).then(
        (resolved) => { if (active) setDisplayUrl(resolved); },
        () => {},
      );
    return () => { active = false; };
  }, [url]);
  return displayUrl ? (
    <img
      src={displayUrl}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!url || displayUrl !== url) { setDisplayUrl(""); return; }
        void relayedArtwork(url).then(setDisplayUrl, () => setDisplayUrl(""));
      }}
    />
  ) : null;
}

export default function HomeCollections(props: {
  collections: Collection[];
  addons: Addon[];
  library: Item[];
  onOpen: (i: Item) => void;
  onBrowsingChange?: (browsing: boolean) => void;
}) {
  const [selected, setSelected] = useState<{
    collection: string;
    folder: string;
  } | null>(null);
  if (selected) {
    const collection = props.collections.find(
      (entry) => entry.id === selected.collection,
    );
    const folderIndex =
      collection?.folders.findIndex((entry) => entry.id === selected.folder) ??
      -1;
    const folder =
      folderIndex >= 0 ? collection?.folders[folderIndex] : undefined;
    if (collection && folder)
      return (
        <CollectionsView
          collection={collection}
          folder={folder}
          folderIndex={folderIndex}
          addons={props.addons}
          library={props.library}
          onOpen={props.onOpen}
          onBack={() => {
            setSelected(null);
            props.onBrowsingChange?.(false);
            window.scrollTo(0, 0);
          }}
        />
      );
  }
  const visibleCollections = props.collections
    .filter((collection) => collection.showOnHome !== false)
    .map((collection, index) => ({ collection, index }))
    .sort(
      (left, right) =>
        Number(right.collection.pinToTop === true) -
          Number(left.collection.pinToTop === true) || left.index - right.index,
    )
    .map(({ collection }) => collection);
  return (
    <>
      {visibleCollections.map((c) => {
        const backdrop = safeSourceUrl(c.backdropImageUrl);
        return (
          <section
            className={`home-collection collection-view-${c.viewMode === "TABS" || c.viewMode === "tabs" ? "tabs" : "rows"}`}
            key={c.id}
            style={
              backdrop
                ? ({
                    "--collection-backdrop": `url("${backdrop}")`,
                  } as CSSProperties)
                : undefined
            }
          >
            <div className="home-collection-heading">
              <div>
                {c.pinToTop && (
                  <span className="eyebrow">PINNED COLLECTION</span>
                )}
                <h2>{c.title}</h2>
                <p>
                  {c.folders.length} curated{" "}
                  {c.folders.length === 1 ? "folder" : "folders"}
                </p>
              </div>
            </div>
            <div className="service-tiles">
              {c.folders.map((f, index) => {
                const label = folderLabel(f, index);
                return (
                  <button
                    key={f.id}
                    className={`service-tile service-tile-${f.tileShape === "POSTER" || f.layout === "poster" ? "poster" : "wide"}`}
                    onClick={() => {
                      setSelected({ collection: c.id, folder: f.id });
                      props.onBrowsingChange?.(true);
                      window.scrollTo(0, 0);
                    }}
                    aria-label={`Open ${c.title}: ${label}`}
                  >
                    <CollectionCover source={f.coverImageUrl} />
                    {!f.hideTitle && f.title.trim() && (
                      <span>
                        {typeof f.coverEmoji === "string"
                          ? f.coverEmoji + " "
                          : ""}
                        {f.title}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}
