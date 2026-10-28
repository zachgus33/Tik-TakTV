import { useState } from "react";
import type { CSSProperties } from "react";
import CollectionsView from "./CollectionsView";
import { safeUrl } from "./api";
import type { Collection } from "./collections";
import type { Addon, Item } from "./types";
export default function HomeCollections(props: {
  collections: Collection[];
  onChange: (c: Collection[]) => void;
  addons: Addon[];
  library: Item[];
  onOpen: (i: Item) => void;
}) {
  const [selected, setSelected] = useState<{
    collection: string;
    folder: string;
  } | null>(null);
  if (selected)
    return (
      <section>
        <button onClick={() => setSelected(null)}>
          Back to Home collections
        </button>
        <CollectionsView {...props} initialSelection={selected} />
      </section>
    );
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
        const backdrop = safeUrl(c.backdropImageUrl);
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
              {c.folders.map((f) => {
                const cover = safeUrl(f.coverImageUrl);
                return (
                  <button
                    key={f.id}
                    className={`service-tile service-tile-${f.tileShape === "POSTER" || f.layout === "poster" ? "poster" : "wide"}`}
                    onClick={() =>
                      setSelected({ collection: c.id, folder: f.id })
                    }
                    aria-label={`Open ${c.title}: ${f.title}`}
                  >
                    {cover ? (
                      <img
                        src={cover}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <span>
                      {typeof f.coverEmoji === "string"
                        ? f.coverEmoji + " "
                        : ""}
                      {f.title}
                    </span>
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
