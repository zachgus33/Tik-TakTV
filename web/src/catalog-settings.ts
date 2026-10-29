import type { HomeCatalogSetting } from "./account";
import type { Addon } from "./types";

export type CatalogChoice = {
  key: string;
  addonId: string;
  addonName: string;
  catalogId: string;
  catalogName: string;
  type: string;
};

export function catalogChoices(addons: Addon[]): CatalogChoice[] {
  return addons
    .filter((addon) => addon.enabled !== false)
    .flatMap((addon) =>
      (addon.manifest.catalogs ?? [])
        .filter(
          (catalog) =>
            ["movie", "series"].includes(catalog.type) &&
            !catalog.extra?.some((extra) => extra.isRequired),
        )
        .map((catalog) => ({
          key: `${addon.base}|${catalog.type}|${catalog.id}`,
          addonId: addon.manifest.id,
          addonName: addon.manifest.name,
          catalogId: catalog.id,
          catalogName: catalog.name || addon.manifest.name,
          type: catalog.type,
        })),
    );
}

export function settingMatchesChoice(
  setting: HomeCatalogSetting,
  choice: CatalogChoice,
) {
  // TikTak TV keys include the configured add-on URL so two installations of
  // the same manifest stay distinct. Native Nuvio uses colon-separated keys;
  // those still match by their manifest/catalog fields during migration.
  if (setting.key?.includes("|")) return setting.key === choice.key;
  return (
    setting.addon_id === choice.addonId &&
    setting.type === choice.type &&
    setting.catalog_id === choice.catalogId
  );
}

export function completeCatalogSettings(
  choices: CatalogChoice[],
  settings: HomeCatalogSetting[],
) {
  const active = settings.filter((setting) => !setting.is_collection);
  return choices.map((choice, index) => {
    const existing = active.find((setting) =>
      settingMatchesChoice(setting, choice),
    );
    return {
      addon_id: choice.addonId,
      type: choice.type,
      catalog_id: choice.catalogId,
      enabled: existing?.enabled ?? true,
      order: existing?.order ?? index,
      custom_title: existing?.custom_title,
      key: choice.key,
    } satisfies HomeCatalogSetting;
  });
}

export function normalizeCatalogOrder(settings: HomeCatalogSetting[]) {
  return settings.map((setting, order) => ({ ...setting, order }));
}
