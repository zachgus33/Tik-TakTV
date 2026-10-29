import { getService, type PlaybackService } from "./connection";
import { createClient } from "@supabase/supabase-js";
import { NUVIO_URL, NUVIO_ANON_KEY } from "./nuvio-config";
import { parseCollections, type Collection } from "./collections";
import { installMany, mergeAddons } from "./addon-import";
import { defaultAddon, defaultAddons, safeUrl, addonDetail } from "./api";
import type { Addon, Item, Progress, Provider } from "./types";
import { resolveAccountProvider } from "./provider-sharing";
import { DEFAULT_TMDB_KEY } from "./config";

export const account = createClient(NUVIO_URL, NUVIO_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: "tiktak:account",
  },
});
export type Profile = {
  profile_index: number;
  name: string;
  uses_primary_addons?: boolean;
  uses_primary_plugins?: boolean;
  pin_enabled?: boolean;
  avatar_color_hex?: string;
  avatar_id?: string | null;
  avatar_url?: string | null;
};
export type Avatar = {
  id: string;
  display_name: string;
  storage_path: string;
  bg_color?: string | null;
};
export type Setup = {
  playbackService?: PlaybackService | null;
  tmdbKey?: string;
  addons: Addon[];
  collections: Collection[];
  library: Item[];
  progress: Progress[];
  provider: Provider | null;
  torboxKey: string;
  realDebridKey: string;
  autoplay: boolean;
  homeCatalogs?: HomeCatalogSetting[];
};
export type HomeCatalogSetting = {
  addon_id: string;
  type: string;
  catalog_id: string;
  enabled: boolean;
  order: number;
  custom_title?: string;
  is_collection?: boolean;
  collection_id?: string;
  key?: string;
};
const platform = "tiktak_web";
const baselines = new Map<
  number,
  {
    addons: string;
    collections: string;
    library: Item[];
    rows: Record<string, unknown>[];
    progress: Progress[];
    progressRows: Record<string, unknown>[];
  }
>();
const field = "tikTakWebV1";
function isRemovedPenguPlay(value: unknown) {
  try {
    return new URL(String(value)).hostname.toLowerCase() === "pengu.uk";
  } catch {
    return false;
  }
}
type StoredWebSetup = Partial<Setup> & {
  accountProvider?: Provider | null;
};
const origin = (() => {
  let id = localStorage.getItem("tiktak:client");
  if (!id) {
    id = `tiktak-${crypto.randomUUID()}`;
    localStorage.setItem("tiktak:client", id);
  }
  return id;
})();
export async function rpc<T>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await account.rpc(name, params);
  if (error) throw new Error(`Nuvio sync failed (${name}): ${error.message}`);
  return data as T;
}
export const profiles = () => rpc<Profile[]>("sync_pull_profiles");
export async function ensureProfiles(): Promise<Profile[]> {
  const existing = await profiles();
  if (existing.length) return existing;

  await rpc("sync_push_profiles", {
    p_client_max_profiles: 6,
    p_profiles: [
      {
        profile_index: 1,
        name: "Home",
        avatar_color_hex: "#8E24AA",
        uses_primary_addons: false,
        uses_primary_plugins: false,
        avatar_id: null,
        avatar_url: null,
      },
    ],
    p_origin_client_id: origin,
  });

  // The profile write can take a moment to become visible immediately after
  // Supabase creates a brand-new account.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const created = await profiles();
    if (created.length) return created;
    await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
  }
  throw new Error("Your first profile could not be created. Please try again.");
}
export const avatars = () => rpc<Avatar[]>("get_avatar_catalog");
export const avatarUrl = (avatar: Avatar) =>
  `${NUVIO_URL}/storage/v1/object/public/avatars/${avatar.storage_path}`;
