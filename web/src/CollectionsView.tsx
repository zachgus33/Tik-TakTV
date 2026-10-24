import { tmdbCollection } from "./tmdb";
import { useEffect, useState } from "react";
import { Folder, Plus, ArrowLeft, Trash2 } from "lucide-react";
import { catalog } from "./api";
import {
  type Collection,
  type CollectionFolder,
  sourceAddon,
} from "./collections";
import { itemKey, type Addon, type Item } from "./types";

export default function CollectionsView({
  collections,
  onChange,
  addons,
  library,
  onOpen,
  initialSelection,
}: {
  collections: Collection[];
  onChange: (c: Collection[]) => void;
  addons: Addon[];
  library: Item[];
  onOpen: (item: Item) => void;
  initialSelection?: { collection: string; folder: string };
}) {
  const [selected, setSelected] = useState(initialSelection?.collection ?? "");
  const [folderId, setFolderId] = useState(initialSelection?.folder ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(60);
  const collection = collections.find((c) => c.id === selected);
  const folder = collection?.folders.find((f) => f.id === folderId);
  function updateFolder(change: Partial<CollectionFolder>) {
    if (!collection || !folder) return;
    onChange(
      collections.map((c) =>
        c.id === collection.id
          ? {
              ...c,
              folders: c.folders.map((f) =>
                f.id === folder.id ? { ...f, ...change } : f,
              ),
            }
          : c,
      ),
    );
  }
  useEffect(() => {
    if (!folder) {
      setItems([]);
      return;
    }
    const c = new AbortController();
    setBusy(true);
    setError("");
    setLimit(60);
    const sources =
      (folder.sources?.length ? folder.sources : folder.catalogSources) ?? [];
    const local = library.filter((i) => folder.itemKeys?.includes(itemKey(i)));
    void Promise.allSettled(
      sources.map(async (s) => {
        if (s.provider?.toLowerCase() === "tmdb")
          return tmdbCollection(s, c.signal);
        if (s.provider && s.provider !== "addon")
          throw new Error(
            `${s.provider} collection sources need their own account integration. Add an equivalent add-on catalog here; the imported source is preserved for export.`,
          );
        const addon = sourceAddon(s, addons);
        if (!addon)
          throw new Error(
            `Install the add-on for this collection source (${s.addonId ?? "unknown"}).`,
          );
        if (!s.catalogId || !s.type)
          throw new Error("This source is missing its catalog ID or type.");
        return catalog(addon, s.type, s.catalogId, "", c.signal, s.genre);
      }),
    ).then((results) => {
      if (c.signal.aborted) return;
      setItems([
        ...new Map(
          [
            ...local,
            ...results.flatMap((r) =>
              r.status === "fulfilled" ? r.value : [],
            ),
          ].map((i) => [itemKey(i), i]),
        ).values(),
      ]);
      setError(
        results
          .flatMap((r) =>
            r.status === "rejected"
              ? [
                  r.reason instanceof Error
                    ? r.reason.message
                    : "Source unavailable",
                ]
              : [],
          )
          .join(" "),
      );
      setBusy(false);
    });
    return () => c.abort();
  }, [folder, addons, library]);
  const choices = addons.flatMap((a) =>
    (a.manifest.catalogs ?? []).map((c) => ({
      addon: a.manifest.id,
      type: c.type,
      catalogId: c.id,
      name: `${a.manifest.name} · ${c.name ?? c.id}`,
    })),
  );
  return (
    <section className="collections-section">
      <div className="row-heading">
        <h2>Collections</h2>
        {collection && (
          <button
            onClick={() => {
              setSelected("");
              setFolderId("");
            }}
          >
            <ArrowLeft size={16} />
            All collections
          </button>
        )}
      </div>
      {!collection ? (
        <>
          <div className="collection-grid">
            {collections.map((c) => (
              <button
                key={c.id}
                className="collection-tile"
                onClick={() => {
                  setSelected(c.id);
                  setFolderId(c.folders[0]?.id ?? "");
                }}
              >
                <Folder />
                <strong>{c.title}</strong>
                <small>{c.folders.length} folders</small>
              </button>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const title = String(new FormData(form).get("title")).trim();
              if (!title) return;
              const id = crypto.randomUUID();
              onChange([...collections, { id, title, folders: [] }]);
              setSelected(id);
              form.reset();
            }}
          >
            <label className="grow">
              New collection
              <input
                name="title"
                placeholder="Movie nights"
                maxLength={100}
                required
              />
            </label>
            <button>
              <Plus size={16} />
              Create collection
            </button>
          </form>
        </>
      ) : (
        <>
          <div className="row-heading">
            <h3>{collection.title}</h3>
            <button
              onClick={() => {
                onChange(collections.filter((c) => c.id !== collection.id));
                setSelected("");
                setFolderId("");
              }}
            >
              <Trash2 size={15} />
              Remove collection
            </button>
          </div>
          <div className="chips folder-tabs">
            {collection.folders.map((f) => (
              <button
                key={f.id}
                className={f.id === folderId ? "selected" : ""}
                onClick={() => setFolderId(f.id)}
              >
                {f.title}
              </button>
            ))}
          </div>
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const title = String(new FormData(form).get("folder")).trim();
              if (!title) return;
              const id = crypto.randomUUID();
              onChange(
                collections.map((c) =>
                  c.id === collection.id
                    ? {
                        ...c,
                        folders: [
                          ...c.folders,
                          { id, title, sources: [], itemKeys: [] },
                        ],
                      }
                    : c,
                ),
              );
              setFolderId(id);
              form.reset();
            }}
          >
            <label className="grow">
              New folder
              <input
                name="folder"
                placeholder="Favorites"
                maxLength={100}
                required
              />
            </label>
            <button>Add folder</button>
          </form>
          {folder && (
            <>
              <details className="collection-editor">
                <summary>Edit {folder.title}</summary>
                <form
                  className="inline-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    const choice = choices[Number(form.get("catalog"))];
                    if (!choice) return;
                    const source = {
                      provider: "addon",
                      addonId: choice.addon,
                      type: choice.type,
                      catalogId: choice.catalogId,
                      genre:
                        String(form.get("genre") ?? "").trim() || undefined,
                    };
                    updateFolder({
                      sources: [
                        ...((folder.sources?.length
                          ? folder.sources
                          : folder.catalogSources) ?? []),
                        source,
                      ],
                      catalogSources: [],
                    });
                  }}
                >
                  <label className="grow">
                    Add catalog
                    <select name="catalog">
                      {choices.map((c, i) => (
                        <option key={i} value={i}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Genre (optional)
                    <input name="genre" placeholder="Exact source genre" />
                  </label>
                  <button disabled={!choices.length}>Add catalog</button>
                </form>
                <div className="source-list">
                  {(
                    (folder.sources?.length
                      ? folder.sources
                      : folder.catalogSources) ?? []
                  ).map((s, i) => (
                    <div key={i}>
                      <span>
                        {(s.title as string) ?? s.catalogId ?? s.provider}{" "}
                        {s.genre ? `· ${s.genre}` : ""}
                      </span>
                      <button
                        aria-label={`Remove source ${i + 1}`}
                        onClick={() =>
                          updateFolder({
                            sources: (
                              (folder.sources?.length
                                ? folder.sources
                                : folder.catalogSources) ?? []
                            ).filter((_, n) => n !== i),
                            catalogSources: [],
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <label>
                  Folder name
                  <input
                    value={folder.title}
                    maxLength={100}
                    onChange={(e) => updateFolder({ title: e.target.value })}
                  />
                </label>
                <p className="hint">
                  Choose saved titles to include in this folder.
                </p>
                <div className="collection-picker">
                  {library.map((i) => (
                    <label className="check" key={itemKey(i)}>
                      <input
                        type="checkbox"
                        checked={folder.itemKeys?.includes(itemKey(i)) ?? false}
                        onChange={(e) =>
                          updateFolder({
                            itemKeys: e.target.checked
                              ? [...(folder.itemKeys ?? []), itemKey(i)]
                              : (folder.itemKeys ?? []).filter(
                                  (k) => k !== itemKey(i),
                                ),
                          })
                        }
                      />
                      {i.name}
                    </label>
                  ))}
                </div>
                <button
                  onClick={() => {
                    onChange(
                      collections.map((c) =>
                        c.id === collection.id
                          ? {
                              ...c,
                              folders: c.folders.filter(
                                (f) => f.id !== folder.id,
                              ),
                            }
                          : c,
                      ),
                    );
                    setFolderId("");
                  }}
                >
                  Remove folder
                </button>
              </details>
              {error && (
                <div className="error" role="alert">
                  {error}
                </div>
              )}
              {busy ? (
                <p role="status">Loading collection…</p>
              ) : (
                <>
                  <div className="media-grid">
                    {items.slice(0, limit).map((i) => (
                      <button
                        className="media-card"
                        key={itemKey(i)}
                        onClick={() => onOpen(i)}
                      >
                        <div className="poster">
                          {i.poster ? (
                            <img
                              src={i.poster}
                              alt=""
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="art-fallback">
                              <Folder />
                            </div>
                          )}
                        </div>
                        <strong>{i.name}</strong>
                        <span className="card-meta">
                          {i.year} · {i.type}
                        </span>
                      </button>
                    ))}
                  </div>
                  {!items.length && (
                    <p className="muted">
                      Add a catalog or saved titles to this folder.
                    </p>
                  )}
                  {items.length > limit && (
                    <button onClick={() => setLimit((n) => n + 60)}>
                      Show more titles
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
