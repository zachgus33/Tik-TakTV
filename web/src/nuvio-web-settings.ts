export type NuvioWebSettings = {
  navigationStyle: "floating" | "rail" | "compact";
  heroMode: "cinematic" | "balanced" | "info-rich";
  homeHeroEnabled: boolean;
  heroAutoScroll: boolean;
  heroArtwork: "backdrop" | "poster";
  compactHeroMetadata: boolean;
  showHeroRatings: boolean;
  showHeroOverview: boolean;
  showReleaseDates: boolean;
  motionPreviews: boolean;
  motionPreviewSound: boolean;
  posterSize: "small" | "medium" | "large";
  posterLayout: "portrait" | "landscape";
  posterCornerRadius: number;
  hidePosterLabels: boolean;
  homeCatalogColumns: number;
  showCatalogType: boolean;
  hideUnreleasedContent: boolean;
  hideCatalogUnderline: boolean;
  cardDepth: "flat" | "soft" | "raised";
  continueWatchingEnabled: boolean;
  continueWatchingProgress: boolean;
  continueWatchingRemainingTime: boolean;
  continueWatchingStyle: "card" | "poster" | "wide";
  continueWatchingSort: "default" | "streaming" | "split-upcoming";
  continueWatchingShowUnaired: boolean;
  continueWatchingBlurUpcoming: boolean;
  libraryLayout: "horizontal" | "vertical";
  librarySort: "added-desc" | "added-asc" | "title-asc" | "title-desc";
  metaBackgroundMode: "normal" | "cinematic" | "dominant-color";
  metaTabLayout: boolean;
  episodeCardStyle: "horizontal" | "list";
  blurUnwatchedEpisodes: boolean;
  showEpisodeRatings: boolean;
  randomEpisodeButton: boolean;
  metaSections: Record<string, boolean>;
  touchGestures: boolean;
  holdToSpeed: boolean;
  holdToSpeedValue: number;
  resizeMode: "fit" | "fill" | "zoom";
  showLoadingOverlay: boolean;
  rememberPlayerBrightness: boolean;
  rememberPlayerChoices: boolean;
  preferredAudioLanguage: string;
  secondaryPreferredAudioLanguage: string;
  preferredSubtitleLanguage: string;
  secondaryPreferredSubtitleLanguage: string;
  addonSubtitleStartupMode: "fast" | "preferred" | "all";
  useForcedSubtitles: boolean;
  showOnlyPreferredSubtitles: boolean;
  subtitleFont: "system" | "rounded" | "serif" | "mono";
  subtitleSize: number;
  subtitleBackground: number;
  subtitlePosition: number;
  subtitleBold: boolean;
  subtitleTextColor: string;
  subtitleBackgroundColor: string;
  subtitleOutline: boolean;
  subtitleOutlineColor: string;
  skipIntroEnabled: boolean;
  animeSkipEnabled: boolean;
  animeSkipClientId: string;
  introSubmitEnabled: boolean;
  autoPlayNextEpisode: boolean;
  nextEpisodeThresholdMode: "percentage" | "minutes";
  nextEpisodeThresholdPercent: number;
  nextEpisodeMinutesBeforeEnd: number;
  showParentalGuide: boolean;
  playerStatusOverlay: boolean;
  liveTvEnabled: boolean;
  streamSourcePinning: boolean;
  backgroundStreamPrefetch: boolean;
  episodeNotifications: boolean;
  notificationLeadMinutes: number;
  featureHighlights: boolean;
  updatedAt: number;
};

