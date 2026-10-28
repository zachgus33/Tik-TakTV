import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  FolderPlus,
  Layers3,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import type {
  Collection,
  CollectionFolder,
  CollectionSource,
} from "./collections";
import type { Addon, Item } from "./types";

type CatalogChoice = {
  addonId: string;
  catalogId: string;
  type: string;
  label: string;
};

export default function CollectionManager(props: {
  collections: Collection[];
  onChange: (collections: Collection[]) => void;
  addons: Addon[];
  library: Item[];
}) {
  const [selectedId, setSelectedId] = useState("");
  const [folderId, setFolderId] = useState("");
  const selected = props.collections.find((item) => item.id === selectedId);
  const folder = selected?.folders.find((item) => item.id === folderId);
  const choices = useMemo<CatalogChoice[]>(
    () =>
      props.addons.flatMap((addon) =>
        (addon.manifest.catalogs ?? []).map((catalog) => ({
          addonId: addon.manifest.id,
          catalogId: catalog.id,
          type: catalog.type,
          label: `${addon.manifest.name} · ${catalog.name ?? catalog.id}`,
        })),
      ),
    [props.addons],
  );

  function updateCollection(change: Partial<Collection>) {
    if (!selected) return;
    props.onChange(
      props.collections.map((item) =>
        item.id === selected.id ? { ...item, ...change } : item,
      ),
    );
  }
  function updateFolder(change: Partial<CollectionFolder>) {
    if (!selected || !folder) return;
    updateCollection({
      folders: selected.folders.map((item) =>
        item.id === folder.id ? { ...item, ...change } : item,
      ),
    });
  }
  function moveCollection(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= props.collections.length) return;
    const next = [...props.collections];
    [next[index], next[target]] = [next[target], next[index]];
    props.onChange(next);
  }
  function moveFolder(index: number, direction: -1 | 1) {
    if (!selected) return;
    const target = index + direction;
    if (target < 0 || target >= selected.folders.length) return;
    const next = [...selected.folders];
    [next[index], next[target]] = [next[target], next[index]];
    updateCollection({ folders: next });
  }

  if (!selected) {
    return (
      <section className="settings-card nuvio-collections-manager">
        <div className="collection-manager-title">
          <div>
            <span className="eyebrow">SYNCED FROM NUVIO</span>
            <h2>Collections</h2>
            <p>
              Create and arrange collections, then build each one from folders,
              add-on catalogs, and saved titles.
            </p>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const name = String(new FormData(form).get("name") ?? "").trim();
              if (!name) return;
              const id = `collection-${crypto.randomUUID()}`;
              props.onChange([
                ...props.collections,
                {
                  id,
                  title: name,
                  folders: [],
                  showOnHome: true,
                  pinToTop: false,
                  viewMode: "FOLLOW_LAYOUT",
                  showAllTab: true,
                },
              ]);
              setSelectedId(id);
              form.reset();
            }}
          >
            <input
              name="name"
              aria-label="New collection name"
              placeholder="New collection"
              maxLength={100}
              required
            />
            <button className="primary">
              <Plus size={16} /> New collection
            </button>
          </form>
        </div>
        <div className="collection-summary">
          <span>{props.collections.length} collections</span>
          <span>
            {props.collections.reduce(
              (sum, item) => sum + item.folders.length,
              0,
            )}{" "}
            folders
          </span>
          <span>
            {props.collections.filter((item) => item.pinToTop).length} pinned
          </span>
        </div>
        {props.collections.length ? (
          <div className="nuvio-collection-list">
            {props.collections.map((collection, index) => (
              <article key={collection.id}>
                <div className="collection-list-icon">
                  <Layers3 size={20} />
                </div>
                <button
                  className="collection-list-main"
                  onClick={() => setSelectedId(collection.id)}
                >
                  <strong>{collection.title}</strong>
                  <span>
                    {collection.folders.length} folder
                    {collection.folders.length === 1 ? "" : "s"}
                    {collection.pinToTop ? " · Pinned" : ""}
                    {collection.showOnHome === false
                      ? " · Hidden from Home"
                      : ""}
                  </span>
                </button>
                <div className="collection-list-actions">
                  <button
                    aria-label={`Move ${collection.title} up`}
                    disabled={index === 0}
                    onClick={() => moveCollection(index, -1)}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    aria-label={`Move ${collection.title} down`}
                    disabled={index === props.collections.length - 1}
                    onClick={() => moveCollection(index, 1)}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    aria-label={`Edit ${collection.title}`}
                    onClick={() => setSelectedId(collection.id)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="danger-icon"
                    aria-label={`Delete ${collection.title}`}
                    onClick={() =>
                      props.onChange(
                        props.collections.filter(
                          (item) => item.id !== collection.id,
                        ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="catalog-empty">
            <strong>No collections yet</strong>
            <p>Create one here or import collections from General settings.</p>
          </div>
        )}
      </section>
    );
  }

  const sources = folder
    ? ((folder.sources?.length ? folder.sources : folder.catalogSources) ?? [])
    : [];
  return (
    <section className="settings-card nuvio-collections-manager collection-detail-editor">
      <div className="collection-editor-bar">
        <button
          onClick={() => {
            setSelectedId("");
            setFolderId("");
          }}
        >
          <ArrowLeft size={17} /> Collections
        </button>
        <div>
          <span className="eyebrow">EDIT COLLECTION</span>
          <h2>{selected.title}</h2>
        </div>
        <span className="save-state">
          <Save size={15} /> Saved to profile
        </span>
      </div>
      <div className="collection-settings-grid">
        <label>
          Collection name
          <input
            value={selected.title}
            maxLength={100}
            onChange={(event) =>
              updateCollection({ title: event.target.value })
            }
          />
          <small>Shown on Home and in the collection browser.</small>
        </label>
        <label>
          Backdrop image
          <input
            value={selected.backdropImageUrl ?? ""}
            placeholder="https://… (optional)"
            onChange={(event) =>
              updateCollection({ backdropImageUrl: event.target.value })
            }
          />
          <small>Optional artwork behind the collection header.</small>
        </label>
      </div>
      <div className="collection-preferences">
        <Toggle
          label="Show on Home"
          checked={selected.showOnHome !== false}
          onChange={(value) => updateCollection({ showOnHome: value })}
        />
        <Toggle
          label="Pin above catalogs"
          checked={selected.pinToTop === true}
          onChange={(value) => updateCollection({ pinToTop: value })}
        />
        <Toggle
          label="Show All tab"
          checked={selected.showAllTab !== false}
          onChange={(value) => updateCollection({ showAllTab: value })}
        />
        <label className="segmented-setting">
          <span>View mode</span>
          <select
            value={
              selected.viewMode === "TABS" || selected.viewMode === "tabs"
                ? "TABS"
                : "FOLLOW_LAYOUT"
            }
            onChange={(event) =>
              updateCollection({
                viewMode: event.target.value,
              })
            }
          >
            <option value="FOLLOW_LAYOUT">Folder rows</option>
            <option value="TABS">Folder tabs</option>
          </select>
        </label>
      </div>

      <div className="folder-manager-heading">
        <div>
          <h3>Folders</h3>
          <p>Each folder can combine several catalogs and saved titles.</p>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const title = String(new FormData(form).get("folder") ?? "").trim();
            if (!title) return;
            const id = `folder-${crypto.randomUUID()}`;
            updateCollection({
              folders: [
                ...selected.folders,
                {
                  id,
                  title,
                  sources: [],
                  itemKeys: [],
                  tileShape: "LANDSCAPE",
                },
              ],
            });
            setFolderId(id);
            form.reset();
          }}
        >
          <input
            name="folder"
            aria-label="New folder name"
            placeholder="New folder"
            required
            maxLength={100}
          />
          <button>
            <FolderPlus size={16} /> Add folder
          </button>
        </form>
      </div>
      <div className="folder-editor-layout">
        <div className="folder-list">
          {selected.folders.map((item, index) => (
            <article
              className={item.id === folderId ? "selected" : ""}
              key={item.id}
            >
              <button
                className="folder-main"
                onClick={() => setFolderId(item.id)}
              >
                <strong>{item.title}</strong>
                <span>
                  {
                    (
                      (item.sources?.length
                        ? item.sources
                        : item.catalogSources) ?? []
                    ).length
                  }{" "}
                  sources · {item.itemKeys?.length ?? 0} saved
                </span>
              </button>
              <div>
                <button
                  aria-label={`Move ${item.title} up`}
                  disabled={index === 0}
                  onClick={() => moveFolder(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  aria-label={`Move ${item.title} down`}
                  disabled={index === selected.folders.length - 1}
                  onClick={() => moveFolder(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  aria-label={`Edit ${item.title}`}
                  onClick={() => setFolderId(item.id)}
                >
                  <Pencil size={14} />
                </button>
                <button
                  className="danger-icon"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => {
                    updateCollection({
                      folders: selected.folders.filter(
                        (entry) => entry.id !== item.id,
                      ),
                    });
                    if (folderId === item.id) setFolderId("");
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </article>
          ))}
        </div>
        {folder ? (
          <div className="folder-detail">
            <div className="collection-settings-grid">
              <label>
                Folder name
                <input
                  value={folder.title}
                  onChange={(event) =>
                    updateFolder({ title: event.target.value })
                  }
                />
              </label>
              <label>
                Cover image
                <input
                  value={folder.coverImageUrl ?? ""}
                  placeholder="https://… (optional)"
                  onChange={(event) =>
                    updateFolder({ coverImageUrl: event.target.value })
                  }
                />
              </label>
            </div>
            <label className="segmented-setting">
              <span>Artwork layout</span>
              <select
                value={
                  folder.tileShape === "POSTER" || folder.layout === "poster"
                    ? "POSTER"
                    : "LANDSCAPE"
                }
                onChange={(event) =>
                  updateFolder({
                    tileShape: event.target.value,
                  })
                }
              >
                <option value="LANDSCAPE">Wide</option>
                <option value="POSTER">Poster</option>
              </select>
            </label>
            <form
              className="source-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const choice = choices[Number(data.get("catalog"))];
                if (!choice) return;
                const source: CollectionSource = {
                  provider: "addon",
                  addonId: choice.addonId,
                  type: choice.type,
                  catalogId: choice.catalogId,
                  genre: String(data.get("genre") ?? "").trim() || undefined,
                };
                updateFolder({
                  sources: [...sources, source],
                  catalogSources: [],
                });
              }}
            >
              <label className="grow">
                Add catalog
                <select name="catalog">
                  {choices.map((choice, index) => (
                    <option
                      value={index}
                      key={`${choice.addonId}:${choice.type}:${choice.catalogId}:${index}`}
                    >
                      {choice.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Genre filter
                <input name="genre" placeholder="Optional" />
              </label>
              <button disabled={!choices.length}>
                <Plus size={15} /> Add source
              </button>
            </form>
            <div className="managed-source-list">
              {sources.map((source, index) => (
                <div key={index}>
                  <span>
                    <strong>
                      {String(
                        source.title ?? source.catalogId ?? source.provider,
                      )}
                    </strong>
                    <small>
                      {source.type}
                      {source.genre ? ` · ${source.genre}` : ""}
                    </small>
                  </span>
                  <button
                    aria-label={`Remove source ${index + 1}`}
                    onClick={() =>
                      updateFolder({
                        sources: sources.filter((_, item) => item !== index),
                        catalogSources: [],
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            {!!props.library.length && (
              <details>
                <summary>Add saved titles</summary>
                <div className="collection-picker">
                  {props.library.map((item) => {
                    const key = `${item.source}:${item.provider ?? ""}:${item.type}:${item.id}`;
                    return (
                      <label className="check" key={key}>
                        <input
                          type="checkbox"
                          checked={folder.itemKeys?.includes(key) ?? false}
                          onChange={(event) =>
                            updateFolder({
                              itemKeys: event.target.checked
                                ? [...(folder.itemKeys ?? []), key]
                                : (folder.itemKeys ?? []).filter(
                                    (entry) => entry !== key,
                                  ),
                            })
                          }
                        />
                        {item.name}
                      </label>
                    );
                  })}
                </div>
              </details>
            )}
          </div>
        ) : (
          <div className="folder-detail-empty">
            <FolderPlus size={28} />
            <strong>Select a folder to edit it</strong>
            <p>Or create a new folder above.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function Toggle(props: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="collection-toggle">
      <span>{props.label}</span>
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <i />
    </label>
  );
}
