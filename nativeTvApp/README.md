# TikTak TV for Fire TV and Android TV

`nativeTvApp` is the only TV application built from this repository. It hosts
the Kotlin/Compose TV interface and the shared native playback stack.

## Install and update

- Downloader code **2564237** opens the stable signed APK at
  `https://github.com/zachgus33/Tik-TakTV/releases/download/tv-latest/tiktak-tv-android-tv.apk`.
- The signed native APK and its update metadata are also published at
  `https://github.com/zachgus33/Tik-TakTV/releases/tag/native-preview-latest`.
- Both release channels use the same native package
  `com.tiktaktv.tv.nativepreview` and permanent TV signing key. Keep both
  identities unchanged so existing installations update in place.
- The Amazon Appstore build uses the same package and signing key, with its
  sideload updater disabled. Amazon manages updates to the store installation.

The retired web wrapper used a different package (`com.tiktaktv.tv`). Android
therefore treats an existing wrapper installation as a separate app; installing
the native APK does not migrate the wrapper's private local data. Sign in or
configure the native app before removing an old wrapper installation.

## Development build

```shell
./gradlew :nativeTvApp:testDebugUnitTest :nativeTvApp:assembleDebug -Pnuvio.android.distribution=full
```

The APK is written to
`nativeTvApp/build/outputs/apk/debug/nativeTvApp-debug.apk`. The
`Native Android TV preview` workflow also runs lint and TV emulator smoke tests
before publishing a signed APK to the stable Downloader URL.

## Amazon build

The `Build Amazon Fire TV submission APK` workflow runs tests and lint, then
builds and verifies the signed `appstore` variant. Use its
`TikTak-TV-Amazon-Fire-TV` artifact for Amazon submissions. The store variant
does not check GitHub for sideload updates.
