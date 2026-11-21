export type NuvioWebSettings = {
  navigationStyle: "floating" | "rail" | "compact";
  heroMode: "cinematic" | "balanced" | "info-rich";
  heroArtwork: "backdrop" | "poster";
  compactHeroMetadata: boolean;
  showHeroRatings: boolean;
  showHeroOverview: boolean;
  showReleaseDates: boolean;
  motionPreviews: boolean;
  motionPreviewSound: boolean;
  posterSize: "small" | "medium" | "large";
  cardDepth: "flat" | "soft" | "raised";
  continueWatchingEnabled: boolean;
  continueWatchingProgress: boolean;
  continueWatchingRemainingTime: boolean;
  touchGestures: boolean;
  holdToSpeed: boolean;
  holdToSpeedValue: number;
  resizeMode: "fit" | "fill" | "zoom";
  showLoadingOverlay: boolean;
  rememberPlayerChoices: boolean;
  preferredAudioLanguage: string;
  preferredSubtitleLanguage: string;
  subtitleFont: "system" | "rounded" | "serif" | "mono";
  subtitleSize: number;
  subtitleBackground: number;
  subtitlePosition: number;
  autoPlayNextEpisode: boolean;
  nextEpisodeThresholdPercent: number;
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
  heroArtwork: "backdrop",
  compactHeroMetadata: true,
  showHeroRatings: true,
  showHeroOverview: true,
  showReleaseDates: true,
  motionPreviews: true,
  motionPreviewSound: false,
  posterSize: "medium",
  cardDepth: "soft",
  continueWatchingEnabled: true,
  continueWatchingProgress: true,
  continueWatchingRemainingTime: true,
  touchGestures: true,
  holdToSpeed: true,
  holdToSpeedValue: 2,
  resizeMode: "fit",
  showLoadingOverlay: true,
  rememberPlayerChoices: true,
  preferredAudioLanguage: "device",
  preferredSubtitleLanguage: "none",
  subtitleFont: "system",
  subtitleSize: 100,
  subtitleBackground: 65,
  subtitlePosition: 8,
  autoPlayNextEpisode: false,
  nextEpisodeThresholdPercent: 97,
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
    cardDepth: oneOf(
      saved.cardDepth,
      ["flat", "soft", "raised"] as const,
      "soft",
    ),
    continueWatchingEnabled: boolean("continueWatchingEnabled"),
    continueWatchingProgress: boolean("continueWatchingProgress"),
    continueWatchingRemainingTime: boolean("continueWatchingRemainingTime"),
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
    rememberPlayerChoices: boolean("rememberPlayerChoices"),
    preferredAudioLanguage: String(saved.preferredAudioLanguage || "device"),
    preferredSubtitleLanguage: String(
      saved.preferredSubtitleLanguage || "none",
    ),
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
    autoPlayNextEpisode: boolean("autoPlayNextEpisode"),
    nextEpisodeThresholdPercent: Math.min(
      100,
      Math.max(70, Number(saved.nextEpisodeThresholdPercent) || 97),
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