export const defaultNuvioWebSettings: NuvioWebSettings = {
  navigationStyle: "floating",
  heroMode: "balanced",
  homeHeroEnabled: true,
  heroAutoScroll: true,
  heroArtwork: "backdrop",
  compactHeroMetadata: true,
  showHeroRatings: true,
  showHeroOverview: true,
  showReleaseDates: true,
  motionPreviews: true,
  motionPreviewSound: false,
  posterSize: "medium",
  posterLayout: "portrait",
  posterCornerRadius: 16,
  hidePosterLabels: false,
  homeCatalogColumns: 3,
  showCatalogType: true,
  hideUnreleasedContent: false,
  hideCatalogUnderline: false,
  cardDepth: "soft",
  continueWatchingEnabled: true,
  continueWatchingProgress: true,
  continueWatchingRemainingTime: true,
  continueWatchingStyle: "card",
  continueWatchingSort: "default",
  continueWatchingShowUnaired: false,
  continueWatchingBlurUpcoming: true,
  libraryLayout: "horizontal",
  librarySort: "added-desc",
  metaBackgroundMode: "normal",
  metaTabLayout: false,
  episodeCardStyle: "horizontal",
  blurUnwatchedEpisodes: false,
  showEpisodeRatings: true,
  randomEpisodeButton: false,
  metaSections: {
    overview: true,
    production: true,
    cast: true,
    comments: true,
    trailers: true,
    episodes: true,
    details: true,
    collection: true,
    moreLikeThis: true,
  },
  touchGestures: true,
  holdToSpeed: true,
  holdToSpeedValue: 2,
  resizeMode: "fit",
  showLoadingOverlay: true,
  rememberPlayerBrightness: true,
  rememberPlayerChoices: true,
  preferredAudioLanguage: "device",
  secondaryPreferredAudioLanguage: "none",
  preferredSubtitleLanguage: "none",
  secondaryPreferredSubtitleLanguage: "none",
  addonSubtitleStartupMode: "all",
  useForcedSubtitles: true,
  showOnlyPreferredSubtitles: false,
  subtitleFont: "system",
  subtitleSize: 100,
  subtitleBackground: 65,
  subtitlePosition: 8,
  subtitleBold: false,
  subtitleTextColor: "#ffffff",
  subtitleBackgroundColor: "#08070b",
  subtitleOutline: true,
  subtitleOutlineColor: "#000000",
  skipIntroEnabled: true,
  animeSkipEnabled: false,
  animeSkipClientId: "",
  introSubmitEnabled: false,
  autoPlayNextEpisode: false,
  nextEpisodeThresholdMode: "percentage",
  nextEpisodeThresholdPercent: 97,
  nextEpisodeMinutesBeforeEnd: 2,
  showParentalGuide: true,
  playerStatusOverlay: false,
  liveTvEnabled: true,
  streamSourcePinning: false,
  backgroundStreamPrefetch: true,
  episodeNotifications: false,
  notificationLeadMinutes: 30,
  featureHighlights: true,
  updatedAt: 0,
};

const oneOf = <T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
) => (allowed.includes(value as T) ? (value as T) : fallback);

