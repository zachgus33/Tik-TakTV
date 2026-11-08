# TikTak TV native Android TV architecture

## Decision

TikTak TV will move from the released WebView wrapper to a dedicated native Android TV application in measured stages. The native client will reuse the repository's existing Kotlin/Compose application and Media3/MPV playback stack instead of duplicating account, profile, catalog, stream, library, sync, and playback logic.

The existing `tvApp` remains the supported public APK until the native client reaches feature parity and passes real-device migration tests. The `nativeTvApp` module uses the separate `com.tiktaktv.tv.nativepreview` package so both apps can be installed together and a preview cannot overwrite saved wrapper data.

## Why this path

- Removes WebView layout scaling, page lifecycle, JavaScript focus, and browser playback overhead from the final TV experience.
- Reuses native Media3/MPV playback, audio-track selection, profiles, add-ons, library, Live TV repositories, source selection, and account sync already present in `composeApp`.
- Keeps web and mobile development independent while allowing shared account and service contracts.
- Preserves a working public APK during development and provides an explicit rollback path.

## Migration stages

1. **Native preview foundation:** TV-only Leanback package, fullscreen landscape activity, Compose TV runtime marker, CI build, API 28/API 34 emulator launch and D-pad smoke tests.
2. **Ten-foot shell:** dedicated navigation rail, predictable focus restoration, large focus indicators, Back/Menu handling, overscan-safe spacing, and 720p/1080p/4K layout tests.
3. **Core viewing:** native Home, Discover, details, source chooser, Media3/MPV player, audio/subtitle selection, profiles, library, and settings.
4. **TikTak parity:** native Live TV guide and mini-player, Sports/scores/country filters, YouTube/YouTube Music and SmartTube handoff, SponsorBlock/autoplay preferences, What's New, and feedback with screenshots.
5. **Safe replacement:** migrate or explicitly re-link account/profile/provider settings, verify signed update compatibility, run Shield/Google TV/Fire TV/older Android TV tests, then promote the native package to the public TV release.

## Release gates

- D-pad and Back never strand focus; every interactive control has a visible focused state.
- Cold launch, navigation, guide scroll, and player startup remain responsive on API 28 hardware.
- Native playback verifies video, audio, track selection, subtitles, resume, fallback, and manual source selection.
- Updating or switching clients never deletes profiles, history, add-ons, provider credentials, or library data.
- Live TV and Sports handle large provider lists without blocking the main thread.
- The public wrapper remains downloadable until native parity and rollback tests pass.

## Foundation validation

GitHub Actions run `42425472476` passed the native preview build, unit tests, Android lint, APK assembly, and Android TV emulator smoke tests on API 28 and API 34. Both emulator jobs verified the normal sign-in entry point, the deterministic native shell host, D-pad input, resumed activity, Compose rendering, and the absence of an app-owned fatal exception.

The first ten-foot shell is now integrated into the native TV host. It uses a 124dp always-visible rail for Home, Search, Live TV, Library, and Profile, with overscan-safe spacing and a visible focus border/scale state. D-pad Right moves from the selected rail item into content; Back from root content restores focus to the selected rail item before any tab or exit action. The emulator sequence exercises that round trip on Home and Search, and screenshots confirm all five destinations plus four responsive content cards remain visible at 720p and 1080p logical sizes. A genuine 3840 x 2160 API 28 framebuffer was also visually reviewed; the API 34 Google TV system image caps its captured framebuffer at 1920 x 1080 even when launched with the 4K hardware profile.

This validates the isolated host, shared native engine, root navigation composition, and root rail/content focus contract. It does not establish complete focus restoration inside every real screen, nested Back/Menu correctness, feature parity, real-stream playback quality, data migration safety, or readiness to replace the public wrapper. Those remain subject to the stages and release gates above, including physical Shield, Google TV, Android TV, and Fire TV testing.

## Preview 0.1.1 authentication and updates

The TV authentication surface now treats remote focus and text editing as separate states. Email receives initial focus, Up/Down moves among email, password, Sign In, Sign Up, and Continue Without Account without opening the keyboard, and every focused control has a high-contrast pink border. Select on a text field intentionally enters editing and opens the keyboard; Back dismisses it and restores usable remote navigation. The API 28 and API 34 emulator workflow captures email focus, password focus, submit focus, the intentional keyboard, and post-Back recovery so this behavior cannot regress silently.

Native previews are release-signed with the repository's permanent TV signing key and use a stable `native-preview-latest` prerelease containing the APK, SHA-256 checksum, and update metadata. On launch, release builds compare version codes, download and checksum a newer APK, and open the Android/Fire OS package installer. Android still requires the device owner to approve installation and may require enabling **Install unknown apps** for TikTak TV; the app cannot silently replace itself. The earlier 0.1.0 debug-signed preview cannot be upgraded in place to this permanent signature, so testers must remove that preview and install 0.1.1 once. Later compatible previews preserve the package and can use the in-app update path.
