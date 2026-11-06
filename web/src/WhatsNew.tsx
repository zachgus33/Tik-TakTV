import { ExternalLink, Megaphone, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const latestRelease = "2026.11.05.9";
const seenKey = "tiktak:whats-new-seen";
const openKey = "tiktak:open-whats-new";

export const releases = [
  {
    version: latestRelease,
    date: "November 5, 2026",
    title: "Stable Sports browsing and live scores",
    changes: [
      "Sports guide refreshes now update invisibly without clearing the event list, changing filters, collapsing loaded results, or moving you away from the game you were viewing.",
      "Live games with verified score data now appear in a dedicated Live scores section above ordinary live and upcoming sports listings.",
      "Score polling pauses while TikTak TV is hidden and unchanged score responses no longer rebuild the Sports screen.",
      "Minimizing Live TV no longer locks the outer guide page or rebuilds the full guide and Sports screen, keeping large channel lists responsive while the same stream continues playing.",
      "Sports guide scanning now runs in small idle-time batches so providers with thousands of channels do not freeze browsers or Android and Fire TV WebViews.",
      "Closing or backing out of full-screen Live TV now keeps the same stream playing in a corner mini-player while you browse the guide; closing the mini-player stops it.",
      "Profile sync now keeps a separate loaded baseline for every signed-in account and profile before it permits any remote write.",
      "Live TV can stay playing in a small corner window while you browse the guide, then return to full-screen playback without opening a second stream.",
      "The TV sidebar stays compact until it receives remote focus, then expands over the page so content never jumps sideways.",
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
    const requested = sessionStorage.getItem(openKey) === "1";
    if (requested) sessionStorage.removeItem(openKey);
    return requested;
  } catch {
    return false;
  }
}
