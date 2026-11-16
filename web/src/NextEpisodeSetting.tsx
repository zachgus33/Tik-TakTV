import { useEffect, useState } from "react";
import {
  readNextEpisodeAutoAdvance,
  subscribeNextEpisodeAutoAdvance,
  writeNextEpisodeAutoAdvance,
} from "./next-episode";

export default function NextEpisodeSetting({ compact = false }: { compact?: boolean }) {
  const [enabled, setEnabled] = useState(readNextEpisodeAutoAdvance);
  useEffect(
    () => subscribeNextEpisodeAutoAdvance(() => setEnabled(readNextEpisodeAutoAdvance())),
    [],
  );
  return (
    <label className={compact ? "check next-episode-setting compact" : "check next-episode-setting"}>
      <input
        type="checkbox"
        checked={enabled}
        onChange={(event) => {
          setEnabled(event.target.checked);
          writeNextEpisodeAutoAdvance(event.target.checked);
        }}
      />
      Auto-advance to the next episode
      {!compact && <small>Off by default. Starts the next episode when the current one ends, if a playable stream is available.</small>}
    </label>
  );
}
