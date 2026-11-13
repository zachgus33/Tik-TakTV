import { ExternalLink, Megaphone, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const latestRelease = "2026.11.13.4";
const seenKey = "tiktak:whats-new-seen";
const openKey = "tiktak:open-whats-new";

export const releases = [
  {
    version: latestRelease,
    date: "November 13, 2026",
    title: "YouTube search and For You updates",
    changes: [
      "YouTube search is visible above For You again.",
      "For You uses long videos watched in TikTak TV and stops using likes on Shorts to pick topics.",
      "Choose up to four topics, such as survival or camping, to steer your suggestions.",
    ],
  },
  {
    version: "2026.11.13.2",
    date: "November 13, 2026",
    title: "YouTube discovery and library",
    changes: [
      "For You now looks beyond subscriptions for longer videos related to recent watches.",
      "My Playlists, Subscriptions, and History each have their own YouTube tab.",
      "Subscriptions keeps uploads from followed channels separate from discovery.",
    ],
  },
  {
    version: "2026.11.13.1",
    date: "November 13, 2026",
    title: "For You and web playback fixes",
    changes: [
      "For You is back near the top of YouTube on phones and displays suggestions even when subscriptions have no eligible uploads.",
      "Installed PWAs check for updates when reopened or brought back to the foreground.",
      "Play best stream now chooses a direct browser-playable source; other sources stay available through Find streams.",
      "Arabic title search and custom catalog posters work with more add-ons, and remembered profiles open without the chooser.",
    ],
  },
  {
    version: "2026.11.12.3",
    date: "November 12, 2026",
    title: "YouTube browsing updates",
    changes: [
      "Browse more recent uploads from your subscriptions and use Refresh suggestions to see another selection.",
      "Related uploads from channels you've watched appear when their titles match a topic you've watched.",
      "YouTube video feeds and search now hide Shorts, including other clips of three minutes or less.",
      "YouTube videos in Continue Watching now reopen at your saved position on the website.",
    ],
  },
  {
    version: "2026.11.12.2",
    date: "November 12, 2026",
    title: "Configured add-on streaming fix",
    changes: [
      "Configured add-on URLs now keep their account parameters on stream, catalog, details, and subtitle requests.",
      "A failed playback-service request now falls back to direct browser access when the add-on supports it.",
      "Home and Catalog manager keep separately installed catalogs visible when an older default catalog is hidden.",
      "Stream search now shows a safe reason for each failed add-on without showing its private address.",
    ],
  },
  {
    version: "2026.11.12.1",
    date: "November 12, 2026",
    title: "Catalog and streaming reliability",
    changes: [
      "Account sync now keeps deleted and disabled add-ons as you saved them, including an empty add-on list.",
      "Home catalog changes sync to your profile, and removed default rows stay removed while new catalogs can appear.",
      "Streaming add-ons get more time to respond, browser access is tried before the fallback service, and retries request fresh results.",
    ],
  },
  {
    version: "2026.11.11.1",
    date: "November 11, 2026",
    title: "More reliable Home catalogs",
    changes: [
      "Home now shows all available add-on catalogs by default instead of stopping after the first 14.",
      "Collection settings no longer hide add-on rows, and disabled add-ons stay off Home.",
      "Catalogs deliberately hidden in a custom Home layout remain hidden.",
    ],
  },
  {
    version: "2026.11.09.1",
    date: "November 7, 2026",
    title: "Better YouTube playback controls and recovery",
    changes: [
      "Sports now shows current scores and schedules even when no matching IPTV guide channel is available; Watch actions remain limited to real guide-linked channels.",
      "Live TV and Sports now show guide-linked channels progressively while large XMLTV feeds are still downloading, and default to United States channels when available.",
      "Expanded SponsorBlock categories now stay reachable in a scrollable YouTube player section instead of being clipped by the playback pane.",
      "YouTube videos and music can now autoplay the next current result or recommendation, with an on/off control in both the player and Playback settings.",
      "SponsorBlock now has category controls in both the YouTube player and Playback settings, with choices shared immediately across the current browser or TV.",
      "YouTube Music search now filters uploads that prohibit embedded playback, and the player automatically tries the next available track when an older recommendation becomes unavailable.",
      "Unavailable YouTube uploads now offer a clear Open in YouTube action, plus SmartTube on supported Android TV devices, instead of stopping at an unexplained player error.",
      "Older Android 9 televisions now receive a Chromium 69-compatible web bundle, and the TV app shows a retry screen with its WebView version instead of remaining blank when startup fails.",
      "Stream search now names every eligible add-on that responded, failed, or was temporarily paused, while keeping private add-on addresses hidden.",
      "Movies and episodes now keep every compatible result in an in-player stream chooser instead of limiting manual selection to the automatic fallback set.",
      "Automatic playback now clearly identifies its five-stream safety fallback, and stream rows show add-on, quality, and reported audio details.",
      "Playback now prefers browser-safe audio and sends reported DTS, TrueHD, E-AC-3, and AC-3 sources through compatibility conversion when that service is connected.",
      "Searching from Home now opens combined movie and series results instead of silently defaulting to Movies.",
      "Title search now interprets multiple misspellings and omitted connecting words while keeping a one-click option to search for exactly what was typed.",
      "Search now combines every compatible add-on catalog with title metadata fallback, while All, Movies, and Series filters make results easy to narrow.",
      "The landing-page product preview now rotates automatically through Movies, Live TV, YouTube, and Sports while keeping every tab available for manual selection.",
      "Selecting a landing-page preview holds it longer, and rotation pauses while the showcase is hovered, keyboard-focused, hidden, or using reduced-motion preferences.",
      "The landing page now fills the complete desktop viewport and keeps its showcase, feature tabs, and sign-in panel visible on shorter laptop and TV-sized screens.",
      "Sports guide refreshes now update invisibly without clearing the event list, changing filters, collapsing loaded results, or moving you away from the game you were viewing.",
      "Live games with verified score data now appear in a dedicated Live scores section above ordinary live and upcoming sports listings.",
      "Score polling pauses while TikTak TV is hidden and unchanged score responses no longer rebuild the Sports screen.",
      "Minimizing Live TV no longer locks the outer guide page or rebuilds the full guide and Sports screen, keeping large channel lists responsive while the same stream continues playing.",
      "Sports guide scanning now runs in small idle-time batches so providers with thousands of channels do not freeze browsers or Android and Fire TV WebViews.",
      "Closing or backing out of full-screen Live TV now keeps the same stream playing in a corner mini-player while you browse the guide; closing the mini-player stops it.",
      "Profile sync now keeps a separate loaded baseline for every signed-in account and profile before it permits any remote write.",
      "Live TV can stay playing in a small corner window while you browse the guide, then return to full-screen playback without opening a second stream.",
      "Desktop navigation is slimmer without hiding any controls, TV keeps a compact rail that expands on remote focus, and phones retain the familiar bottom navigation.",
      "Android TV users with SmartTube installed can open a selected YouTube video there; the embedded TikTak TV player remains the automatic fallback.",
      "Stream searches now report how many installed add-ons were queried, paused, incompatible, or failed without exposing private add-on addresses.",
      "Issue forms now identify Shield, Google TV, Android TV, Fire TV, desktop, and mobile reports and remind users to redact credentials.",
      "Every primary page and Settings section now stays inside a portrait phone viewport, with compact Live TV cards and a single-column Sports layout.",
      "Channel logos now fall back to XMLTV artwork and securely load provider images that browsers cannot open directly.",
      "Sports now enriches confidently matched games with live scores, teams, status, venue, and broadcast information.",
      "Sports filters by country, rejects ordinary shows on sports channels, and renders events in responsive batches on web and TV.",
      "Live TV now opens with a large selected-program view, channel artwork, description, progress, and a direct Watch live action.",
      "Added a Sports view that finds live and upcoming games in each person's own IPTV guide and lets them follow events.",
      "The complete two-hour Live TV window now fits the desktop and TV guide without sideways scrolling.",
      "The sign-in page now explains TikTak TV in a clean product preview while keeping account access front and center.",
      "Added an in-app place to report problems, request features, and attach screenshots.",
      "Added a private owner inbox for reviewing, planning, completing, or closing feedback.",
      "TV playback controls now fade away after 3.5 seconds and return when you use the remote.",
      "Private owner analytics now separate people online from people actively using or watching TikTak TV.",
      "Added returning-user, session-time, and retention measurements without collecting viewing history.",
      "Added this update history so improvements are easy to find after every release.",
    ],
  },
  {
    version: "2026.11.04",
    date: "November 4, 2026",
    title: "YouTube and account improvements",
    changes: [
      "YouTube recommendations rotate instead of showing the same first group every time.",
      "Search results open the selected player correctly on web and TV.",
      "The private dashboard distinguishes signed-in accounts from anonymous site visits.",
    ],
  },
];

export function WhatsNewPrompt() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(seenKey) === latestRelease) return;
      let timer = 0;
      const showWhenClear = () => {
        if (document.querySelector("dialog[open]")) {
          timer = window.setTimeout(showWhenClear, 800);
          return;
        }
        setOpen(true);
      };
      timer = window.setTimeout(showWhenClear, 1200);
      return () => clearTimeout(timer);
    } catch {
      return;
    }
  }, []);
  useEffect(() => {
    if (open && ref.current && !ref.current.open) ref.current.showModal();
  }, [open]);
  const dismiss = () => {
    try {
      localStorage.setItem(seenKey, latestRelease);
    } catch {}
    ref.current?.close();
    setOpen(false);
  };
  if (!open) return null;
  const release = releases[0];
  return (
    <dialog
      ref={ref}
      className="whats-new-dialog"
      onCancel={dismiss}
      aria-labelledby="whats-new-title"
    >
      <button
        className="icon-button whats-new-close"
        onClick={dismiss}
        aria-label="Dismiss update"
      >
        <X />
      </button>
      <span className="eyebrow">
        <Sparkles size={16} /> NEW IN TIKTAK TV
      </span>
      <h2 id="whats-new-title">{release.title}</h2>
      <p className="muted">Updated {release.date}</p>
      <ul>
        {release.changes.slice(0, 3).map((change) => (
          <li key={change}>{change}</li>
        ))}
      </ul>
      <div className="whats-new-actions">
        <button
          className="primary"
          data-tv-initial-focus
          onClick={() => {
            try {
              localStorage.setItem(seenKey, latestRelease);
              sessionStorage.setItem(openKey, "1");
            } catch {}
            location.hash = "settings";
            ref.current?.close();
            setOpen(false);
          }}
        >
          View all changes
        </button>
        <button onClick={dismiss}>Got it</button>
      </div>
    </dialog>
  );
}

