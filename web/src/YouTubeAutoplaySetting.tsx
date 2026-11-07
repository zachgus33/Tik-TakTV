import { ListVideo } from "lucide-react";
import { useEffect, useState } from "react";
import {
  readYouTubeAutoplayPreferences,
  subscribeYouTubeAutoplayPreferences,
  writeYouTubeAutoplayPreferences,
} from "./youtube-autoplay";

export default function YouTubeAutoplaySetting({ compact = false }) {
  const [preferences, setPreferences] = useState(
    readYouTubeAutoplayPreferences,
  );
  useEffect(() => subscribeYouTubeAutoplayPreferences(setPreferences), []);
  const update = (enabled: boolean) => {
    const next = { enabled };
    setPreferences(next);
    writeYouTubeAutoplayPreferences(next);
  };
  return (
    <label className={`youtube-autoplay-setting${compact ? " compact" : ""}`}>
      <span>
        <ListVideo size={20} />
        <span>
          <strong>Autoplay next</strong>
          {!compact && (
            <small>
              Continue through the current results or recommendations when a
              video or song ends.
            </small>
          )}
        </span>
      </span>
      <input
        type="checkbox"
        checked={preferences.enabled}
        onChange={(event) => update(event.target.checked)}
        aria-label="Autoplay next YouTube item"
      />
    </label>
  );
}
