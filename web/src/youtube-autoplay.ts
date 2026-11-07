export type YouTubeAutoplayPreferences = { enabled: boolean };

const preferenceKey = "tiktak:youtube-autoplay";
const eventName = "tiktak-youtube-autoplay";

export function readYouTubeAutoplayPreferences(): YouTubeAutoplayPreferences {
  return { enabled: localStorage.getItem(preferenceKey) !== "0" };
}

export function writeYouTubeAutoplayPreferences(
  preferences: YouTubeAutoplayPreferences,
) {
  localStorage.setItem(preferenceKey, preferences.enabled ? "1" : "0");
  window.dispatchEvent(new CustomEvent(eventName, { detail: preferences }));
}

export function subscribeYouTubeAutoplayPreferences(
  listener: (preferences: YouTubeAutoplayPreferences) => void,
) {
  const handleChange = (event: Event) =>
    listener(
      (event as CustomEvent<YouTubeAutoplayPreferences>).detail ??
        readYouTubeAutoplayPreferences(),
    );
  const handleStorage = (event: StorageEvent) => {
    if (event.key === preferenceKey) listener(readYouTubeAutoplayPreferences());
  };
  window.addEventListener(eventName, handleChange);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(eventName, handleChange);
    window.removeEventListener("storage", handleStorage);
  };
}
