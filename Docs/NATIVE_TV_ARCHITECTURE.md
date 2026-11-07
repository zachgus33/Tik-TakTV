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

GitHub Actions run `42414841320` passed the native preview build, unit tests, Android lint, APK assembly, and Android TV emulator smoke tests on API 28 and API 34. Both emulator jobs verified launch, D-pad input, resumed activity, and the absence of an app fatal exception. Their 1920 x 1080 screenshots also verified the TV-specific TikTak TV sign-in branding and remote-driven system keyboard input.

This validates the isolated host and shared native engine. It does not establish feature parity, real-stream playback quality, data migration safety, or readiness to replace the public wrapper. Those remain subject to the stages and release gates above, including physical Shield, Google TV, Android TV, and Fire TV testing.
