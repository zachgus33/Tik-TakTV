import { CheckCircle2, SlidersHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import type { Addon } from "./types";
import {
  parseExcludedTerms,
  validStreamRegex,
  type StreamPreferences,
} from "./stream-selection";
import { importStreamBadges } from "./stream-badges";

const presets = [
  ["1440p or better", "(1440p|2160p|4k)"],
  ["Debridio 1440p", "(?=.*Debridio)(?=.*1440p)"],
  ["1080p or better", "(1080p|1440p|2160p|4k)"],
  ["Web sources", "(web[-\\s]?dl|webrip)"],
  ["Blu-ray / remux", "(bluray|b[dr]rip|remux)"],
  ["HEVC / x265", "(hevc|x265|h\\.265)"],
  ["No CAM / telesync", "^(?!.*\\b(cam|hdcam|ts|telesync)\\b).*$"],
] as const;

export default function StreamSettingsPanel({
  addons,
  value,
  onSave,
}: {
  addons: Addon[];
  value: StreamPreferences;
  onSave: (value: StreamPreferences) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [message, setMessage] = useState("");
  const [excludedTermsText, setExcludedTermsText] = useState(
    value.excludedTerms.join(", "),
  );
  const [badgeUrl, setBadgeUrl] = useState("");
  const [badgeBusy, setBadgeBusy] = useState(false);
  useEffect(() => {
    setDraft(value);
    setExcludedTermsText(value.excludedTerms.join(", "));
  }, [value]);
  const update = <K extends keyof StreamPreferences>(
    key: K,
    next: StreamPreferences[K],
  ) => setDraft((current) => ({ ...current, [key]: next }));
  const streamingAddons = addons
    .filter((addon) => addon.enabled !== false)
    .filter((addon) =>
      addon.manifest.resources?.some((resource) =>
        typeof resource === "string"
          ? resource === "stream"
          : resource.name === "stream",
      ),
    );

  return (
    <section className="settings-card stream-settings-panel">
      <div className="card-heading">
        <SlidersHorizontal />
        <div>
          <h2>Streams</h2>
          <p>
            TikTakTV mobile-style source selection, reuse, and add-on scope.
          </p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Automatic source selection
          <select
            value={draft.autoPlayMode}
            onChange={(event) =>
              update(
                "autoPlayMode",
                event.target.value === "manual" ||
                  event.target.value === "regex"
                  ? event.target.value
                  : "first",
              )
            }
          >
            <option value="manual">Choose a stream manually</option>
            <option value="first">First matching stream</option>
            <option value="regex">Custom regex match</option>
          </select>
        </label>
        <label>
          Selection delay
          <select
            value={draft.autoPlayTimeoutSeconds}
            onChange={(event) =>
              update("autoPlayTimeoutSeconds", Number(event.target.value))
            }
          >
            {[
              0,
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
              10,
              15,
              20,
              25,
              30,
              Number.MAX_SAFE_INTEGER,
            ].map((seconds) => (
              <option value={seconds} key={seconds}>
                {seconds === 0
                  ? "Instant"
                  : seconds === Number.MAX_SAFE_INTEGER
                    ? "Unlimited — wait for every add-on"
                    : `${seconds} second${seconds === 1 ? "" : "s"}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source scope
          <select
            value={draft.autoPlaySource}
            onChange={(event) =>
              update(
                "autoPlaySource",
                event.target.value === "addons" ? "addons" : "all",
              )
            }
          >
            <option value="all">All sources</option>
            <option value="addons">Installed add-ons</option>
          </select>
        </label>
        {draft.autoPlayMode === "regex" && (
          <label className="grow">
            Custom stream regex
            <input
              value={draft.autoPlayRegex}
              placeholder="(?=.*Debridio)(?=.*1440p)"
              onChange={(event) => update("autoPlayRegex", event.target.value)}
            />
          </label>
        )}
      </div>
      {draft.autoPlayMode === "regex" && (
        <div className="source-regex-presets" aria-label="Regex presets">
          {presets.map(([label, pattern]) => (
            <button
              key={label}
              type="button"
              onClick={() => update("autoPlayRegex", pattern)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <section className="stream-filter-settings">
        <div>
          <h3>Source filters</h3>
          <p className="hint">
            Applied to automatic first-match selection and downloads. An
            explicit custom regex controls its own matches; manual source lists
            remain complete.
          </p>
        </div>
        <div className="form-grid">
          <label>
            Maximum quality
            <select
              value={draft.maxQuality}
              onChange={(event) =>
                update("maxQuality", Number(event.target.value))
              }
            >
              <option value="720">720p</option>
              <option value="1080">1080p</option>
              <option value="1440">1440p</option>
              <option value="2160">4K</option>
              <option value="4320">8K / no practical limit</option>
            </select>
          </label>
          <label>
            Maximum file size (GB, 0 for unlimited)
            <input
              type="number"
              min="0"
              step="0.5"
              value={draft.maxSizeGb}
              onChange={(event) =>
                update("maxSizeGb", Math.max(0, Number(event.target.value)))
              }
            />
          </label>
          <label>
            Codec preference
            <select
              value={draft.codec}
              onChange={(event) =>
                update("codec", event.target.value === "h264" ? "h264" : "any")
              }
            >
              <option value="any">Any compatible codec</option>
              <option value="h264">H.264 / AVC only</option>
            </select>
          </label>
          <label className="grow">
            Excluded terms (comma separated)
            <input
              value={excludedTermsText}
              placeholder="CAM, telesync, dubbed"
              onChange={(event) => setExcludedTermsText(event.target.value)}
            />
            <small>
              Enter as many terms as you need, separated by commas.
            </small>
          </label>
        </div>
      </section>
      <div className="stream-behavior-grid">
        <label className="check">
          <input
            type="checkbox"
            checked={draft.reuseLastLink}
            onChange={(event) => update("reuseLastLink", event.target.checked)}
          />
          Reuse the last working link
        </label>
        {draft.reuseLastLink && (
          <label>
            Reuse link for
            <select
              value={draft.reuseLastLinkHours}
              onChange={(event) =>
                update("reuseLastLinkHours", Number(event.target.value))
              }
            >
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="12">12 hours</option>
              <option value="24">24 hours</option>
              <option value="72">3 days</option>
              <option value="168">7 days</option>
            </select>
          </label>
        )}
        <label className="check">
          <input
            type="checkbox"
            checked={draft.preferBingeGroup}
            onChange={(event) =>
              update("preferBingeGroup", event.target.checked)
            }
          />
          Prefer the current series release group
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.reuseBingeGroup}
            onChange={(event) =>
              update("reuseBingeGroup", event.target.checked)
            }
          />
          Reuse that group for the next episode
        </label>
      </div>
      <fieldset className="source-addon-scope">
        <legend>Automatic selection add-ons</legend>
        <p className="hint">
          Leave every add-on unchecked to use all installed add-ons.
        </p>
        {streamingAddons.length ? (
          streamingAddons.map((addon) => (
            <label className="check" key={addon.base}>
              <input
                type="checkbox"
                checked={draft.autoPlaySelectedAddons.includes(addon.base)}
                onChange={(event) =>
                  update(
                    "autoPlaySelectedAddons",
                    event.target.checked
                      ? [...draft.autoPlaySelectedAddons, addon.base]
                      : draft.autoPlaySelectedAddons.filter(
                          (id) => id !== addon.base,
                        ),
                  )
                }
              />
              {addon.manifest.name}
            </label>
          ))
        ) : (
          <p className="hint">Install a streaming add-on to choose it here.</p>
        )}
      </fieldset>
      {draft.pinnedSources.length > 0 && (
        <section className="pinned-stream-sources">
          <div>
            <h3>Pinned sources</h3>
            <p className="hint">
              These add-on groups appear first in manual source lists.
            </p>
          </div>
          {draft.pinnedSources.map((source) => (
            <article key={source.id}>
              <span>
                <strong>{source.name}</strong>
                <small>{source.id}</small>
              </span>
              <button
                type="button"
                onClick={() =>
                  update(
                    "pinnedSources",
                    draft.pinnedSources.filter(
                      (candidate) => candidate.id !== source.id,
                    ),
                  )
                }
              >
                Unpin
              </button>
            </article>
          ))}
        </section>
      )}
      <section className="stream-badge-settings">
        <div>
          <h3>Stream badges</h3>
          <p className="hint">
            Import up to three mobile-compatible badge-rule URLs. One rule set
            is active at a time.
          </p>
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (!badgeUrl.trim() || badgeBusy) return;
            if (
              draft.streamBadgeImports.length >= 3 &&
              !draft.streamBadgeImports.some(
                (entry) => entry.sourceUrl === badgeUrl.trim(),
              )
            ) {
              setMessage("Remove a badge URL before importing another one.");
              return;
            }
            setBadgeBusy(true);
            setMessage("");
            void importStreamBadges(badgeUrl).then(
              (badgeImport) => {
                const previous = draft.streamBadgeImports.filter(
                  (entry) => entry.sourceUrl !== badgeImport.sourceUrl,
                );
                update("streamBadgeImports", [
                  ...previous.map((entry) => ({
                    ...entry,
                    isActive: false,
                  })),
                  badgeImport,
                ]);
                setBadgeUrl("");
                setMessage(
                  `Imported ${badgeImport.filters.length} stream badge rules. Save to sync them.`,
                );
                setBadgeBusy(false);
              },
              (error) => {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : "Could not import stream badges.",
                );
                setBadgeBusy(false);
              },
            );
          }}
        >
          <label className="grow">
            Badge rules URL
            <input
              type="url"
              value={badgeUrl}
              placeholder="https://example.com/stream-badges.json"
              onChange={(event) => setBadgeUrl(event.target.value)}
            />
          </label>
          <button type="submit" disabled={badgeBusy || !badgeUrl.trim()}>
            {badgeBusy ? "Importing…" : "Import"}
          </button>
        </form>
        {draft.streamBadgeImports.length > 0 && (
          <div className="stream-badge-imports">
            {draft.streamBadgeImports.map((entry) => (
              <article key={entry.sourceUrl}>
                <label className="check">
                  <input
                    type="radio"
                    name="active-stream-badges"
                    checked={entry.isActive}
                    onChange={() =>
                      update(
                        "streamBadgeImports",
                        draft.streamBadgeImports.map((candidate) => ({
                          ...candidate,
                          isActive:
                            candidate.sourceUrl === entry.sourceUrl,
                        })),
                      )
                    }
                  />
                  <span>
                    <strong>{entry.filters.length} badges</strong>
                    <small>{entry.sourceUrl}</small>
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "streamBadgeImports",
                      draft.streamBadgeImports
                        .filter(
                          (candidate) =>
                            candidate.sourceUrl !== entry.sourceUrl,
                        )
                        .map((candidate, index) => ({
                          ...candidate,
                          isActive: index === 0,
                        })),
                    )
                  }
                >
                  Remove
                </button>
              </article>
            ))}
          </div>
        )}
        <div className="stream-behavior-grid">
          <label className="check">
            <input
              type="checkbox"
              checked={draft.showFileSizeBadges}
              onChange={(event) =>
                update("showFileSizeBadges", event.target.checked)
              }
            />
            Show file-size badges
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.showAddonNameBadge}
              onChange={(event) =>
                update("showAddonNameBadge", event.target.checked)
              }
            />
            Show add-on badges
          </label>
          <label>
            Badge position
            <select
              value={draft.streamBadgePlacement}
              onChange={(event) =>
                update(
                  "streamBadgePlacement",
                  event.target.value === "top" ? "top" : "bottom",
                )
              }
            >
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
            </select>
          </label>
        </div>
      </section>
      <div className="actions">
        <button
          type="button"
          className="primary"
          onClick={() => {
            if (
              draft.autoPlayMode === "regex" &&
              !validStreamRegex(draft.autoPlayRegex)
            ) {
              setMessage(
                "Enter a valid stream regex containing at least one word or number.",
              );
              return;
            }
            onSave({
              ...draft,
              excludedTerms: parseExcludedTerms(excludedTermsText),
              updatedAt: Date.now(),
            });
            setMessage("Stream settings saved to this TikTakTV profile.");
          }}
        >
          Save stream settings
        </button>
      </div>
      {message && (
        <p className="hint stream-settings-message" role="status">
          <CheckCircle2 size={15} /> {message}
        </p>
      )}
      <p className="hint">
        Add-ons stay in installed order, direct debrid groups appear first, and
        regex only controls automatic eligibility. The manual chooser always
        shows every playable result grouped by add-on.
      </p>
    </section>
  );
}
