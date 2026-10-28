import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { HomeCatalogSetting } from "./account";
import {
  catalogChoices,
  completeCatalogSettings,
  normalizeCatalogOrder,
  settingMatchesChoice,
} from "./catalog-settings";
import type { Addon } from "./types";

export default function CatalogManager(props: {
  addons: Addon[];
  value: HomeCatalogSetting[];
  onChange: (value: HomeCatalogSetting[]) => void;
}) {
  const choices = catalogChoices(props.addons);
  const collectionSettings = props.value.filter((item) => item.is_collection);
  const configured = props.value
    .filter((item) => !item.is_collection)
    .sort((a, b) => a.order - b.order);
  const rows = configured.flatMap((setting) => {
    const choice = choices.find((item) => settingMatchesChoice(setting, item));
    return choice ? [{ setting, choice }] : [];
  });
  const unused = choices.filter(
    (choice) =>
      !configured.some((setting) => settingMatchesChoice(setting, choice)),
  );

  const commit = (next: HomeCatalogSetting[]) =>
    props.onChange([...normalizeCatalogOrder(next), ...collectionSettings]);
  const ensureRows = () => completeCatalogSettings(choices, props.value);

  return (
    <section className="settings-card catalog-manager">
      <div className="card-heading catalog-manager-heading">
        <div>
          <h2>Catalog manager</h2>
          <p>
            Build the rows shown on Home from your installed add-ons. Rename,
            arrange, hide, or remove rows without changing the add-on itself.
          </p>
        </div>
        <span className="badge">
          {rows.filter(({ setting }) => setting.enabled).length} visible
        </span>
      </div>

      {!choices.length ? (
        <div className="catalog-empty">
          <strong>No catalogs available</strong>
          <p>Install a catalog add-on first, then return here to arrange it.</p>
        </div>
      ) : (
        <>
          {!configured.length && (
            <div className="catalog-start">
              <div>
                <strong>Use your installed catalogs</strong>
                <p>Create an editable Home layout from every available row.</p>
              </div>
              <button type="button" onClick={() => commit(ensureRows())}>
                <Plus size={16} /> Create layout
              </button>
            </div>
          )}

          <div className="catalog-manager-list" aria-label="Managed catalogs">
            {rows.map(({ setting, choice }, index) => (
              <article
                className={!setting.enabled ? "is-hidden" : ""}
                key={choice.key}
              >
                <div className="catalog-order">{index + 1}</div>
                <div className="catalog-editor-fields">
                  <input
                    aria-label={`Title for ${choice.catalogName}`}
                    value={setting.custom_title ?? choice.catalogName}
                    onChange={(event) =>
                      commit(
                        configured.map((item) =>
                          settingMatchesChoice(item, choice)
                            ? { ...item, custom_title: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  <span>
                    {choice.addonName} ·{" "}
                    {choice.type === "movie" ? "Movies" : "Series"}
                  </span>
                </div>
                <div className="catalog-actions">
                  <button
                    type="button"
                    aria-label={`Move ${choice.catalogName} up`}
                    disabled={index === 0}
                    onClick={() => {
                      const next = [...configured];
                      [next[index - 1], next[index]] = [
                        next[index],
                        next[index - 1],
                      ];
                      commit(next);
                    }}
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${choice.catalogName} down`}
                    disabled={index === rows.length - 1}
                    onClick={() => {
                      const next = [...configured];
                      [next[index], next[index + 1]] = [
                        next[index + 1],
                        next[index],
                      ];
                      commit(next);
                    }}
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label={`${setting.enabled ? "Hide" : "Show"} ${choice.catalogName}`}
                    onClick={() =>
                      commit(
                        configured.map((item) =>
                          settingMatchesChoice(item, choice)
                            ? { ...item, enabled: !item.enabled }
                            : item,
                        ),
                      )
                    }
                  >
                    {setting.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
                  </button>
                  <button
                    type="button"
                    className="danger-icon"
                    aria-label={`Remove ${choice.catalogName}`}
                    onClick={() =>
                      commit(
                        configured.filter(
                          (item) => !settingMatchesChoice(item, choice),
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

          {!!configured.length && !!unused.length && (
            <form
              className="catalog-add-form"
              onSubmit={(event) => {
                event.preventDefault();
                const key = String(
                  new FormData(event.currentTarget).get("catalog"),
                );
                const choice = unused.find((item) => item.key === key);
                if (!choice) return;
                commit([
                  ...configured,
                  {
                    addon_id: choice.addonId,
                    type: choice.type,
                    catalog_id: choice.catalogId,
                    enabled: true,
                    order: configured.length,
                    key: choice.key,
                  },
                ]);
              }}
            >
              <label className="grow">
                Add another catalog
                <select name="catalog" aria-label="Catalog to add">
                  {unused.map((choice) => (
                    <option key={choice.key} value={choice.key}>
                      {choice.catalogName} · {choice.addonName}
                    </option>
                  ))}
                </select>
              </label>
              <button>
                <Plus size={16} /> Add row
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}
