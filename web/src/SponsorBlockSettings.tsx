import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import {
  readSponsorBlockPreferences,
  sponsorBlockCategories,
  subscribeSponsorBlockPreferences,
  writeSponsorBlockPreferences,
  type SponsorBlockCategory,
} from "./sponsorblock";

type Props = { compact?: boolean; open?: boolean };

export default function SponsorBlockSettings({
  compact = false,
  open = false,
}: Props) {
  const [preferences, setPreferences] = useState(readSponsorBlockPreferences);

  useEffect(() => subscribeSponsorBlockPreferences(setPreferences), []);

  const update = (next: typeof preferences) => {
    setPreferences(next);
    writeSponsorBlockPreferences(next);
  };
  const toggleCategory = (category: SponsorBlockCategory, checked: boolean) => {
    update({
      ...preferences,
      categories: checked
        ? [...preferences.categories, category]
        : preferences.categories.filter((item) => item !== category),
    });
  };

  return (
    <div className={`sponsorblock-settings${compact ? " compact" : ""}`}>
      <label className="sponsorblock-master">
        <span>
          <ShieldCheck size={20} />
          <span>
            <strong>Skip SponsorBlock segments</strong>
            {!compact && (
              <small>Automatically jump over the categories you select.</small>
            )}
          </span>
        </span>
        <input
          type="checkbox"
          checked={preferences.enabled}
          onChange={(event) =>
            update({ ...preferences, enabled: event.target.checked })
          }
          aria-label="Enable SponsorBlock skipping"
        />
      </label>
      <details open={open}>
        <summary>Choose what to skip</summary>
        <div className="sponsorblock-categories">
          {sponsorBlockCategories.map((category) => (
            <label key={category.id}>
              <input
                type="checkbox"
                checked={preferences.categories.includes(category.id)}
                disabled={!preferences.enabled}
                onChange={(event) =>
                  toggleCategory(category.id, event.target.checked)
                }
              />
              <span>
                <strong>{category.label}</strong>
                {!compact && <small>{category.description}</small>}
              </span>
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
