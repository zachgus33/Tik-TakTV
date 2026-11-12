<div align="center">

# TikTak TV

**Your entertainment. Beautifully organized.**

_Movies, shows, Live TV, sports, YouTube, and music — together in one place, on your screens._

[![Open TikTak TV](https://img.shields.io/badge/Launch%20Web%20App-9b5cff?style=for-the-badge&logo=googlechrome&logoColor=white)](https://www.tiktaktv.me/)
[![Download for TV](https://img.shields.io/badge/Download%20TV%20APK-20212b?style=for-the-badge&logo=android&logoColor=white)](https://github.com/zachgus33/Tik-TakTV/releases)
[![GitHub Stars](https://img.shields.io/github/stars/zachgus33/Tik-TakTV?style=for-the-badge&color=7d5bef)](https://github.com/zachgus33/Tik-TakTV/stargazers)
[![License](https://img.shields.io/github/license/zachgus33/Tik-TakTV?style=for-the-badge&color=30303d)](LICENSE)

**[Try it on the web](https://www.tiktaktv.me/)** · **[Stable TV install](#install-on-fire-tv--android-tv--google-tv)** · **[Native TV preview](#try-the-native-tv-preview)** · **[Features](#what-can-tiktak-tv-do)** · **[Community](https://github.com/zachgus33/Tik-TakTV/discussions)**

<img src="docs/screenshots/welcome.png" alt="TikTak TV welcome and sign-in experience, showing the entertainment interface on the left" width="100%" />

</div>

> [!IMPORTANT]
> **TikTak TV is a free, unofficial community project — not an IPTV provider.** It does not include channels, subscriptions, add-ons, or media. Bring your own compatible services and sources that you are authorized to use.

## One home for everything you watch

TikTak TV is a multi-device entertainment frontend built around the Nuvio ecosystem. It brings the things you already use — your add-on catalogs, movies and series, live television, sports, YouTube, YouTube Music, profiles, and watch progress — into one customizable interface.

Use **the web app** on desktop, iPhone, iPad, and Android browsers, or install **the stable TV wrapper** on Fire TV, Android TV, and Google TV. The wrapper runs the web interface with remote navigation. A separate **native TV preview** is available for testing. You can configure your setup on the web and use supported profile sync on your other devices.

### At a glance

|                          | What you get                                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **Movies & series**      | Catalog-powered Home, Discover, search, title details, seasons, episodes, and Continue Watching            |
| **Live TV**              | User-supplied Xtream/M3U services, XMLTV/EPG matching, channel artwork, and a two-hour guide               |
| **Sports**               | Live/upcoming events, scores where available, followed events, and matched channels from _your_ IPTV setup |
| **YouTube & music**      | Separate YouTube and YouTube Music experiences, search, and account-based features where available         |
| **Your library**         | Profiles, collections, favorites, watch progress, and supported Nuvio account/add-on sync                  |
| **TV-friendly controls** | Remote navigation, focus states, compact sidebar, fullscreen playback, and a Live TV mini-player           |
| **Multiple screens**     | Web, installable PWA, Fire TV, Android TV, and Google TV                                                   |

## Take a look around

### Discover movies and shows

Explore catalogs from your installed add-ons, browse curated rows, switch between movies and series, search for titles, and open detailed pages with artwork, descriptions, ratings, cast, and more.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/discover.png" alt="Discover page with catalog filters and a grid of movie posters" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/title-details.png" alt="Movie details popup with plot, genres, playback options, and cast" width="100%" /></td>
</tr>
<tr><td align="center"><sub>Discover & browse</sub></td><td align="center"><sub>Title details & playback</sub></td></tr>
</table>

### Live TV that feels like TV

Connect your own IPTV service and use a visual electronic program guide with program descriptions, schedule progress, channel logos, category/country filters, and recently watched channels.

The **Live TV mini-player** can keep the current channel on screen while you browse the guide in TV mode. Restore fullscreen without intentionally restarting the stream, or close the mini-player to stop playback.

<img src="docs/screenshots/live-tv-guide.png" alt="TikTak TV Live TV guide with channel logos and timeline-style program blocks" width="100%" />

### Sports, scores, and your channels

Explore live and upcoming sporting events, filter by sport or country, follow events, and see scores when reliable data is available. TikTak TV can also look for matching channels in **your own IPTV/EPG lineup**.

**Score availability and channel availability are separate:** a missing score doesn't mean an otherwise available IPTV channel can't play.

<img src="docs/screenshots/live-sports.png" alt="TikTak TV Sports section showing live game scores and matched IPTV channels" width="100%" />

### YouTube and YouTube Music in one interface

Search videos, browse recommendations, and use the separate Music view without constantly leaving TikTak TV. Supported Google sign-in can surface subscriptions, playlists, and account-related recommendations. Playback uses the YouTube player, with **optional SponsorBlock segment skipping**. On supported TV devices, an **optional SmartTube handoff** is available when SmartTube is installed.

<table>
<tr>
<td width="50%"><img src="docs/screenshots/youtube.png" alt="TikTak TV YouTube video browse and search page" width="100%" /></td>
<td width="50%"><img src="docs/screenshots/youtube-music.png" alt="TikTak TV YouTube Music browse and search page" width="100%" /></td>
</tr>
<tr><td align="center"><sub>YouTube videos</sub></td><td align="center"><sub>YouTube Music</sub></td></tr>
</table>

## What can TikTak TV do?

<details>
<summary><strong>Movies, shows & discovery</strong></summary>

- Use compatible Nuvio/Stremio add-ons and their catalogs to populate Home and Discover.
- Browse movies, series, seasons, episodes, metadata, cast, related titles, and recommendations.
- Search and filter catalogs; organize collections/folders and add-on order.
- Track favorites, watch progress, and Continue Watching in supported profiles.
- Choose from available compatible sources, with playback behavior depending on the add-on, source, and device.

</details>

<details>
<summary><strong>IPTV & live television</strong></summary>

- Connect an authorized Xtream or M3U playlist/service.
- Use automatic EPG matching and optional custom XMLTV/EPG links.
- Browse channel categories and countries, program details, artwork, and the two-hour guide.
- Access recently watched channels and TV-focused navigation.
- Continue Live TV in a corner mini-player while browsing the guide (supported TV mode).

</details>

<details>
<summary><strong>Sports</strong></summary>

- Browse live and upcoming games/events, with country and sport filters.
- View scoreboards and event information when reliable data is available.
- Follow events and see matched IPTV channels from your lineup.
- Keep playable-channel matching independent of score availability.

</details>

<details>
<summary><strong>YouTube, music & playback</strong></summary>

- Browse separate YouTube Videos and YouTube Music sections.
- Search for videos, music, and supported playlists; use connected-account features where available.
- Use an optional SmartTube launch/handoff on compatible Android TV hardware.
- Playback features vary by platform and source; supported experiences include subtitles and timing controls, seek, fullscreen, picture-in-picture, and AirPlay on compatible browsers/devices.

</details>

<details>
<summary><strong>Profiles, customization & sharing</strong></summary>

- Sign in and use supported Nuvio profiles, add-ons, collections, and progress sync.
- Customize library organization, catalogs, and viewing preferences.
- Use friend-code features for sharing trusted setup information without posting credentials publicly.
- Use compatible backup/import/export workflows for your setup.
- Configure on the web and pick up supported settings on TV.

</details>

<details>
<summary><strong>TV experience & updates</strong></summary>

- Remote/D-pad navigation, visible focus indicators, and improved TV layouts.
- Sidebar that stays compact and expands when focused.
- Player controls designed to auto-hide during playback.
- Signed Android TV APK with update checking and installation over an existing compatible release.
- What's New messages, release history, and in-app feedback requests.

</details>

## Get started

### Use TikTak TV in a browser

**Open [tiktaktv.me](https://www.tiktaktv.me/)**, sign in or create an account, choose a profile, and connect the compatible services and add-ons you want to use.

- **Windows, macOS, Linux:** Open the site in a modern browser.
- **iPhone / iPad:** Open it in Safari, then use **Share → Add to Home Screen** for an app-like shortcut.
- **Android phones / tablets:** Open it in your browser and use **Install app** or **Add to Home screen** when available.

The web experience can also be installed as a Progressive Web App (PWA) where the browser supports it.

### Install on Fire TV / Android TV / Google TV

For everyday use, install the [stable TV release](https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest). It packages the web app with TV remote support. The Downloader code for this build is **`2564237`**.

1. Install and open **Downloader by AFTVnews** on your TV device.
2. In Downloader, enter **`2564237`** and press **Go**.
3. Follow the redirect to download the official TikTak TV APK.
4. If your device prompts you, allow Downloader to install unknown apps, then install the APK.
5. Launch TikTak TV, sign in, choose your profile, and connect or sync your own services.

**Other ways to install:**

- **[Official GitHub releases](https://github.com/zachgus33/Tik-TakTV/releases)**
- **[Direct signed TV APK](https://github.com/zachgus33/Tik-TakTV/releases/download/tv-latest/tiktak-tv-android-tv.apk)**
- **[TV install and update documentation](tvApp/README.md)**

> [!TIP]
> The web interface can update without rebuilding the TV app. When the APK itself changes, use the built-in update checking or the official signed release. Don't uninstall the app just to check for updates; uninstalling can remove local data.

### Try the native TV preview

Download `tiktak-tv-native-preview.apk` from the [native TV prerelease](https://github.com/zachgus33/Tik-TakTV/releases/tag/native-preview-latest). It installs alongside the stable wrapper, so you can test both on the same Fire TV, Android TV, or Google TV device. Use the [build and setup guide](https://github.com/zachgus33/Tik-TakTV/discussions/4) if you’re deciding which to install.

### Platform support

| Platform               | How to use TikTak TV         | Notes                                                                  |
| ---------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Desktop / laptop       | Website                      | Current Chrome, Firefox, Edge, Safari and similar modern browsers      |
| iPhone / iPad          | Website / Add to Home Screen | Web/PWA experience; **native iOS IPA is not released**                 |
| Android phone / tablet | Website / PWA                | Browser-based experience                                               |
| Fire TV / Firestick    | Stable TV APK                | Web wrapper with remote navigation. Native preview available separately. |
| Android TV / Google TV | Stable TV APK                | Web wrapper with remote navigation. Native preview available separately. |

## Recent web and stable TV updates

- **Home catalogs.** Web update **2026.11.11.1** shows all available add-on catalogs by default. Catalogs you’ve hidden in a custom Home layout and catalogs from disabled add-ons stay hidden.
- **Playback.** The web player lists compatible movie and episode sources for manual selection and reports which add-ons responded during stream search. YouTube and YouTube Music have continuous play and SponsorBlock controls.
- **Live TV and sports.** The guide shows matching channels progressively as XMLTV data loads. Sports can display scores and schedules even when the guide has no playable channel for an event.
- **Stable TV wrapper.** The APK adds remote focus, fullscreen playback, and update checking to the web experience. Older Android 9 televisions can use the compatibility bundle. The startup screen shows the WebView version and offers a retry if the interface fails to load.

See **Settings → What's new** in the web app or stable TV wrapper for more update notes. Check the [stable TV release](https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest) for the current signed APK.

## Native Android TV development

The native app uses Kotlin/Compose and the shared native account, profiles, library, Live TV, and playback stack. It has a remote-first navigation rail for Home, Search, Live TV, YouTube, Sports, Library, and Settings.

In **preview 0.3.66**, pressing **Back** in the Fire TV player’s **Quality** or **Sources** panel should close that panel and keep you in playback. Recent preview work also improved D-pad focus inside player menus and made Live TV display channels with programme data. See the [preview announcement](https://github.com/zachgus33/Tik-TakTV/discussions/8) and [device testing thread](https://github.com/zachgus33/Tik-TakTV/discussions/5) for details.

The native app is being prepared for the **Amazon Appstore on Fire TV**. The plan is for it to replace the stable TV wrapper over time, once it’s ready for everyday use. The [GitHub prerelease](https://github.com/zachgus33/Tik-TakTV/releases/tag/native-preview-latest) is the side-by-side test build. For development details, see the [native TV architecture notes](Docs/NATIVE_TV_ARCHITECTURE.md).

## Feedback, bug reports & feature requests

TikTak TV started as a family project. Community feedback helps decide what to fix and build next, especially when it comes from real TVs and remotes.

- **Getting set up or troubleshooting?** Start with the [build and setup guide](https://github.com/zachgus33/Tik-TakTV/discussions/4) or ask a question in [Help & Support](https://github.com/zachgus33/Tik-TakTV/discussions/categories/help-support).
- **Testing the native preview?** Share device-specific results in the [native TV testing thread](https://github.com/zachgus33/Tik-TakTV/discussions/5). Use [GitHub Issues](https://github.com/zachgus33/Tik-TakTV/issues) to track reproducible app bugs.
- **Have an idea?** Tell us [what you’d like to see added](https://github.com/zachgus33/Tik-TakTV/discussions/3), or [vote on native TV priorities](https://github.com/zachgus33/Tik-TakTV/discussions/7).
- **Want to share your setup?** Post a screenshot or describe how you watch in [Show Your Setup](https://github.com/zachgus33/Tik-TakTV/discussions/6). See [GitHub Discussions](https://github.com/zachgus33/Tik-TakTV/discussions) for the rest of the community.

On the web app or stable TV wrapper, **Settings → Feedback** lets you send a private report or feature request with screenshots. In any report, include your **device model, OS, build, app version, steps, expected result, and actual result**.

> [!CAUTION]
> Keep credentials and private details out of public posts and screenshots. Redact emails, passwords, IPTV/Xtream credentials, API keys, tokens, private add-on and stream URLs, and friend codes.

## For developers & contributors

This repository contains the **TikTak TV web experience** alongside its Android TV packaging and inherited Nuvio Mobile Enhanced codebase.

- **Web app:** [`web/`](web/) — React/TypeScript browser application; see [web setup](web/README.md) and [deployment](web/DEPLOYMENT.md).
- **Stable TV wrapper:** [`tvApp/`](tvApp/) — Android TV packaging for the web app. See the [stable TV build and install notes](tvApp/README.md).
- **Native TV app:** [`nativeTvApp/`](nativeTvApp/) — Kotlin/Compose client built on the shared native app. See the [native TV architecture](Docs/NATIVE_TV_ARCHITECTURE.md).
- **Shared/native inherited project:** `composeApp/`, `androidApp/`, `iosApp/`, and associated Gradle modules.
- **Releases and updates:** [GitHub Releases](https://github.com/zachgus33/Tik-TakTV/releases) and repository Actions.

**Run the web edition locally** (Node.js 24 and npm, per the web documentation):

```bash
cd web
npm ci
npm run dev
```

**Build a debug APK for the stable TV wrapper**

```bash
./gradlew :tvApp:assembleDebug
```

On Windows, use `./gradlew.bat :tvApp:assembleDebug` (or `.\gradlew.bat` in PowerShell). See the linked module READMEs for build and release requirements.

Contributions, reproducible bug reports, testing, and suggestions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and review [Issues](https://github.com/zachgus33/Tik-TakTV/issues) before submitting changes.

### What's still being explored?

Longer-term ideas include a **sideloadable native iOS app** and broader extension compatibility. Experimental code or folders in the repository should **not** be interpreted as features supported in a public release. In particular, arbitrary CloudStream plugins are not presented as supported in the current public TV/web editions.

## Credits, license & disclaimer

TikTak TV is an **unofficial community fork**, not affiliated with or endorsed by Nuvio, Google/YouTube, TMDB, Amazon, SmartTube, or any IPTV provider.

- **TikTak TV project:** [zachgus33/Tik-TakTV](https://github.com/zachgus33/Tik-TakTV)
- **Enhanced fork lineage:** [yesnt10/NuvioMobile-Enhanced](https://github.com/yesnt10/NuvioMobile-Enhanced)
- **Original Nuvio project:** [NuvioMedia/NuvioMobile](https://github.com/NuvioMedia/NuvioMobile)
- **License:** [GPL-3.0](LICENSE) (see the repository for applicable third-party notices)

TikTak TV is a frontend for services and sources that users connect themselves. It does **not** provide channels, paid subscriptions, hosted movies/shows, or third-party streaming access. Use only content and services you are authorized to access.

---

<div align="center">

### Stream your world.

**[Open TikTak TV](https://www.tiktaktv.me/)** · **[Get the TV APK](https://github.com/zachgus33/Tik-TakTV/releases)** · **[Share feedback](https://github.com/zachgus33/Tik-TakTV/issues)**

_Built for people who want their entertainment in one place._

</div>