export function normalizeNuvioWebSettings(value: unknown): NuvioWebSettings {
  const saved =
    value && typeof value === "object"
      ? (value as Partial<NuvioWebSettings>)
      : {};
  const boolean = <K extends keyof NuvioWebSettings>(key: K) =>
    typeof saved[key] === "boolean"
      ? (saved[key] as boolean)
      : (defaultNuvioWebSettings[key] as boolean);
  return {
    navigationStyle: oneOf(
      saved.navigationStyle,
      ["floating", "rail", "compact"] as const,
      "floating",
    ),
    heroMode: oneOf(
      saved.heroMode,
      ["cinematic", "balanced", "info-rich"] as const,
      "balanced",
    ),
    homeHeroEnabled: boolean("homeHeroEnabled"),
    heroAutoScroll: boolean("heroAutoScroll"),
    heroArtwork: oneOf(
      saved.heroArtwork,
      ["backdrop", "poster"] as const,
      "backdrop",
    ),
    compactHeroMetadata: boolean("compactHeroMetadata"),
    showHeroRatings: boolean("showHeroRatings"),
    showHeroOverview: boolean("showHeroOverview"),
    showReleaseDates: boolean("showReleaseDates"),
    motionPreviews: boolean("motionPreviews"),
    motionPreviewSound: boolean("motionPreviewSound"),
    posterSize: oneOf(
      saved.posterSize,
      ["small", "medium", "large"] as const,
      "medium",
    ),
    posterLayout: oneOf(
      saved.posterLayout,
      ["portrait", "landscape"] as const,
      "portrait",
    ),
    posterCornerRadius: Math.min(
      32,
      Math.max(0, Number(saved.posterCornerRadius ?? 16)),
    ),
    hidePosterLabels: boolean("hidePosterLabels"),
    homeCatalogColumns: Math.min(
      6,
      Math.max(2, Number(saved.homeCatalogColumns) || 3),
    ),
    showCatalogType: boolean("showCatalogType"),
    hideUnreleasedContent: boolean("hideUnreleasedContent"),
    hideCatalogUnderline: boolean("hideCatalogUnderline"),
    cardDepth: oneOf(
      saved.cardDepth,
      ["flat", "soft", "raised"] as const,
      "soft",
    ),
    continueWatchingEnabled: boolean("continueWatchingEnabled"),
    continueWatchingProgress: boolean("continueWatchingProgress"),
    continueWatchingRemainingTime: boolean("continueWatchingRemainingTime"),
    continueWatchingStyle: oneOf(
      saved.continueWatchingStyle,
      ["card", "poster", "wide"] as const,
      "card",
    ),
    continueWatchingSort: oneOf(
      saved.continueWatchingSort,
      ["default", "streaming", "split-upcoming"] as const,
      "default",
    ),
    continueWatchingShowUnaired: boolean("continueWatchingShowUnaired"),
    continueWatchingBlurUpcoming: boolean("continueWatchingBlurUpcoming"),
    libraryLayout: oneOf(
      saved.libraryLayout,
      ["horizontal", "vertical"] as const,
      "horizontal",
    ),
    librarySort: oneOf(
      saved.librarySort,
      ["added-desc", "added-asc", "title-asc", "title-desc"] as const,
      "added-desc",
    ),
    metaBackgroundMode: oneOf(
      saved.metaBackgroundMode,
      ["normal", "cinematic", "dominant-color"] as const,
      "normal",
    ),
    metaTabLayout: boolean("metaTabLayout"),
    episodeCardStyle: oneOf(
      saved.episodeCardStyle,
      ["horizontal", "list"] as const,
      "horizontal",
    ),
    blurUnwatchedEpisodes: boolean("blurUnwatchedEpisodes"),
    showEpisodeRatings: boolean("showEpisodeRatings"),
    randomEpisodeButton: boolean("randomEpisodeButton"),
    metaSections: {
      ...defaultNuvioWebSettings.metaSections,
      ...(saved.metaSections && typeof saved.metaSections === "object"
        ? Object.fromEntries(
            Object.entries(saved.metaSections).map(([key, enabled]) => [
              key,
              enabled !== false,
            ]),
          )
        : {}),
    },
    touchGestures: boolean("touchGestures"),
    holdToSpeed: boolean("holdToSpeed"),
    holdToSpeedValue: Math.min(
      4,
      Math.max(1.25, Number(saved.holdToSpeedValue) || 2),
    ),
    resizeMode: oneOf(
      saved.resizeMode,
      ["fit", "fill", "zoom"] as const,
      "fit",
    ),
    showLoadingOverlay: boolean("showLoadingOverlay"),
    rememberPlayerBrightness: boolean("rememberPlayerBrightness"),
    rememberPlayerChoices: boolean("rememberPlayerChoices"),
    preferredAudioLanguage: String(saved.preferredAudioLanguage || "device"),
    secondaryPreferredAudioLanguage: String(
      saved.secondaryPreferredAudioLanguage || "none",
    ),
    preferredSubtitleLanguage: String(
      saved.preferredSubtitleLanguage || "none",
    ),
    secondaryPreferredSubtitleLanguage: String(
      saved.secondaryPreferredSubtitleLanguage || "none",
    ),
    addonSubtitleStartupMode: oneOf(
      saved.addonSubtitleStartupMode,
      ["fast", "preferred", "all"] as const,
      "all",
    ),
    useForcedSubtitles: boolean("useForcedSubtitles"),
    showOnlyPreferredSubtitles: boolean("showOnlyPreferredSubtitles"),
    subtitleFont: oneOf(
      saved.subtitleFont,
      ["system", "rounded", "serif", "mono"] as const,
      "system",
    ),
    subtitleSize: Math.min(
      180,
      Math.max(60, Number(saved.subtitleSize) || 100),
    ),
    subtitleBackground: Math.min(
      100,
      Math.max(0, Number(saved.subtitleBackground) || 0),
    ),
    subtitlePosition: Math.min(
      24,
      Math.max(2, Number(saved.subtitlePosition) || 8),
    ),
    subtitleBold: boolean("subtitleBold"),
    subtitleTextColor: /^#[\da-f]{6}$/i.test(
      String(saved.subtitleTextColor ?? ""),
    )
      ? String(saved.subtitleTextColor)
      : "#ffffff",
    subtitleBackgroundColor: /^#[\da-f]{6}$/i.test(
      String(saved.subtitleBackgroundColor ?? ""),
    )
      ? String(saved.subtitleBackgroundColor)
      : "#08070b",
    subtitleOutline: boolean("subtitleOutline"),
    subtitleOutlineColor: /^#[\da-f]{6}$/i.test(
      String(saved.subtitleOutlineColor ?? ""),
    )
      ? String(saved.subtitleOutlineColor)
      : "#000000",
    skipIntroEnabled: boolean("skipIntroEnabled"),
    animeSkipEnabled: boolean("animeSkipEnabled"),
    animeSkipClientId: String(saved.animeSkipClientId ?? "")
      .trim()
      .slice(0, 200),
    introSubmitEnabled: boolean("introSubmitEnabled"),
    autoPlayNextEpisode: boolean("autoPlayNextEpisode"),
    nextEpisodeThresholdMode: oneOf(
      saved.nextEpisodeThresholdMode,
      ["percentage", "minutes"] as const,
      "percentage",
    ),
    nextEpisodeThresholdPercent: Math.min(
      100,
      Math.max(70, Number(saved.nextEpisodeThresholdPercent) || 97),
    ),
    nextEpisodeMinutesBeforeEnd: Math.min(
      30,
      Math.max(0.5, Number(saved.nextEpisodeMinutesBeforeEnd) || 2),
    ),
    showParentalGuide: boolean("showParentalGuide"),
    playerStatusOverlay: boolean("playerStatusOverlay"),
    liveTvEnabled: boolean("liveTvEnabled"),
    streamSourcePinning: boolean("streamSourcePinning"),
    backgroundStreamPrefetch: boolean("backgroundStreamPrefetch"),
    episodeNotifications: boolean("episodeNotifications"),
    notificationLeadMinutes: Math.min(
      1440,
      Math.max(0, Number(saved.notificationLeadMinutes) || 30),
    ),
    featureHighlights: boolean("featureHighlights"),
    updatedAt: Math.max(0, Number(saved.updatedAt) || 0),
  };
}

export function readNuvioWebSettings(): NuvioWebSettings {
  if (typeof localStorage === "undefined") return defaultNuvioWebSettings;
  try {
    return normalizeNuvioWebSettings(
      JSON.parse(localStorage.getItem("tiktak:nuvio-web-settings") || "{}"),
    );
  } catch {
    return defaultNuvioWebSettings;
  }
}

export function saveNuvioWebSettings(value: NuvioWebSettings) {
  const normalized = normalizeNuvioWebSettings(value);
  localStorage.setItem("tiktak:nuvio-web-settings", JSON.stringify(normalized));
  window.dispatchEvent(new Event("tiktak:nuvio-settings-changed"));
  return normalized;
}
