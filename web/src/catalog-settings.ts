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

// Some add-ons expose movie and series items through a shared catalog type.
// Keep the manifest's type for requests; the returned metas carry their own type.
export function isMediaCatalogType(type: string): boolean {
  return ["movie", "series", "trakt", "all"].includes(type);
}

export function catalogChoices(addons: Addon[]): CatalogChoice[] {
  return addons
    .filter((addon) => addon.enabled !== false)
    .flatMap((addon) =>
      (addon.manifest.catalogs ?? [])
        .filter(
          (catalog) =>
            isMediaCatalogType(catalog.type) &&
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

export function assignedCatalogSettings(
  choices: CatalogChoice[],
  settings: HomeCatalogSetting[],
) {
  const claimed = new Set<number>();
  const assignments = new Map<HomeCatalogSetting, CatalogChoice>();
  // URL-specific web settings take priority. Older native settings only name
  // the manifest, so each legacy row claims one remaining installation.
  for (const setting of [
    ...settings.filter((item) => item.key?.includes("|")),
    ...settings.filter((item) => !item.key?.includes("|")),
  ]) {
    const index = choices.findIndex((choice, candidate) =>
      !claimed.has(candidate) && settingMatchesChoice(setting, choice),
    );
    if (index < 0) continue;
    claimed.add(index);
    assignments.set(setting, choices[index]);
  }
  return settings.flatMap((setting) => {
    const choice = assignments.get(setting);
    return choice ? [{ setting, choice }] : [];
  });
}

export function completeCatalogSettings(
  choices: CatalogChoice[],
  settings: HomeCatalogSetting[],
) {
  const active = settings.filter((setting) => !setting.is_collection && !setting.removed);
  const assigned = assignedCatalogSettings(choices, active);
  return choices.map((choice, index) => {
    const existing = assigned.find((item) => item.choice.key === choice.key)?.setting;
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

export function homeCatalogEntries(
  addons: Addon[],
  settings: HomeCatalogSetting[],
) {
  const available = addons
    .filter((addon) => addon.enabled !== false)
    .flatMap((addon) =>
      (addon.manifest.catalogs ?? [])
        .filter(
          (catalog) =>
            isMediaCatalogType(catalog.type) &&
            !catalog.extra?.some((extra) => extra.isRequired),
        )
        .map((catalog) => ({
          addon,
          catalog,
          choice: {
            key: `${addon.base}|${catalog.type}|${catalog.id}`,
            addonId: addon.manifest.id,
            addonName: addon.manifest.name,
            catalogId: catalog.id,
            catalogName: catalog.name || addon.manifest.name,
            type: catalog.type,
          } satisfies CatalogChoice,
        })),
    );
  const rows = settings.filter((setting) => !setting.is_collection);
  if (!settings.some((setting) => !setting.is_collection))
    return available.map(({ addon, catalog }) => ({
      addon,
      catalog,
      customTitle: undefined as string | undefined,
    }));
  const assignments = assignedCatalogSettings(available.map((item) => item.choice), rows);
  const assigned = new Set(assignments.map(({ choice }) => choice.key));
  const configured = assignments
    .sort((a, b) => Number(a.setting.order) - Number(b.setting.order))
    .flatMap(({ setting, choice }) => {
      if (!setting.enabled || setting.removed) return [];
      const match = available.find((item) => item.choice.key === choice.key)!;
      return [{
        addon: match.addon,
        catalog: match.catalog,
        customTitle: setting.custom_title,
      }];
    });
  const newCatalogs = available
    .filter(({ choice }) => !assigned.has(choice.key))
    .map(({ addon, catalog }) => ({
      addon,
      catalog,
      customTitle: undefined as string | undefined,
    }));
  return [...configured, ...newCatalogs];
}
