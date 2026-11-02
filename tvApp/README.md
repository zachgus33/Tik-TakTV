# TikTak TV for Fire TV and Android TV

This module packages the production TikTak TV experience as a remote-first
Android TV application. It targets Fire TV, Firestick, Android TV, and Google
TV with one APK and uses the same TikTak account, collections, add-ons,
playback companion, friend codes, and progress as the web application.

## Development build

```shell
./gradlew :tvApp:assembleDebug
```

The APK is written to `tvApp/build/outputs/apk/debug/tvApp-debug.apk`.
GitHub Actions also publishes it as the `TikTak-TV-Android-TV` artifact.

## Release requirements

Before public Downloader distribution, configure a permanent release signing
key, publish the signed APK at a stable short URL, and test it on both a Fire TV
device and an Android/Google TV device. A release must preserve the application
ID and signing certificate so installed TVs can update without uninstalling.

## TV behavior

- Lean-back launcher and landscape-only activity
- D-pad spatial navigation and strong focus indicators
- Back-button browser history and fullscreen-video exit
- Persistent WebView account and profile storage
- Fullscreen HTML video
- Android Download Manager integration
- Safe external-link and TLS handling
- File picker support for setup import
