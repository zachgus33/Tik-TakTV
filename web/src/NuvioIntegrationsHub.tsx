import {
  Activity,
  Blocks,
  Bot,
  Captions,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  Film,
  Link,
  MessageCircle,
  PlayCircle,
  ShieldCheck,
} from "lucide-react";

type Destination =
  | "addons"
  | "collections"
  | "playback"
  | "trakt"
  | "simkl"
  | "anilist"
  | "notifications";

const working = [
  {
    title: "Trakt",
    description: "Watchlist, ratings, watched state and optional scrobbling.",
    icon: Activity,
    destination: "trakt" as const,
  },
  {
    title: "Simkl",
    description: "Movie and series tracking with profile-scoped credentials.",
    icon: CheckCircle2,
    destination: "simkl" as const,
  },
  {
    title: "AniList",
    description: "Anime progress and ratings through the active profile.",
    icon: Film,
    destination: "anilist" as const,
  },
  {
    title: "TMDB enrichment",
    description: "Cast, people, studios, trailers and recommendations.",
    icon: Database,
    destination: "collections" as const,
  },
  {
    title: "Debrid providers",
    description: "TorBox and Real-Debrid playback, formatting and source rules.",
    icon: ShieldCheck,
    destination: "playback" as const,
  },
  {
    title: "SponsorBlock",
    description: "Automatic YouTube segment skipping and category controls.",
    icon: PlayCircle,
    destination: "playback" as const,
  },
  {
    title: "Subtitle add-ons",
    description: "Built-in tracks plus installed Stremio subtitle providers.",
    icon: Captions,
    destination: "addons" as const,
  },
  {
    title: "Release notifications",
    description: "PWA notification permission and episode reminder timing.",
    icon: MessageCircle,
    destination: "notifications" as const,
  },
];

const browserMappings = [
  {
    title: "CloudStream repositories",
    description:
      "Native Kotlin plug-ins cannot execute in Safari or Chromium. On web, install the equivalent HTTP/HTTPS Stremio add-on; self-hosted HTTP add-ons remain supported through the companion.",
    icon: Cloud,
  },
  {
    title: "External native player",
    description:
      "Android player intents are unavailable in a PWA. TikTak uses the browser player, AirPlay, Picture in Picture and Fullscreen instead.",
    icon: ExternalLink,
  },
  {
    title: "AI assistant",
    description:
      "The native assistant requires a separately configured model provider. The web rebuild keeps title search and TMDB discovery local until a profile-safe provider flow is available.",
    icon: Bot,
  },
  {
    title: "Telegram",
    description:
      "The PWA uses browser notifications instead of storing a Telegram bot token in site storage.",
    icon: MessageCircle,
  },
  {
    title: "Android mpv / iOS video output",
    description:
      "Those settings control native decoders. The web equivalents are compatibility conversion, resize mode, quality selection and browser-safe audio.",
    icon: Blocks,
  },
];

export default function NuvioIntegrationsHub({
  onNavigate,
}: {
  onNavigate: (destination: Destination) => void;
}) {
  return (
    <>
      <section className="settings-card nuvio-integration-card">
        <div className="card-heading">
          <Link />
          <div>
            <h2>Connected services</h2>
            <p>Profile-aware integrations available in the web/PWA build.</p>
          </div>
        </div>
        <div className="nuvio-integration-list">
          {working.map((item) => (
            <button
              key={item.title}
              type="button"
              onClick={() => onNavigate(item.destination)}
            >
              <item.icon />
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
              <ExternalLink size={17} />
            </button>
          ))}
        </div>
      </section>
      <section className="settings-card nuvio-integration-card">
        <div className="card-heading">
          <Blocks />
          <div>
            <h2>Native feature mappings</h2>
            <p>
              Every Enhanced settings area is accounted for without pretending
              a browser can execute native platform code.
            </p>
          </div>
        </div>
        <div className="nuvio-native-mappings">
          {browserMappings.map((item) => (
            <article key={item.title}>
              <item.icon />
              <span>
                <strong>{item.title}</strong>
                <small>{item.description}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
