import {
  Bell,
  Captions,
  Clapperboard,
  Compass,
  LayoutGrid,
  MonitorPlay,
  Palette,
  PlayCircle,
  Radio,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import type { NuvioWebSettings } from "./nuvio-web-settings";
import {
  readIntroDbApiKey,
  saveIntroDbApiKey,
  verifyIntroDbApiKey,
} from "./skip-segments";

function SwitchRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="nuvio-setting-row nuvio-setting-switch">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}

function SelectRow({
  title,
  description,
  value,
  onChange,
  children,
}: {
  title: string;
  description: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="nuvio-setting-row">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function RangeRow({
  title,
  description,
  value,
  min,
  max,
  step = 1,
  suffix = "%",
  onChange,
}: {
  title: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="nuvio-setting-row nuvio-setting-range">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <span className="nuvio-range-control">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <output>
          {value}
          {suffix}
        </output>
      </span>
    </label>
  );
}

function Group({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sparkles;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-card nuvio-settings-group">
      <div className="card-heading">
        <Icon />
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="nuvio-settings-rows">{children}</div>
    </section>
  );
}

export default function NuvioExperienceSettings({
  page,
  value,
  onChange,
}: {
  page:
    | "enhanced"
    | "appearance"
    | "home"
    | "details"
    | "library"
    | "player"
    | "notifications";
  value: NuvioWebSettings;
  onChange: (value: NuvioWebSettings) => void;
}) {
  const [introDbApiKey, setIntroDbApiKey] = useState(readIntroDbApiKey);
  const [introDbStatus, setIntroDbStatus] = useState("");
  const [verifyingIntroDb, setVerifyingIntroDb] = useState(false);
  const update = <K extends keyof NuvioWebSettings>(
    key: K,
    next: NuvioWebSettings[K],
  ) => onChange({ ...value, [key]: next, updatedAt: Date.now() });

  if (page === "appearance")
    return (
      <>
        <Group
          icon={Palette}
          title="App appearance"
          description="Shape the TikTakTV experience across phone, tablet and desktop."
        >
          <SelectRow
            title="Navigation style"
            description="Floating mobile bar, desktop rail, or compact controls."
            value={value.navigationStyle}
            onChange={(next) =>
              update(
                "navigationStyle",
                next as NuvioWebSettings["navigationStyle"],
              )
            }
          >
            <option value="floating">Floating TikTakTV bar</option>
            <option value="rail">Navigation rail</option>
            <option value="compact">Compact</option>
          </SelectRow>
          <SelectRow
            title="Poster size"
            description="Controls Home, Discover and Library card density."
            value={value.posterSize}
            onChange={(next) =>
              update("posterSize", next as NuvioWebSettings["posterSize"])
            }
          >
            <option value="small">Small</option>
            <option value="medium">Medium</option>
            <option value="large">Large</option>
          </SelectRow>
          <SelectRow
            title="Card depth"
            description="Choose flat artwork or TikTakTV-style lifted cards."
            value={value.cardDepth}
            onChange={(next) =>
              update("cardDepth", next as NuvioWebSettings["cardDepth"])
            }
          >
            <option value="flat">Flat</option>
            <option value="soft">Soft</option>
            <option value="raised">Raised</option>
          </SelectRow>
          <RangeRow
            title="Poster corner radius"
            description="Round poster and landscape-card corners across TikTakTV."
            value={value.posterCornerRadius}
            min={0}
            max={32}
            suffix="px"
            onChange={(next) => update("posterCornerRadius", next)}
          />
          <SwitchRow
            title="Hide poster labels"
            description="Use an artwork-only catalog layout without title and metadata labels."
            checked={value.hidePosterLabels}
            onChange={(next) => update("hidePosterLabels", next)}
          />
          <SwitchRow
            title="Feature highlights"
            description="Show badges for newly added TikTakTV features."
            checked={value.featureHighlights}
            onChange={(next) => update("featureHighlights", next)}
          />
        </Group>
        <Group
          icon={LayoutGrid}
          title="Continue watching"
          description="Control the resume shelf shown on Home."
        >
          <SwitchRow
            title="Show Continue Watching"
            description="Keep unfinished movies and episodes on Home."
            checked={value.continueWatchingEnabled}
            onChange={(next) => update("continueWatchingEnabled", next)}
          />
          <SwitchRow
            title="Progress bars"
            description="Show watched progress directly on artwork."
            checked={value.continueWatchingProgress}
            onChange={(next) => update("continueWatchingProgress", next)}
          />
          <SwitchRow
            title="Time remaining"
            description="Show the estimated minutes left below each title."
            checked={value.continueWatchingRemainingTime}
            onChange={(next) => update("continueWatchingRemainingTime", next)}
          />
          <SelectRow
            title="Card style"
            description="Choose a TV-style card, artwork-first poster, or info-dense wide layout."
            value={value.continueWatchingStyle}
            onChange={(next) =>
              update(
                "continueWatchingStyle",
                next as NuvioWebSettings["continueWatchingStyle"],
              )
            }
          >
            <option value="card">Card</option>
            <option value="poster">Poster</option>
            <option value="wide">Wide</option>
          </SelectRow>
          <SelectRow
            title="Sort order"
            description="Keep recency order, move upcoming episodes last, or show them separately."
            value={value.continueWatchingSort}
            onChange={(next) =>
              update(
                "continueWatchingSort",
                next as NuvioWebSettings["continueWatchingSort"],
              )
            }
          >
            <option value="default">Recently watched</option>
            <option value="streaming">Released first</option>
            <option value="split-upcoming">Separate upcoming row</option>
          </SelectRow>
          <SwitchRow
            title="Show unaired next-up episodes"
            description="Keep upcoming episodes visible when synced progress includes a future release."
            checked={value.continueWatchingShowUnaired}
            onChange={(next) => update("continueWatchingShowUnaired", next)}
          />
          {value.continueWatchingShowUnaired && (
            <SwitchRow
              title="Blur upcoming artwork"
              description="Obscure artwork for episodes that have not aired yet."
              checked={value.continueWatchingBlurUpcoming}
              onChange={(next) => update("continueWatchingBlurUpcoming", next)}
            />
          )}
        </Group>
      </>
    );

  if (page === "home")
    return (
      <>
        <Group
          icon={Clapperboard}
          title="Home hero"
          description="TikTakTV hero visibility, rotation and artwork controls."
        >
          <SwitchRow
            title="Show hero"
            description="Display the featured title at the top of Home."
            checked={value.homeHeroEnabled}
            onChange={(next) => update("homeHeroEnabled", next)}
          />
          <SwitchRow
            title="Auto-scroll hero"
            description="Rotate through selected Home catalog titles automatically."
            checked={value.heroAutoScroll}
            onChange={(next) => update("heroAutoScroll", next)}
          />
          <SwitchRow
            title="Motion preview"
            description="Use supported trailers and motion artwork in the hero."
            checked={value.motionPreviews}
            onChange={(next) => update("motionPreviews", next)}
          />
        </Group>
        <Group
          icon={LayoutGrid}
          title="Home catalogs"
          description="TikTakTV poster density and catalog presentation."
        >
          <SelectRow
            title="Poster layout"
            description="Use portrait posters or wide landscape cards."
            value={value.posterLayout}
            onChange={(next) =>
              update("posterLayout", next as NuvioWebSettings["posterLayout"])
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </SelectRow>
          <SelectRow
            title="Catalog columns"
            description="Preferred grid density for Discover and vertical Library layouts."
            value={value.homeCatalogColumns}
            onChange={(next) => update("homeCatalogColumns", Number(next))}
          >
            {[2, 3, 4, 5, 6].map((count) => (
              <option value={count} key={count}>
                {count}
              </option>
            ))}
          </SelectRow>
          <SwitchRow
            title="Show catalog type"
            description="Label movie, series and mixed catalog rows."
            checked={value.showCatalogType}
            onChange={(next) => update("showCatalogType", next)}
          />
          <SwitchRow
            title="Hide unreleased content"
            description="Remove future titles that do not have playable streams yet."
            checked={value.hideUnreleasedContent}
            onChange={(next) => update("hideUnreleasedContent", next)}
          />
          <SwitchRow
            title="Hide catalog underline"
            description="Use a cleaner row heading without the decorative divider."
            checked={value.hideCatalogUnderline}
            onChange={(next) => update("hideCatalogUnderline", next)}
          />
        </Group>
      </>
    );

  if (page === "details")
    return (
      <>
        <Group
          icon={Clapperboard}
          title="Metadata screen"
          description="Control the title-detail background and episode presentation."
        >
          <SelectRow
            title="Background mode"
            description="Normal artwork, cinematic backdrop, or dominant-color surface."
            value={value.metaBackgroundMode}
            onChange={(next) =>
              update(
                "metaBackgroundMode",
                next as NuvioWebSettings["metaBackgroundMode"],
              )
            }
          >
            <option value="normal">Normal</option>
            <option value="cinematic">Cinematic</option>
            <option value="dominant-color">Dominant color</option>
          </SelectRow>
          <SwitchRow
            title="Tabbed detail layout"
            description="Group longer detail sections into compact tabs."
            checked={value.metaTabLayout}
            onChange={(next) => update("metaTabLayout", next)}
          />
          <SelectRow
            title="Episode card style"
            description="Horizontal cards or compact episode list rows."
            value={value.episodeCardStyle}
            onChange={(next) =>
              update(
                "episodeCardStyle",
                next as NuvioWebSettings["episodeCardStyle"],
              )
            }
          >
            <option value="horizontal">Horizontal</option>
            <option value="list">List</option>
          </SelectRow>
          <SwitchRow
            title="Blur unwatched episodes"
            description="Obscure episode artwork until each episode is watched."
            checked={value.blurUnwatchedEpisodes}
            onChange={(next) => update("blurUnwatchedEpisodes", next)}
          />
          <SwitchRow
            title="Show episode ratings"
            description="Display episode ratings when metadata provides them."
            checked={value.showEpisodeRatings}
            onChange={(next) => update("showEpisodeRatings", next)}
          />
          <SwitchRow
            title="Random episode button"
            description="Add a one-click random episode action for series."
            checked={value.randomEpisodeButton}
            onChange={(next) => update("randomEpisodeButton", next)}
          />
        </Group>
        <Group
          icon={Captions}
          title="Detail sections"
          description="Show or hide TikTakTV metadata sections."
        >
          {[
            ["overview", "Overview"],
            ["production", "Production"],
            ["cast", "Cast"],
            ["comments", "Comments"],
            ["trailers", "Trailers"],
            ["episodes", "Episodes"],
            ["details", "Additional details"],
            ["collection", "Collection"],
            ["moreLikeThis", "More like this"],
          ].map(([key, label]) => (
            <SwitchRow
              key={key}
              title={label}
              description={`Show the ${label.toLowerCase()} section on title details.`}
              checked={value.metaSections[key] !== false}
              onChange={(next) =>
                update("metaSections", {
                  ...value.metaSections,
                  [key]: next,
                })
              }
            />
          ))}
        </Group>
      </>
    );

  if (page === "library")
    return (
      <Group
        icon={LayoutGrid}
        title="Library display"
        description="Choose TikTakTV horizontal shelves or a vertical filtered library."
      >
        <SelectRow
          title="Layout"
          description="Horizontal shelves or a vertical poster grid."
          value={value.libraryLayout}
          onChange={(next) =>
            update("libraryLayout", next as NuvioWebSettings["libraryLayout"])
          }
        >
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </SelectRow>
        <SelectRow
          title="Sort order"
          description="Choose how locally saved titles are ordered."
          value={value.librarySort}
          onChange={(next) =>
            update("librarySort", next as NuvioWebSettings["librarySort"])
          }
        >
          <option value="added-desc">Recently added</option>
          <option value="added-asc">Oldest added</option>
          <option value="title-asc">Title A–Z</option>
          <option value="title-desc">Title Z–A</option>
        </SelectRow>
      </Group>
    );

  if (page === "player")
    return (
      <>
        <Group
          icon={MonitorPlay}
          title="Player experience"
          description="TikTakTV player behavior and controls."
        >
          <SwitchRow
            title="Loading overlay"
            description="Show artwork and playback status while a source starts."
            checked={value.showLoadingOverlay}
            onChange={(next) => update("showLoadingOverlay", next)}
          />
          <SwitchRow
            title="Touch gestures"
            description="Tap to reveal controls and use touch player actions."
            checked={value.touchGestures}
            onChange={(next) => update("touchGestures", next)}
          />
          <SwitchRow
            title="Hold to speed"
            description="Temporarily accelerate playback while holding the video."
            checked={value.holdToSpeed}
            onChange={(next) => update("holdToSpeed", next)}
          />
          <SelectRow
            title="Hold speed"
            description="Temporary playback speed used by the hold gesture."
            value={value.holdToSpeedValue}
            onChange={(next) => update("holdToSpeedValue", Number(next))}
          >
            <option value="1.5">1.5×</option>
            <option value="2">2×</option>
            <option value="2.5">2.5×</option>
            <option value="3">3×</option>
          </SelectRow>
          <SelectRow
            title="Video resize mode"
            description="Fit preserves the full picture; fill and zoom crop it."
            value={value.resizeMode}
            onChange={(next) =>
              update("resizeMode", next as NuvioWebSettings["resizeMode"])
            }
          >
            <option value="fit">Fit</option>
            <option value="fill">Fill</option>
            <option value="zoom">Zoom</option>
          </SelectRow>
          <SwitchRow
            title="Remember player choices"
            description="Restore audio, subtitle, speed and display choices."
            checked={value.rememberPlayerChoices}
            onChange={(next) => update("rememberPlayerChoices", next)}
          />
          <SwitchRow
            title="Remember brightness"
            description="Restore the player brightness chosen with the left-edge gesture."
            checked={value.rememberPlayerBrightness}
            onChange={(next) => update("rememberPlayerBrightness", next)}
          />
          <SwitchRow
            title="Parental guide"
            description="Show content guidance when metadata provides it."
            checked={value.showParentalGuide}
            onChange={(next) => update("showParentalGuide", next)}
          />
          <SwitchRow
            title="Player status overlay"
            description="Show source and network state during playback."
            checked={value.playerStatusOverlay}
            onChange={(next) => update("playerStatusOverlay", next)}
          />
        </Group>
        <Group
          icon={Volume2}
          title="Audio and subtitles"
          description="Preferred tracks and TikTakTV caption rendering."
        >
          <SelectRow
            title="Preferred audio"
            description="Used for both source ranking and built-in audio tracks."
            value={value.preferredAudioLanguage}
            onChange={(next) => update("preferredAudioLanguage", next)}
          >
            <option value="original">Original audio</option>
            <option value="device">Device language</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
            <option value="ar">Arabic</option>
            <option value="ru">Russian</option>
          </SelectRow>
          <SelectRow
            title="Preferred subtitles"
            description="Automatically select this language when available."
            value={value.preferredSubtitleLanguage}
            onChange={(next) => update("preferredSubtitleLanguage", next)}
          >
            <option value="none">Off</option>
            <option value="forced">Forced only</option>
            <option value="device">Device language</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
            <option value="ar">Arabic</option>
            <option value="ru">Russian</option>
          </SelectRow>
          <SelectRow
            title="Secondary audio"
            description="Fallback audio language when the primary choice is unavailable."
            value={value.secondaryPreferredAudioLanguage}
            onChange={(next) => update("secondaryPreferredAudioLanguage", next)}
          >
            <option value="none">None</option>
            <option value="original">Original audio</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
            <option value="ar">Arabic</option>
            <option value="ru">Russian</option>
          </SelectRow>
          <SelectRow
            title="Secondary subtitles"
            description="Fallback subtitle language after the primary preference."
            value={value.secondaryPreferredSubtitleLanguage}
            onChange={(next) =>
              update("secondaryPreferredSubtitleLanguage", next)
            }
          >
            <option value="none">None</option>
            <option value="forced">Forced only</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="it">Italian</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
            <option value="ko">Korean</option>
            <option value="zh">Chinese</option>
            <option value="hi">Hindi</option>
            <option value="ar">Arabic</option>
            <option value="ru">Russian</option>
          </SelectRow>
          <SelectRow
            title="Add-on subtitle startup"
            description="Start fastest, fetch preferred languages, or load every subtitle."
            value={value.addonSubtitleStartupMode}
            onChange={(next) =>
              update(
                "addonSubtitleStartupMode",
                next as NuvioWebSettings["addonSubtitleStartupMode"],
              )
            }
          >
            <option value="fast">Fast startup</option>
            <option value="preferred">Preferred languages only</option>
            <option value="all">All subtitles</option>
          </SelectRow>
          <SwitchRow
            title="Use forced subtitles"
            description="Automatically use a forced track when regular subtitles are off."
            checked={value.useForcedSubtitles}
            onChange={(next) => update("useForcedSubtitles", next)}
          />
          <SwitchRow
            title="Show preferred languages only"
            description="Hide subtitle tracks that do not match either preferred language."
            checked={value.showOnlyPreferredSubtitles}
            onChange={(next) => update("showOnlyPreferredSubtitles", next)}
          />
          <SelectRow
            title="Subtitle font"
            description="Choose the caption typeface used by the web renderer."
            value={value.subtitleFont}
            onChange={(next) =>
              update("subtitleFont", next as NuvioWebSettings["subtitleFont"])
            }
          >
            <option value="system">System</option>
            <option value="rounded">Rounded</option>
            <option value="serif">Serif</option>
            <option value="mono">Monospace</option>
          </SelectRow>
          <RangeRow
            title="Subtitle size"
            description="Scale captions without changing video layout."
            value={value.subtitleSize}
            min={60}
            max={180}
            onChange={(next) => update("subtitleSize", next)}
          />
          <RangeRow
            title="Subtitle background"
            description="Opacity behind rendered caption text."
            value={value.subtitleBackground}
            min={0}
            max={100}
            onChange={(next) => update("subtitleBackground", next)}
          />
          <RangeRow
            title="Subtitle bottom position"
            description="Distance from the bottom edge of the video picture."
            value={value.subtitlePosition}
            min={2}
            max={24}
            suffix="%"
            onChange={(next) => update("subtitlePosition", next)}
          />
          <SwitchRow
            title="Bold subtitles"
            description="Use a heavier caption weight for readability."
            checked={value.subtitleBold}
            onChange={(next) => update("subtitleBold", next)}
          />
          <SelectRow
            title="Subtitle text color"
            description="Color used for rendered caption text."
            value={value.subtitleTextColor}
            onChange={(next) => update("subtitleTextColor", next)}
          >
            <option value="#ffffff">White</option>
            <option value="#fff176">Yellow</option>
            <option value="#80deea">Cyan</option>
            <option value="#a5d6a7">Green</option>
          </SelectRow>
          <SelectRow
            title="Subtitle background color"
            description="Color behind rendered caption text."
            value={value.subtitleBackgroundColor}
            onChange={(next) => update("subtitleBackgroundColor", next)}
          >
            <option value="#08070b">Black</option>
            <option value="#1a1033">Purple black</option>
            <option value="#102033">Blue black</option>
          </SelectRow>
          <SwitchRow
            title="Subtitle outline"
            description="Draw a contrasting outline around caption text."
            checked={value.subtitleOutline}
            onChange={(next) => update("subtitleOutline", next)}
          />
          {value.subtitleOutline && (
            <SelectRow
              title="Subtitle outline color"
              description="Color used for the caption outline."
              value={value.subtitleOutlineColor}
              onChange={(next) => update("subtitleOutlineColor", next)}
            >
              <option value="#000000">Black</option>
              <option value="#ffffff">White</option>
              <option value="#402060">Purple</option>
            </SelectRow>
          )}
        </Group>
        <Group
          icon={PlayCircle}
          title="Episodes and skipping"
          description="TikTakTV automatic next-episode behavior."
        >
          <SwitchRow
            title="Skip intro, recap and credits"
            description="Combine IntroDB, AniSkip and optional Anime-Skip timing data."
            checked={value.skipIntroEnabled}
            onChange={(next) => update("skipIntroEnabled", next)}
          />
          <SwitchRow
            title="Anime-Skip provider"
            description="Use Anime-Skip GraphQL timing data in addition to AniSkip."
            checked={value.animeSkipEnabled}
            onChange={(next) => update("animeSkipEnabled", next)}
          />
          {value.animeSkipEnabled && (
            <label className="nuvio-setting-row">
              <span>
                <strong>Anime-Skip client ID</strong>
                <small>Your Anime-Skip API client identifier.</small>
              </span>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                value={value.animeSkipClientId}
                onChange={(event) =>
                  update("animeSkipClientId", event.target.value)
                }
              />
            </label>
          )}
          <SwitchRow
            title="Submit IntroDB corrections"
            description="Enable the in-player segment editor for your IntroDB account."
            checked={value.introSubmitEnabled}
            onChange={(next) => update("introSubmitEnabled", next)}
          />
          {value.introSubmitEnabled && (
            <>
              <label className="nuvio-setting-row">
                <span>
                  <strong>IntroDB API key</strong>
                  <small>
                    Stored only in this browser, never in profile sync.
                  </small>
                </span>
                <input
                  type="password"
                  autoComplete="off"
                  value={introDbApiKey}
                  onChange={(event) => setIntroDbApiKey(event.target.value)}
                  onBlur={() => saveIntroDbApiKey(introDbApiKey)}
                />
              </label>
              <div className="nuvio-setting-row nuvio-setting-action">
                <span>
                  <strong>Verify IntroDB key</strong>
                  <small>
                    {introDbStatus ||
                      "Check the key before submitting timing data."}
                  </small>
                </span>
                <button
                  type="button"
                  disabled={verifyingIntroDb || !introDbApiKey.trim()}
                  onClick={() => {
                    setVerifyingIntroDb(true);
                    setIntroDbStatus("");
                    const key = saveIntroDbApiKey(introDbApiKey);
                    void verifyIntroDbApiKey(key)
                      .then((valid) =>
                        setIntroDbStatus(
                          valid
                            ? "IntroDB key verified."
                            : "IntroDB rejected this key.",
                        ),
                      )
                      .catch(() => setIntroDbStatus("Could not reach IntroDB."))
                      .finally(() => setVerifyingIntroDb(false));
                  }}
                >
                  {verifyingIntroDb ? "Checking…" : "Verify key"}
                </button>
              </div>
            </>
          )}
          <SwitchRow
            title="Auto-play next episode"
            description="Advance to the next episode near the end of playback."
            checked={value.autoPlayNextEpisode}
            onChange={(next) => update("autoPlayNextEpisode", next)}
          />
          <RangeRow
            title="Next episode threshold"
            description={
              value.nextEpisodeThresholdMode === "percentage"
                ? "Percentage watched before the next episode can start."
                : "Minutes remaining before the next episode can start."
            }
            value={
              value.nextEpisodeThresholdMode === "percentage"
                ? value.nextEpisodeThresholdPercent
                : value.nextEpisodeMinutesBeforeEnd
            }
            min={value.nextEpisodeThresholdMode === "percentage" ? 70 : 0.5}
            max={value.nextEpisodeThresholdMode === "percentage" ? 100 : 30}
            step={value.nextEpisodeThresholdMode === "percentage" ? 1 : 0.5}
            suffix={
              value.nextEpisodeThresholdMode === "percentage" ? "%" : " min"
            }
            onChange={(next) =>
              value.nextEpisodeThresholdMode === "percentage"
                ? update("nextEpisodeThresholdPercent", next)
                : update("nextEpisodeMinutesBeforeEnd", next)
            }
          />
          <SelectRow
            title="Threshold mode"
            description="Trigger by watched percentage or time remaining."
            value={value.nextEpisodeThresholdMode}
            onChange={(next) =>
              update(
                "nextEpisodeThresholdMode",
                next as NuvioWebSettings["nextEpisodeThresholdMode"],
              )
            }
          >
            <option value="percentage">Percentage watched</option>
            <option value="minutes">Minutes before end</option>
          </SelectRow>
        </Group>
      </>
    );

  if (page === "notifications")
    return (
      <Group
        icon={Bell}
        title="Episode notifications"
        description="Web/PWA reminders for new episodes and scheduled releases."
      >
        <SwitchRow
          title="Release notifications"
          description="Notify while TikTakTV is open, or catch a recent release when you next open the PWA."
          checked={value.episodeNotifications}
          onChange={(next) => {
            if (!next) {
              update("episodeNotifications", false);
              return;
            }
            if (!("Notification" in window)) return;
            void Notification.requestPermission().then((permission) =>
              update("episodeNotifications", permission === "granted"),
            );
          }}
        />
        <SelectRow
          title="Notification lead time"
          description="How early a scheduled release reminder should appear."
          value={value.notificationLeadMinutes}
          onChange={(next) => update("notificationLeadMinutes", Number(next))}
        >
          <option value="0">At release</option>
          <option value="15">15 minutes</option>
          <option value="30">30 minutes</option>
          <option value="60">1 hour</option>
          <option value="1440">1 day</option>
        </SelectRow>
      </Group>
    );

  return (
    <>
      <Group
        icon={Sparkles}
        title="TikTakTV experience"
        description="Core Enhanced behavior brought to the TikTak web app."
      >
        <SelectRow
          title="Home hero style"
          description="Choose cinematic artwork, a balanced layout, or more metadata."
          value={value.heroMode}
          onChange={(next) =>
            update("heroMode", next as NuvioWebSettings["heroMode"])
          }
        >
          <option value="cinematic">Cinematic</option>
          <option value="balanced">Balanced</option>
          <option value="info-rich">Info rich</option>
        </SelectRow>
        <SelectRow
          title="Hero artwork"
          description="Prefer wide backdrops or poster artwork in the Home hero."
          value={value.heroArtwork}
          onChange={(next) =>
            update("heroArtwork", next as NuvioWebSettings["heroArtwork"])
          }
        >
          <option value="backdrop">Backdrop</option>
          <option value="poster">Poster</option>
        </SelectRow>
        <SwitchRow
          title="Compact hero metadata"
          description="Keep the Home hero readable on phones and shorter screens."
          checked={value.compactHeroMetadata}
          onChange={(next) => update("compactHeroMetadata", next)}
        />
        <SwitchRow
          title="Show ratings"
          description="Display ratings in the Home hero and title details."
          checked={value.showHeroRatings}
          onChange={(next) => update("showHeroRatings", next)}
        />
        <SwitchRow
          title="Show overview"
          description="Display the title summary in the Home hero."
          checked={value.showHeroOverview}
          onChange={(next) => update("showHeroOverview", next)}
        />
        <SwitchRow
          title="Show release dates"
          description="Include year and release information on Home cards."
          checked={value.showReleaseDates}
          onChange={(next) => update("showReleaseDates", next)}
        />
        <SwitchRow
          title="Motion previews"
          description="Allow supported hero trailers and motion artwork."
          checked={value.motionPreviews}
          onChange={(next) => update("motionPreviews", next)}
        />
        <SwitchRow
          title="Motion preview sound"
          description="Enable sound when a preview is explicitly started."
          checked={value.motionPreviewSound}
          onChange={(next) => update("motionPreviewSound", next)}
        />
      </Group>
      <Group
        icon={Compass}
        title="Streams and discovery"
        description="Enhanced source workflow around the existing add-ons."
      >
        <SwitchRow
          title="Pin playback source"
          description="Reuse the manually selected source until you choose another."
          checked={value.streamSourcePinning}
          onChange={(next) => update("streamSourcePinning", next)}
        />
        <SwitchRow
          title="Background stream prefetch"
          description="Collect sources while viewing title details for faster playback."
          checked={value.backgroundStreamPrefetch}
          onChange={(next) => update("backgroundStreamPrefetch", next)}
        />
        <SwitchRow
          title="Content warnings"
          description="Show parental guidance when metadata is available."
          checked={value.showParentalGuide}
          onChange={(next) => update("showParentalGuide", next)}
        />
      </Group>
      <Group
        icon={Radio}
        title="TikTak additions"
        description="Features retained from the current website."
      >
        <SwitchRow
          title="Live TV and Sports"
          description="Show IPTV, guide and sports navigation throughout the app."
          checked={value.liveTvEnabled}
          onChange={(next) => update("liveTvEnabled", next)}
        />
      </Group>
    </>
  );
}
