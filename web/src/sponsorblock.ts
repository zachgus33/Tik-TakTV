export const sponsorBlockCategories = [
  {
    id: "sponsor",
    label: "Sponsors",
    description: "Paid promotions and sponsor reads",
  },
  {
    id: "selfpromo",
    label: "Self-promotion",
    description: "Creator merchandise, memberships, and promotions",
  },
  {
    id: "interaction",
    label: "Interaction reminders",
    description: "Like, subscribe, and comment reminders",
  },
  {
    id: "intro",
    label: "Introductions",
    description: "Opening animations and repeated intros",
  },
  {
    id: "outro",
    label: "End cards and credits",
    description: "Closing sections after the main video",
  },
  {
    id: "preview",
    label: "Previews and recaps",
    description: "Previews or recaps outside the main content",
  },
  {
    id: "music_offtopic",
    label: "Non-music sections",
    description: "Talking or other off-topic sections in music videos",
  },
] as const;

export type SponsorBlockCategory =
  (typeof sponsorBlockCategories)[number]["id"];

export type SponsorBlockPreferences = {
  enabled: boolean;
  categories: SponsorBlockCategory[];
};

const preferenceKey = "tiktak:youtube-sponsorblock-settings";
const legacyKey = "tiktak:youtube-sponsorblock";
const eventName = "tiktak-sponsorblock-settings";
const validCategories = new Set<string>(
  sponsorBlockCategories.map(({ id }) => id),
);

export const defaultSponsorBlockPreferences: SponsorBlockPreferences = {
  enabled: true,
  categories: sponsorBlockCategories.map(({ id }) => id),
};

export function readSponsorBlockPreferences(): SponsorBlockPreferences {
  const legacyEnabled = localStorage.getItem(legacyKey) !== "0";
  try {
    const stored = JSON.parse(
      localStorage.getItem(preferenceKey) ?? "null",
    ) as Partial<SponsorBlockPreferences> | null;
    const categories = Array.isArray(stored?.categories)
      ? stored.categories.filter((category): category is SponsorBlockCategory =>
          validCategories.has(String(category)),
        )
      : defaultSponsorBlockPreferences.categories;
    return {
      enabled:
        typeof stored?.enabled === "boolean" ? stored.enabled : legacyEnabled,
      categories,
    };
  } catch {
    return { ...defaultSponsorBlockPreferences, enabled: legacyEnabled };
  }
}

export function writeSponsorBlockPreferences(
  preferences: SponsorBlockPreferences,
) {
  const normalized: SponsorBlockPreferences = {
    enabled: preferences.enabled,
    categories: [...new Set(preferences.categories)].filter((category) =>
      validCategories.has(category),
    ),
  };
  localStorage.setItem(preferenceKey, JSON.stringify(normalized));
  localStorage.setItem(legacyKey, normalized.enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(eventName, { detail: normalized }));
}

export function subscribeSponsorBlockPreferences(
  listener: (preferences: SponsorBlockPreferences) => void,
) {
  const handleChange = (event: Event) => {
    const detail = (event as CustomEvent<SponsorBlockPreferences>).detail;
    listener(detail ?? readSponsorBlockPreferences());
  };
  const handleStorage = (event: StorageEvent) => {
    if ([preferenceKey, legacyKey].includes(event.key ?? ""))
      listener(readSponsorBlockPreferences());
  };
  window.addEventListener(eventName, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(eventName, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