export async function updateProfile(
  current: Profile,
  changes: { name: string; avatar?: Avatar },
) {
  const all = await profiles();
  await rpc("sync_push_profiles", {
    p_client_max_profiles: 6,
    p_profiles: all.map((profile) => ({
      profile_index: profile.profile_index,
      name:
        profile.profile_index === current.profile_index
          ? changes.name
          : profile.name,
      avatar_color_hex:
        profile.profile_index === current.profile_index
          ? (changes.avatar?.bg_color ?? profile.avatar_color_hex ?? "#8E24AA")
          : (profile.avatar_color_hex ?? "#8E24AA"),
      uses_primary_addons: profile.uses_primary_addons ?? false,
      uses_primary_plugins: profile.uses_primary_plugins ?? false,
      avatar_id:
        profile.profile_index === current.profile_index
          ? (changes.avatar?.id ?? profile.avatar_id ?? null)
          : (profile.avatar_id ?? null),
      avatar_url:
        profile.profile_index === current.profile_index
          ? changes.avatar
            ? avatarUrl(changes.avatar)
            : (profile.avatar_url ?? null)
          : (profile.avatar_url ?? null),
    })),
    p_origin_client_id: origin,
  });
}
export async function unlock(profile: Profile, pin: string) {
  if (!profile.pin_enabled) return;
  const data = await rpc<{ unlocked: boolean }[]>("verify_profile_pin", {
    p_profile_id: profile.profile_index,
    p_pin: pin,
  });
  if (!data?.[0]?.unlocked) throw new Error("Profile PIN was not accepted.");
}
async function settings(id: number): Promise<Record<string, unknown>> {
  const rows = await rpc<{ settings_json: unknown }[]>(
    "sync_pull_profile_settings_blob",
    { p_profile_id: id, p_platform: platform },
  );
  const raw = rows?.[0]?.settings_json;
  const value = typeof raw === "string" ? JSON.parse(raw) : raw;
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export async function loadSetup(
  profile: Profile,
): Promise<{ setup: Setup; warnings: string[] }> {
  const id = profile.profile_index;
  const addonId = profile.uses_primary_addons ? 1 : id;
  const [
    blob,
    accountBlob,
    collections,
    addonRows,
    libraryRows,
    credentials,
    progressRows,
    homeRows,
  ] = await Promise.all([
    settings(id),
    id === 1 ? Promise.resolve(null) : settings(1).catch(() => null),
    rpc<{ collections_json: unknown }[]>("sync_pull_collections", {
      p_profile_id: id,
    }),
    account
      .from("addons")
      .select("url,name,enabled,sort_order")
      .eq("profile_id", addonId)
      .order("sort_order"),
    rpc<Record<string, unknown>[]>("sync_pull_library", {
      p_profile_id: id,
      p_limit: 1000,
      p_offset: 0,
    }),
    rpc<{ provider: string; credential_json: Record<string, unknown> }[]>(
      "sync_pull_provider_credentials",
      { p_profile_id: id },
    ).catch(() => []),
    rpc<Record<string, unknown>[]>("sync_pull_watch_progress", {
      p_profile_id: id,
      p_limit: 1000,
    }),
    rpc<{ settings_json: unknown }[]>("sync_pull_home_catalog_settings", {
      p_profile_id: id,
      p_platform: "home_catalog_shared",
    }).catch(() => []),
  ]);
  if (addonRows.error)
    throw new Error("Nuvio could not load your installed add-ons.");
  const web = (blob[field] ?? {}) as Partial<Setup>;
  const accountWeb = (accountBlob?.[field] ?? {}) as StoredWebSetup;
  const ownWeb = web as StoredWebSetup;
  // Xtream credentials belong to the signed-in Nuvio account. Profile 1 is
  // the account-owned storage location, so secondary profiles can read the
  // connection without making it available to any other account.
  const sharedProvider = resolveAccountProvider(id, ownWeb, accountWeb);
  if (!getService() && web.playbackService?.url && web.playbackService?.token)
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify(web.playbackService),
    );
  const urls = (addonRows.data ?? [])
    .filter((a) => !isRemovedPenguPlay(a.url))
    .map((a) => String(a.url));
  const installed = await installMany(urls);
  const restoredAddons = mergeAddons(
    installed.addons,
    Array.isArray(web.addons)
      ? web.addons.filter((addon) => !isRemovedPenguPlay(addon.base))
      : [],
  ).map((addon) => ({
    ...addon,
    enabled:
      (addonRows.data ?? []).find(
        (row) =>
          safeUrl(String(row.url).replace(/\/manifest\.json$/, "")) ===
          addon.base,
      )?.enabled !== false,
  }));
  const warnings = installed.failed
    ? [
        `${installed.failed} add-on${installed.failed === 1 ? "" : "s"} could not be refreshed. Saved configuration was kept; reconnect the playback service and refresh it from Add-ons.`,
      ]
    : [];
  const nativeRows = addonRows.data ?? [];
  const cleanedRows = nativeRows.filter(
    (row) =>
      !isRemovedPenguPlay(row.url) &&
      String(row.name ?? "").toLowerCase() !== "penguplay",
  );
  let savedRows: Record<string, unknown>[] = cleanedRows;
  if (!nativeRows.length || cleanedRows.length !== nativeRows.length) {
    const addonsToSave = !cleanedRows.length
      ? defaultAddons.map((addon, index) => ({
          url: `${addon.base}/manifest.json`,
          name: addon.manifest.name,
          enabled: true,
          sort_order: index,
        }))
      : cleanedRows.map((row, index) => ({ ...row, sort_order: index }));
    await rpc("sync_push_addons", {
      p_profile_id: addonId,
      p_addons: addonsToSave,
      p_origin_client_id: origin,
    });
    savedRows = addonsToSave;
  }
  const library = libraryRows.map((r): Item => ({
    id: String(r.content_id),
    name: String(r.name ?? "Untitled"),
    type: r.content_type === "series" ? "series" : "movie",
    source: "addon",
    provider:
      safeUrl(
        String(r.addon_base_url ?? "").replace(/\/manifest\.json$/, ""),
      ) ?? defaultAddon.base,
    poster: safeUrl(r.poster),
    background: safeUrl(r.background),
    description: String(r.description ?? ""),
  }));
  const tmdb = credentials.find((c) => c.provider === "tmdb")?.credential_json
    .api_key;
  if (typeof tmdb === "string") localStorage.setItem("nuvio:tmdb-key", tmdb);
  const key = credentials.find((c) => c.provider === "debrid:torbox")
    ?.credential_json.api_key;
  const realDebridKey = credentials.find(
    (c) => c.provider === "debrid:realdebrid",
  )?.credential_json.api_key;
  const resolvedCollections = parseCollections(
    collections?.[0]?.collections_json ?? [],
  );
  const homeRaw = homeRows?.[0]?.settings_json;
  const homeBlob = typeof homeRaw === "string" ? JSON.parse(homeRaw) : homeRaw;
  const homeCatalogs = Array.isArray(
    (homeBlob as { items?: unknown[] } | null)?.items,
  )
    ? (homeBlob as { items: HomeCatalogSetting[] }).items
        .filter((item) => item && typeof item === "object")
        .sort((a, b) => Number(a.order) - Number(b.order))
    : [];
  const remoteProgress: Progress[] = [];
  for (const row of [...progressRows]
    .sort((a, b) => Number(b.last_watched) - Number(a.last_watched))
    .slice(0, 30)) {
    if (
      Number(row.duration) <= 0 ||
      Number(row.position) >= Number(row.duration) * 0.97
    )
      continue;
    const type = row.content_type === "series" ? "series" : "movie";
    let item =
      library.find((i) => i.id === row.content_id && i.type === type) ??
      web.progress?.find((p) => p.item.id === row.content_id)?.item;
    if (!item) {
      item = {
        id: String(row.content_id),
        name: String(row.content_id),
        type,
        source: "addon",
        provider: defaultAddon.base,
      };
      try {
        item = (await addonDetail(item)).item;
      } catch {}
    }
    remoteProgress.push({
      item,
      seconds: Number(row.position ?? row.position_ms ?? 0) / 1000,
      duration: Number(row.duration ?? row.duration_ms ?? 0) / 1000,
      at: Number(row.last_watched),
      episode:
        row.season != null && row.episode != null
          ? {
              id: String(row.video_id),
              name: "Episode " + row.episode,
              season: Number(row.season),
              episode: Number(row.episode),
            }
          : undefined,
    });
  }
  const mergedProgress = [
    ...new Map(
      [...(web.progress ?? []), ...remoteProgress]
        .sort((a, b) => a.at - b.at)
        .map((p) => [p.item.id, p]),
    ).values(),
  ]
    .sort((a, b) => b.at - a.at)
    .slice(0, 100);
  baselines.set(id, {
    addons: JSON.stringify(
      restoredAddons.length ? restoredAddons : defaultAddons,
    ),
    collections: JSON.stringify(resolvedCollections),
    library,
    rows: savedRows,
    progress: mergedProgress,
    progressRows,
  });
  return {
    warnings,
    setup: {
      playbackService: getService(),
      tmdbKey:
        typeof tmdb === "string" ? tmdb : (web.tmdbKey ?? DEFAULT_TMDB_KEY),
      addons: restoredAddons.length ? restoredAddons : defaultAddons,
      collections: resolvedCollections,
      library: library.length
        ? library
        : Array.isArray(web.library)
          ? web.library
          : [],
      progress: mergedProgress,
      provider: sharedProvider,
      torboxKey: typeof key === "string" && key ? key : (web.torboxKey ?? ""),
      realDebridKey:
        typeof realDebridKey === "string" && realDebridKey
          ? realDebridKey
          : (web.realDebridKey ?? ""),
      autoplay: web.autoplay ?? true,
      homeCatalogs: homeCatalogs.length ? homeCatalogs : web.homeCatalogs,
    },
  };
}
export async function saveSetup(profile: Profile, setup: Setup) {
  const id = profile.profile_index;
  // Read/merge the native platform blob so unknown settings are retained.
  const blob = await settings(id);
  const profileSetup =
    id === 1 ? { ...setup, accountProvider: setup.provider } : setup;
  await rpc("sync_push_profile_settings_blob", {
    p_profile_id: id,
    p_platform: platform,
    p_settings_json: { ...blob, [field]: profileSetup },
    p_origin_client_id: origin,
  });
  if (id !== 1) {
    const accountBlob = await settings(1);
    const accountWeb = (accountBlob[field] ?? {}) as Record<string, unknown>;
    await rpc("sync_push_profile_settings_blob", {
      p_profile_id: 1,
      p_platform: platform,
      p_settings_json: {
        ...accountBlob,
        [field]: { ...accountWeb, accountProvider: setup.provider },
      },
      p_origin_client_id: origin,
    });
  }
  const previous = baselines.get(id);
  if (!previous) throw new Error("Load this Nuvio profile before saving.");
  if (previous.addons !== JSON.stringify(setup.addons))
    await rpc("sync_push_addons", {
      p_profile_id: profile.uses_primary_addons ? 1 : id,
      p_addons: [
        ...setup.addons.map((a, index) => ({
          url: `${a.base}/manifest.json`,
          name: a.manifest.name,
          enabled: a.enabled !== false,
          sort_order: index,
        })),
      ],
      p_origin_client_id: origin,
    });
  if (previous.collections !== JSON.stringify(setup.collections))
    await rpc("sync_push_collections", {
      p_profile_id: id,
      p_collections_json: setup.collections,
      p_origin_client_id: origin,
    });
  const key = (i: Item) => i.type + ":" + i.id;
  const additions = setup.library.filter(
    (i) =>
      i.source === "addon" && !previous.library.some((x) => key(x) === key(i)),
  );
  const removed = previous.library.filter(
    (i) => !setup.library.some((x) => key(x) === key(i)),
  );
  if (additions.length)
    await rpc("sync_push_library_items", {
      p_profile_id: id,
      p_items: additions.map((i) => ({
        content_id: i.id,
        content_type: i.type,
        name: i.name,
        poster: i.poster ?? null,
        poster_shape: "POSTER",
        background: i.background ?? null,
        description: i.description ?? null,
        release_info: i.year ?? null,
        imdb_rating: Number(i.rating) || null,
        genres: i.genres ?? [],
        addon_base_url: i.provider ?? "",
        added_at: Date.now(),
      })),
      p_origin_client_id: origin,
    });
  if (removed.length)
    await rpc("sync_delete_library_items", {
      p_profile_id: id,
      p_keys: removed.map((i) => ({ content_id: i.id, content_type: i.type })),
      p_origin_client_id: origin,
    });
  const changedProgress = setup.progress.filter(
    (p) =>
      p.item.source === "addon" &&
      !previous.progress.some(
        (old) =>
          old.item.id === p.item.id &&
          old.episode?.id === p.episode?.id &&
          old.at === p.at,
      ),
  );
  if (changedProgress.length)
    await rpc("sync_push_watch_progress", {
      p_profile_id: id,
      p_entries: changedProgress.map((p) => ({
        content_id: p.item.id,
        content_type: p.item.type,
        video_id: p.episode?.id ?? p.item.id,
        season: p.episode?.season ?? null,
        episode: p.episode?.episode ?? null,
        position: Math.round(p.seconds * 1000),
        duration: Math.round(p.duration * 1000),
        last_watched: p.at,
        progress_key:
          previous.progressRows.find(
            (r) =>
              r.content_id === p.item.id &&
              (r.season ?? undefined) === p.episode?.season &&
              (r.episode ?? undefined) === p.episode?.episode,
          )?.progress_key ??
          (p.episode
            ? p.item.id + "_s" + p.episode.season + "e" + p.episode.episode
            : p.item.id),
      })),
      p_origin_client_id: origin,
    });
  baselines.set(id, {
    ...previous,
    progress: setup.progress,
    addons: JSON.stringify(setup.addons),
    collections: JSON.stringify(setup.collections),
    library: setup.library.filter((i) => i.source === "addon"),
  });
}
