# TikTak TV for Android phones and tablets

`mobileApp` is the touch-first Android companion to the existing TikTak TV website and Android TV app. It has its own package (`com.tiktaktv.mobile`), version history, signing key, and Play Store release. Changes here do not replace `tvApp` or the web deployment.

## Native phone features

- Responsive TikTak TV experience with phone and tablet rotation
- Android back navigation and deep links for `tiktaktv.me`
- Fullscreen HTML5 video and Picture in Picture on Android 8+
- System file picker for playlist and backup import
- Android Download Manager for secure prepared downloads
- External-browser handling for Google and other third-party authorization
- Offline/error screen with retry
- Strict HTTPS and first-party navigation policy
- No sideload updater in the Play build; Google Play owns app updates

## Build

Use JDK 21 and the Android SDK configured by the root project:

```powershell
./gradlew :mobileApp:testDebugUnitTest :mobileApp:lintDebug :mobileApp:assembleDebug '-Pnuvio.android.distribution=playstore'
./gradlew :mobileApp:bundleRelease '-Pnuvio.android.distribution=playstore'
```

The development APK is written to `mobileApp/build/outputs/apk/debug/`. The Play bundle is written to `mobileApp/build/outputs/bundle/release/`.

## Release signing

Create a permanent PKCS12 upload key and keep it outside the repository. Local and CI release builds read:

- `TIKTAK_MOBILE_KEYSTORE_FILE`
- `TIKTAK_MOBILE_STORE_PASSWORD`
- `TIKTAK_MOBILE_KEY_ALIAS`
- `TIKTAK_MOBILE_KEY_PASSWORD`

GitHub Actions uses `TIKTAK_MOBILE_KEYSTORE_BASE64` for the encoded key file. Preserve the upload key permanently. Play App Signing can protect the distribution signing key after the first upload.

## Google/YouTube sign-in

TikTak TV uses the companion service's Google device-authorization flow. The phone app opens third-party web pages in the user's browser and never embeds Google credentials in WebView. Configure the production Google project and service as described in the store checklist before closed testing.

## Store preparation

See `store/PLAY_STORE_CHECKLIST.md`, `store/LISTING.md`, and `store/DATA_SAFETY.md`. The existing public legal pages are:

- https://www.tiktaktv.me/privacy.html
- https://www.tiktaktv.me/terms.html
