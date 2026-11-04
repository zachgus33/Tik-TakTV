# Data Safety working sheet

This is an engineering inventory for completing Play Console's Data Safety form. Verify it against the production backend, analytics configuration, and final Play bundle before submitting; the console answers are the publisher's legal declaration.

## Data the app can process

| Category | Purpose | Handling |
|---|---|---|
| Email address and account identifier | Authentication and profile sync | Sent encrypted in transit to the configured account service |
| Profile name/avatar and preferences | App functionality and cross-device sync | Stored locally and, when signed in, in the account service |
| Collections, add-ons, playback progress and watch history | Personalization and app functionality | Stored locally and synchronized when the user enables/signs into sync |
| IPTV/provider configuration | User-requested live TV functionality | Stored according to the web app/companion-service privacy policy; never include secrets in diagnostics |
| YouTube account data and authorization tokens | Connected YouTube features | Read-only data; tokens are handled by the companion service and must remain encrypted at rest |
| Imported files and downloaded media | Import/export and user-requested downloads | Selected by the user and stored on the device |
| Diagnostics | Reliability and support | Must exclude passwords, tokens, provider URLs, manifests, and playable URLs |
| Random installation identifier and coarse app type | Optional aggregate usage counts | Identifier is HMAC-hashed by the companion; users can opt out in Privacy settings |

## Current mobile-shell behavior

- No advertising SDK is included.
- No advertising or third-party analytics/crash-reporting SDK is included in `mobileApp`; TikTak TV's optional first-party aggregate heartbeat is disclosed above.
- No precise or approximate location permission is requested.
- No contacts, microphone, camera, phone, SMS, advertising ID, or background location permission is requested.
- Network traffic uses HTTPS; invalid TLS certificates are rejected.
- The app does not sell personal data.
- Account and service deletion/disconnection paths must remain accessible from TikTak TV settings.

## Before submission

- Inspect the final dependency graph and merged manifest.
- Confirm whether the production account/companion services retain IP addresses or server logs and disclose them if required.
- Confirm whether data collection is optional or required for each category.
- Confirm deletion-request handling and publish the account-deletion URL required by Play.
- Reconcile every answer with the public privacy policy.