export function WhatsNewPanel({
  onOpenFeedback,
}: {
  onOpenFeedback: () => void;
}) {
  return (
    <div className="whats-new-page">
      {releases.map((release, index) => (
        <section className="settings-card release-card" key={release.version}>
          <div className="card-heading">
            {index === 0 ? <Sparkles /> : <Megaphone />}
            <div>
              <h2>{release.title}</h2>
              <p>
                {release.date} · {release.version}
              </p>
            </div>
            {index === 0 && <span className="badge connected">Latest</span>}
          </div>
          <ul>
            {release.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
        </section>
      ))}
      <section className="settings-card">
        <div className="card-heading">
          <Megaphone />
          <div>
            <h2>Help shape the next update</h2>
            <p>Bug reports and ideas are welcome.</p>
          </div>
        </div>
        <div className="whats-new-links">
          <button onClick={onOpenFeedback}>
            Report a problem or request a feature
          </button>
          <a
            href="https://github.com/zachgus33/Tik-TakTV/releases"
            target="_blank"
            rel="noreferrer"
          >
            View releases <ExternalLink size={15} />
          </a>
        </div>
      </section>
    </div>
  );
}

export function requestedWhatsNewSection() {
  try {
    return sessionStorage.getItem(openKey) === "1";
  } catch {
    return false;
  }
}

export function clearRequestedWhatsNewSection() {
  try {
    sessionStorage.removeItem(openKey);
  } catch {}
}
