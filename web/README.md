# Nuvio Enhanced Web

A browser-native web application added to the [Nuvio Mobile Enhanced](https://github.com/yesnt10/NuvioMobile-Enhanced) fork, itself based on [Nuvio Mobile](https://github.com/NuvioMedia/NuvioMobile). The native Kotlin sources and GPL-3.0 license remain in the repository. The web app uses React, TypeScript and the browser's video element rather than embedding the mobile UI in a canvas.

## Run locally

Requires Node.js 24 and npm.

```sh
cd web
npm ci
npm run dev
```

Open the localhost address printed by Vite. This address is local to your computer, not a public iPhone link. Deploy to HTTPS for testing on an actual iPhone/iPad.

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

The automated browser tests use isolated, fabricated source responses. They never use personal credentials. WebKit device emulation checks browser behavior and layouts; it is not a substitute for actual iOS hardware playback testing.

## Included

- Home with add-on catalog shelves, title artwork and continue watching.
- Movies/series discovery, catalog selection, search, details, seasons and episodes.
- Xtream authentication, account validation, live channels, categories, automatic XMLTV guide with per-channel fallback, VOD and series.
- HTTPS M3U file import and direct video URLs.
- Stremio-compatible HTTP manifests, catalogs, metadata and direct HTTPS stream results.
- TorBox cached-torrent resolution and automatic 720p-or-better selection by seeders, with episode matching and a manual file picker.
- Native Nuvio collection JSON import/export, editable collection folders and add-on catalogs, bulk add-on import, and web setup backups.
- Local favorites, account-scoped library records, watch progress, accent colors.
- Native Safari HLS, AirPlay, native fullscreen, Picture in Picture where supported, local WebVTT subtitles.
- HLS.js loaded on demand only when native HLS is unavailable. Manual HLS.js quality selection; Safari handles adaptive quality itself.
- Small initial application payload, lazy settings/player code, lazy images, bounded channel rendering (60 at a time), cancellation and timeouts.
- iPhone bottom navigation, iPad/desktop side navigation, safe-area spacing, keyboard-accessible dialogs, reduced-motion support.
- Installable PWA, offline app shell, and an update notice that does not interrupt an active stream.
- GitHub Actions build, unit tests, Chromium/WebKit checks and Pages deployment.

## Connect IPTV

Open **Settings → Xtream IPTV**. The server field is prefilled with the address supplied for this project. Enter your username and password directly in the app, then select **Test & connect**. This validates account/API access, not video codecs. Open **Live TV**, choose a channel and select **Watch channel** to verify playback.

Your browser contacts the provider directly. Credentials go to that provider, not GitHub or an application backend. No credentials are embedded in source code or deployment variables. Default storage is sessionStorage; the optional remember checkbox uses unencrypted localStorage. Saved stream progress omits playback URLs. Configured add-on URLs may themselves contain access tokens: install only trusted add-ons and treat this browser profile as private.

The service worker caches only the app's own build assets. Provider responses, media, artwork from other origins, and credential-bearing URLs are never runtime-cached by it. It does not preload HLS.js on Safari.

## What a static website can and cannot do

### Torrentio and TorBox

Install your existing **configured Torrentio manifest URL** in Settings > Add-ons. Torrentio results already resolved through TorBox play as HTTPS streams. For add-ons returning raw torrent hashes, connect your API key in **Settings > TorBox**. The separate key stays in session storage unless you choose to remember it. Only cached torrent additions are requested; this app does not start uncached torrent downloads.

**Play best stream** automatically filters for 720p, 1080p, 1440p, 2160p/4K or 4320p/8K and prefers the largest reported seeder count, using resolution to break ties. Missing seeder counts rank last. Turn this off in Settings or use **Find streams** for manual selection. TorBox packs must match the selected episode; ambiguous files, unknown quality and lower resolutions remain available through manual selection. Safari may still require a tap on the video after source resolution.

### Bring over your setup

Use **Settings > Your Nuvio setup > Import collections** with native Nuvio's collection export JSON. Browse and edit them in **My library**. Install the same configured add-ons so imported catalog sources can load. TMDB/Trakt source definitions are preserved but need equivalent add-on catalogs here. Bulk add-on import accepts manifest URLs or supported JSON records.

**Export web backup** and **Restore web backup** transfer web favorites, progress, collections and add-on addresses between browsers. They omit IPTV passwords and the separate TorBox key, but configured add-on URLs can contain tokens. This is manual transfer, not automatic Nuvio account sync. Native Enhanced settings backups do not contain the full native library and are not accepted as web backups.

### Browser requirements

The provider API must support HTTPS and CORS for your deployed origin. Native Safari HLS may have different CORS requirements from HLS.js: the latter needs permission for playlists, segments, keys and subtitle resources. Providers may vary headers by endpoint or authentication state. Successful login does not guarantee stream access.

Live Xtream URLs request `.m3u8`. The provider must actually offer HLS. Movies and episodes preserve their reported container extension. H.264/AAC in MP4 or HLS is the broadest compatibility target; not all MKV, HEVC or multichannel audio combinations play on all browsers. This app does not transcode, bypass CORS, emulate native request headers, or relay video. HTTP-only providers need an HTTPS relay. Codec conversion needs a separate media server. Changing the website's domain does not solve these problems.

Native-only Enhanced features are not ported: Cloudstream runtime plug-ins, local torrent engines, offline video downloads, Stalker MAC authentication, Trakt/account sync, AI assistant, release calendar, and native MPV controls. It is a web adaptation with the above implemented feature set, not full native feature parity.

## Publish and use your domain

See [DEPLOYMENT.md](./DEPLOYMENT.md) for GitHub Pages setup, custom-domain DNS, and verification.

## Attribution

The checkout is based on Enhanced commit `894499115fb1a69cd4bb34d6969a74832f0e5636` on its `enhanced` branch. The web implementation follows its Xtream endpoint conventions, feature organization, and dark/accent-color design. Native repository history is retained.

- Nuvio Mobile and Nuvio Mobile Enhanced: GPL-3.0, see [LICENSE](../LICENSE).
- React: MIT. Lucide icons: ISC. HLS.js: Apache-2.0.
- Cinemeta: external metadata service. Titles and artwork remain provided by their respective sources.
- The small web app icon is a new vector mark for this adaptation.

No IPTV account, media files, paid sources, or proprietary add-on configuration is included.
