# Google Play release checklist

## Developer account

- Register the Play Console account and complete identity verification.
- Pay Google's one-time full-distribution registration fee if publishing publicly.
- For a new personal account, complete the required closed test before requesting production access.
- Add a support email and keep it monitored.

## Application identity

- Package: `com.tiktaktv.mobile`
- App name: `TikTak TV`
- Default language: English (United States)
- Category: Video Players & Editors
- Distribution: phones and tablets; do not include TV form factors in this listing.

## Signing and builds

- Create and securely back up the permanent upload key.
- Add the four signing secrets documented in the module README to GitHub Actions.
- Build and upload an Android App Bundle, not an APK, to Play Console.
- Enroll in Play App Signing.
- Increment `versionCode` for every uploaded bundle.
- Never add the Android TV self-updater or `REQUEST_INSTALL_PACKAGES` permission to this module.

## App links and authorization

- Host `/.well-known/assetlinks.json` on both `tiktaktv.me` and `www.tiktaktv.me` with the Play signing certificate fingerprint.
- Verify both Android App Links after the Play-signed build is available.
- Confirm the YouTube device authorization flow opens in the system browser and returns account state to the signed-in TikTak TV profile.
- Keep Google OAuth consent-screen branding, scopes, privacy policy, and terms current.

## Policy and content

- Do not bundle IPTV credentials, playlists, paid channels, add-ons, or playable sources.
- Describe TikTak TV as an independent media client/player. Do not imply that media subscriptions or copyrighted content are included.
- Require users to connect services they are authorized to access.
- Complete the content rating, target audience, ads, app access, and Data Safety questionnaires accurately.
- Supply reviewer instructions and a test account if review cannot reach core screens without sign-in.
- Use the public privacy policy and terms URLs from the module README.

## Quality gate

- Test small phone, large phone, foldable/tablet, Android 8, and current Android.
- Test portrait/landscape, gesture and three-button navigation, back, rotation, process recreation, offline/retry, imports, downloads, fullscreen, Picture in Picture, sign-in, sign-out, and account deletion/disconnection.
- Run unit tests and lint and inspect the release bundle with Android Studio's APK Analyzer.
- Complete the Play pre-launch report and fix crashes, ANRs, accessibility blockers, and unsafe WebView warnings before production.

## Optional support purchases

Keep all playback and organization features free. If optional supporter purchases are added later, create one-time in-app products in Play Console and integrate the current Google Play Billing Library. Do not enable the UI until product IDs, purchase acknowledgement, restoration, and backend verification are complete.
