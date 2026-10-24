import { useState } from "react";
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
  return (
    <>
      {props.collections.map((c) => (
        <section className="home-collection" key={c.id}>
          <h2>{c.title}</h2>
          <div className="service-tiles">
            {c.folders.map((f) => {
              const cover = safeUrl(f.coverImageUrl);
              return (
                <button
                  key={f.id}
                  className="service-tile"
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
                    {typeof f.coverEmoji === "string" ? f.coverEmoji + " " : ""}
                    {f.title}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
