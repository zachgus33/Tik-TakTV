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
import type { NuvioWebSettings } from "./nuvio-web-settings";

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
            <option value="device">Device language</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
            <option value="ja">Japanese</option>
          </SelectRow>
          <SelectRow
            title="Preferred subtitles"
            description="Automatically select this language when available."
            value={value.preferredSubtitleLanguage}
            onChange={(next) => update("preferredSubtitleLanguage", next)}
          >
            <option value="none">Off</option>
            <option value="device">Device language</option>
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
            <option value="pt">Portuguese</option>
          </SelectRow>
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
        </Group>
        <Group
          icon={PlayCircle}
          title="Episodes and skipping"
          description="TikTakTV automatic next-episode behavior."
        >
          <SwitchRow
            title="Auto-play next episode"
            description="Advance to the next episode near the end of playback."
            checked={value.autoPlayNextEpisode}
            onChange={(next) => update("autoPlayNextEpisode", next)}
          />
          <RangeRow
            title="Next episode threshold"
            description="Percentage watched before the next episode can start."
            value={value.nextEpisodeThresholdPercent}
            min={70}
            max={100}
            onChange={(next) => update("nextEpisodeThresholdPercent", next)}
          />
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
          description="Ask this device to notify you about tracked releases."
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
