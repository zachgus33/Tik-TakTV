# TikTak TV — Living Development Backlog

**Backlog version:** 2.2
**Created:** November 5, 2026
**Source:** User's ChatGPT conversation, screenshots of Reddit feedback, and related TikTak TV discussions.
**Owner:** TikTak TV developer.
**Purpose:** Hand this file plus the full conversation to a Codex agent in Visual Studio / VS Code. Update this same backlog whenever new screenshots, comments, bug reports, feature ideas, or test results arrive.

> **IMPORTANT FOR CODEX:** This document is a planning and triage backlog, not a claim that every issue still exists. First inspect the actual repository, architecture, recent commits, and current build. Some bugs were partially or apparently fixed between reports. Do not blindly implement everything or overwrite functioning behavior. Preserve existing features and add regression tests. Never put private IPTV credentials, add-on URLs, tokens, emails, or other secrets in issue reports, commits, logs, or public screenshots.

## How to maintain this living list

- Keep stable IDs (`BUG-##`, `UX-##`, `FEATURE-##`, `ANALYTICS-##`, `RELEASE-##`, `QA-##`). Add new items instead of replacing older findings.
- For each new user screenshot or comment: record the _report_, affected platform, behavior, reproduction steps if known, observed version (if given), suspected area (as hypothesis only), priority, owner/next step, and status.
- Use these statuses: `Needs reproduction`, `Investigating`, `Planned`, `In progress`, `Fixed — awaiting user verification`, `Verified`, `Deferred`, `Won't do`.
- Keep a separate **User-reported**, **Likely cause (unverified)**, and **Acceptance criteria** distinction. Never treat a proposed explanation as proven.
- If an update seems to fix one issue but breaks another, cross-link them in the regression log. Keep the last known-good build available.
- After each implementation pass, append a dated changelog entry and state which devices/builds were tested. Do not mark a bug `Verified` merely because the code compiles.
- Sort work by impact on actual use: broken playback and installation first, TV remote/navigation next, analytics/quality of life after that, experimental features last.

## Current product context

TikTak TV is a customized Nuvio-based entertainment application with a website (`tiktaktv.me`), Android TV / Google TV-focused APK, and web experiences. The owner promotes it in r/NuvioForks and r/AndroidTVApps. Features described in the conversation or recent announcement include movies/series via add-ons, Live TV/IPTV with EPG, Live Sports scores and IPTV matching, YouTube, library/profiles, a feedback system, and a private usage dashboard. **Audit the code to verify the precise state of each feature, and clarify which platform each feature supports.** The owner wants TikTak TV to become a widely used, stable fork, not just a one-time download.

---

# P0 — Core blockers: do these first

### BUG-08 · One secondary profile lost watch history while another profile on the same account remained intact (possible profile-scoped data-loss regression)

- **Priority:** **P0 — potential user data loss**; investigate before shipping unrelated feature changes. This should be triaged alongside core playback blockers, not deferred as a cosmetic bug.
- **Status:** **In progress — web sync boundary hardened; original loss and recovery still need physical-device/account verification.** The deployed-code audit found in-memory sync baselines were keyed only by numeric profile index, which repeats between accounts. The fix keys baselines by account owner + profile, refuses every write until that exact pair has loaded, and performs the guard before any remote mutation. No deletion path was found in web watch-progress sync; the affected family data has not been touched.
- **User-reported (November 5, 2026; clarification received):** The developer’s mother uses **a separate profile under the developer’s own account**, **not a separate account**. Her **watch history and possibly other saved state** appeared cleared the previous night, following the batch of app/web updates around the Reddit announcement. **The developer’s own profile on that very same account retained its watch history and other data unchanged.** This is an _isolated profile-specific symptom_, not evidence of account-wide data loss. The exact missing categories, affected platform/device, build numbers, and sequence are still unknown. Timing after a release is a lead, **not proof that the updates caused it**.
- **Immediate safety precautions:** Do **not** clear browser/app storage, reinstall/uninstall, sign out unnecessarily, force a migration/reset, or overwrite server-side data on her devices while examining the incident. If permitted, take a safe backup/snapshot of current local and server persistence first. Review release history and any available backups before attempting recovery. Avoid publishing viewing history, account IDs, access tokens, or other private information in logs or GitHub issues.
- **Investigate:**
  - Compare the exact versions/commits deployed **before and after the evening updates of November 4**, including TV APK, website, backend/schema and service-worker/cache changes.
  - Map where **watch history**, resume position / Continue Watching, watchlists, library/favorites, profile settings and add-on configuration are stored; establish **which** of these were actually lost. Do not conflate one missing collection with all data being deleted.
  - **Prioritize profile isolation within the same account:** Verify every read/write/upsert/cache key for history, progress, Continue Watching, watchlists, and sync is keyed by **both account ID and stable profile ID** where required. Look for active-profile ID changing, regenerated/migrated profile IDs, names being used as identifiers, a renamed/recreated child profile, wrong fallback to the default profile, missing profile metadata, improper filtering, and profile-specific migrations. Make sure an update cannot reset the secondary profile while leaving the default profile untouched.
  - Check account ID ↔ profile ID mapping, active profile selection, authentication/session refresh, cross-device sync timing, changed namespaces or storage keys, localStorage/IndexedDB/database migrations, accidental default-object initialization, empty-array writes, race conditions, cache invalidation, and backend upserts that could overwrite existing data.
  - Look for a **stale/empty client snapshot overwriting populated server state**, version/schema mismatch, orphaned profile records, or UI queries pointed at an incorrect account/profile. Review non-sensitive timestamped events and migration/error logs if available.
  - Determine whether data remains recoverable from device storage, synced backend records, backups, historical snapshots, or a still-signed-in device. Recover only with the account owner's permission and a verified backup plan.
- **Safe reproduction test:** On **disposable test accounts/profiles only**, first create **one account with at least two distinct profiles** (primary/developer-equivalent and secondary/mother-equivalent). Seed **different identifiable dummy histories and resume positions for each**, plus favorites/watchlists and settings. Update from last known-good release to each relevant build while switching profiles, refreshing website, performing web-to-TV sync, restarting TV, and testing interrupted/concurrent web/TV sessions. Check both profiles’ stored records and UI after _every_ step. Confirm secondary history cannot be silently cleared/reassigned while primary stays intact; also ensure primary cannot overwrite secondary through sync. Never use the actual family account for destructive reproduction.
- **Acceptance:** Updates cannot silently reset, hide, merge, transfer, or overwrite history on **any profile** within one shared account. Migration/sync tests preserve distinct per-profile records and stable ownership; switching profiles does not pull the wrong profile’s history or clear a secondary profile. Stale/empty clients cannot delete valid records by default; intentional resets require clear confirmation. Verify on a TV and web with disposable multi-profile test data, then request the affected family member’s confirmation after a safe subsequent update.
- **Related:** QA-03 (web-to-TV sync), RELEASE-02 (data-safe updates), RELEASE-03 (rollback/version testing), UX-04 (returning-user experience). **High retention risk:** losing viewing progress can make regular users abandon the app even if playback works.

### BUG-01 · Movies/TV shows show a blank screen on Nvidia Shield

- **Status:** **Fixed — awaiting Nvidia Shield verification.** The current player provides format/network/decode errors, retries alternate direct sources, attempts compatibility conversion when available, and avoids an unexplained blank player. Physical Shield playback with the reporter's lawful sources remains required before marking Verified.
- **User-reported:** Reddit tester `Swap16` says that after a recent update, movies and TV shows do not play; the screen stays blank. They have many add-ons that work in Nuvio/Stremio.
- **Context:** A previous update restored YouTube video playback; another fixed on-screen controls remaining visible. The add-on movie/series problem is the current blocker. Do _not_ assume the controls change caused it without comparing commits.
- **Investigate:** Whether the stream list appears; whether a stream was chosen; whether there is a stream URL; player open/initialization; MIME/container/codec support; external vs embedded player; DRM and request/header handling where applicable; player error callbacks; timeouts; supported add-on API flows; device-specific playback paths. Compare to last working build.
- **Acceptance:** With a lawful, working test source, user can pick a movie or episode, select a valid stream, get video+audio, exit, and play a second title on Nvidia Shield; meaningful non-sensitive errors appear instead of unexplained black screens.
- **Follow-up to tester:** Does the stream selection list populate? Is the screen blank _before_ selecting a stream, or _after_ selecting one? If after, is there audio or an error? Which app version and Nvidia Shield model?

### BUG-02 · Only 5 of roughly 15 installed add-ons appear to be searched

- **Status:** **Verified in code and automated tests; awaiting reporter confirmation.** All enabled, compatible stream add-ons are queried concurrently with no five-add-on cap. The UI now reports total installed streaming add-ons, eligible/queried count, paused count, failures/timeouts and incompatible manifests without revealing private URLs.
- **User-reported:** The same Nvidia Shield tester says TikTak TV keeps searching and searches only five add-ons even though they have approximately 15 that work in Nuvio/Stremio.
- **Investigate:** Which installed add-ons support stream queries (not all add-ons necessarily do), user/account/profile synchronization, cached install list, manifest handling, disabled/unavailable add-ons, per-addon request fan-out, per-addon failures/timeouts, limit/pagination or hard-coded cap, UI counter semantics, error isolation, and missing results.
- **Acceptance:** Search accurately enumerates _eligible_ stream-capable enabled add-ons, never silently caps at five, surfaces successful/failed/timed-out counts without leaking endpoint secrets, and preserves results from other add-ons when one fails. Confirm separately that missing playable sources are not actually a playback issue.
- **Link:** BUG-01; do not combine these into one cause without evidence.

### BUG-03 · Google TV user reports app unusable

- **Status:** **Fixed — awaiting Google TV user verification.** The dedicated TV APK declares Leanback, landscape and no-touch support, launches `?tv=1`, appends a TikTak Android TV user agent, and has automated install/launch/D-pad/media-key/crash checks.
- **User-reported:** `lll_Shopping_2879` in r/NuvioForks: “Cant use it all on google tv.” They were asked to clarify installation vs remote control vs playback and device model; no definitive details shown yet.
- **Investigate:** APK install/sideload flow, minimum API/architecture, correct TV package, startup crash, WebView compatibility, focus navigation, permissions, and playback.
- **Acceptance:** Compatible Google TV devices can install, launch, navigate with remote, and play supported content; device/OS limitations are documented.

### BUG-04 · Google TV Streamer appears to receive mobile UI instead of TV UI

- **Status:** **Fixed — awaiting Google TV Streamer verification.** The TV APK forces both the TV route and Android TV user-agent marker, independent of the hardware's browser user agent; TV CSS is then selected explicitly.
- **User-reported:** `BigZombie5131` describes it as “like mobile app is being loaded onto Google TV streamer.”
- **Investigate:** TV detection based on device features / Android UI mode rather than unreliable user-agent alone; APK/package selection; responsive breakpoints; native vs WebView build; deep-link and landing route; persisted layout overrides.
- **Acceptance:** Google TV Streamer and other supported television hardware consistently show a usable D-pad-focused TV layout, not a touch/mobile page; explicit TV-layout override/fallback if detection fails.
- **Related:** BUG-03, BUG-05. Do not conclude device detection is the cause until tested.

# P1 — TV experience and regressions

### BUG-05 · Discover page D-pad focus jumps back to top

- **Status:** **Verified in automated TV navigation tests.** Horizontal movement is constrained to the current row; Discover uses ten-foot spacing; scrolling and focus restoration are covered at 1280×720 and Fire TV-sized 960×540 viewports.
- **User-reported:** `Jayrome01101971` can scroll down the Discover page, but pressing left/right causes focus/cursor to jump to top instead of staying within the current row; focus becomes misaligned.
- **Investigate:** Focus engine's directional neighbors; keydown handlers; React re-render/identity keys if applicable; virtualization; row/item focus restoration; scrolling; offscreen focus targets; dynamic card data.
- **Acceptance:** On Android TV/Google TV remotes, Down enters rows; Left/Right navigates adjacent items in the same row without jumping to top; back-navigation restores sensible focus; no offscreen/cut-off cursor.
- **Communication:** Developer told tester this would be investigated/fixed, so prioritize and post an update once verified.

### BUG-06 · Player controls should disappear after inactivity

- **Status:** **Verified.** Movie/live player and YouTube controls use a 3.5-second inactivity timeout, reappear on input, and have automated regression coverage; the original tester also confirmed the fix.
- **Timeline:** Nvidia Shield user first reported on-screen controls would not disappear; Back/X closed the video rather than simply hiding controls. After an update, they confirmed “Now the buttons are disappearing.”
- **Acceptance:** Playback controls automatically hide after approximately 3–4 seconds of no remote input during playback, reappear on D-pad/OK, and Back behaves predictably (initial Back may dismiss overlays rather than unexpectedly close video). Verify on YouTube, movies/series, and IPTV; no stuck overlay or accidental player exit.

### BUG-07 · Nvidia Shield YouTube playback regression test

- **Status:** **Fixed — awaiting Nvidia Shield verification.** YouTube search/open/play behavior and remote-friendly controls are covered in browser/TV tests; retain a real Shield check before marking Verified.
- **User-reported:** Earlier YouTube videos did not work on Nvidia Shield; tester subsequently said videos work in latest version.
- **Acceptance:** YouTube video launch/play/seek/pause/resume/fullscreen and remote focus work on Shield after future player changes. Do not reintroduce failure while fixing BUG-01.

### QA-01 · Device/feature regression matrix

- **Status:** **In progress / enforced in CI.** Web release checks cover Chromium, Firefox, iPhone and iPad plus explicit 1280×720 and 960×540 TV layouts. Android TV CI installs the APK in an emulator and checks launch, D-pad, media keys and crashes. Physical Shield, Fire TV and Google TV confirmation remains outstanding.
- **Devices:** Nvidia Shield (actual version/model when known), Google TV Streamer, other Google TV devices, Android TV box, Fire TV, phone/tablet web, desktop web, installed PWA, and any Android phone app if supported.
- **Test flows:** installation/launch → login/profile → search/discover D-pad → movie/episode add-on stream search/play → IPTV channel/EPG playback → YouTube launch/play → sports channel/score → library sync → app relaunch/update → reporting a bug. Test focus, controls auto-hide, Back semantics, media playback, and recovery from invalid sources.
- **Acceptance:** A documented pass/fail matrix for each release, especially across the three playback types, with exact release version/device.

### QA-02 · Diagnosable errors, not black screens or infinite spinners

- **Status:** **Verified for current web/TV flows.** Source search now reports queried, incompatible, paused and failed/timed-out add-on counts without endpoint disclosure. Playback surfaces decode/network/format/preparation errors, supports safe alternate-source fallback, and links to private in-app reporting.
- **Add:** Clear timeout/error/empty-state paths, retry and cancel controls, safe per-addon status, optional opt-in diagnostic report with version, platform, OS/device model, stage reached, and redacted error codes.
- **Never collect:** IPTV credentials, private provider URLs, private add-on URLs, API keys, auth tokens, media URLs, user email or viewing titles without appropriate specific consent. Be careful that console logs and diagnostics don't leak these.
- **Acceptance:** Unsupported/error streams explain what went wrong; users can report a reproducible issue without sharing secrets.

# P2 — Important UX and product improvements

### QA-03 · Preserve web-based setup/update and TV account/profile sync

- **Priority:** P1 (protect an already-appreciated workflow; not a new blocker).
- **Status:** **Verified in code and automated integration tests.** Account/profile setup, add-ons, collections, provider settings, library and progress use profile-scoped sync calls. The 1.5 hardening adds account+profile baseline isolation and blocks writes before the correct remote profile load completes.
- **Evidence:** Reddit tester `Wonderful-Ordinary-1` (November 5, 2026, 3:43 PM) said: “I do appreciate the web update ability and then to sync so much better than typing in with a remote 😁”. This supports that the user _values_ the web-to-TV workflow; don't infer that every setting or device syncs perfectly.
- **Keep working:** Users should be able to make supported profile/configuration changes on the web, then see those supported changes reflected on their TV without re-entering everything using a D-pad/remote. Confirm exactly what the product presently syncs (e.g., profile settings, app preferences, supported add-ons), rather than assuming full two-way sync.
- **Investigate/test:** Same-account and same-profile mapping; sign-in across devices; data persistence after web changes, TV relaunch and APK updates; sync delays and refresh affordance; stale cache; offline/error states; account switching; duplicate or overwritten settings; conflicts between edits made on TV and web; secret handling and authorization boundaries.
- **Acceptance:** A real user can change each _advertised/supported_ setting in the web UI and reliably retrieve that value on a TV using the supported sync method, without manual re-entry. Never expose private tokens/URLs or one user's configuration to another user. Show a clear sync/error state when updates cannot be applied. Existing sync functionality stays intact through BUG-01/02 and RELEASE-02 changes.
- **Tester follow-up:** Thank `Wonderful-Ordinary-1` for the positive feedback and optionally ask which web-to-TV settings they use most, to make sure future updates don't regress the workflow.

### UX-01 · Collapsible/compact TV left sidebar

- **Status:** **Verified in automated TV layout tests.** The TV rail stays compact while content has focus, expands over the page when the remote enters navigation, and collapses without shifting the content canvas. Dedicated 1280×720 and 960×540 Fire TV-sized checks cover both widths.
- **User-reported:** `Wonderful-Ordinary-1` shared a TV screenshot and requested that the left side collapse to reclaim screen real estate.
- **Suggested behavior:** When sidebar is not focused, show icons only; expand labels when focused by remote. Keep current selection visible, support D-pad navigation and accessible labels. Optional settings: Auto-collapse / Always expanded / Always compact.
- **Acceptance:** More usable screen width without harming navigation; focus doesn't jump/disappear when sidebar changes width; smooth layout on 1080p/4K displays.

### UX-02 · Robust remote-first interface throughout

- **Status:** **Verified for current primary pages and dialogs.** Spatial-navigation tests cover rows, modals, forms, long pages, Live guide channels and full-screen playback. Continue real-device regression testing as layouts evolve.
- **Scope:** Predictable directional focus, selection highlighting, focus restore after modal/navigation, remote Back, focus on search/keyboard, menus and player controls, consistency across Android TV/Google TV/Shield.
- **Acceptance:** Every primary action is reachable using only the standard remote (no mouse/touch needed). Fix BUG-05 and BUG-06 as concrete first tests.

### FEATURE-01 · Separate sports score matching from IPTV channel/playability

- **Status:** **Verified in automated browser tests; awaiting live-provider confirmation.** Sports events distinguish score matches from IPTV channel matches, include live/upcoming state and country/sport filtering, and do not label an event playable without a matched channel. Live, score-bearing matched games are promoted into a dedicated section above generic listings. Score polling pauses while hidden, ignores unchanged responses, and guide rescans atomically replace results without clearing filters, progressive-render state, or the current page position.
- **Problem:** Sports scoreboard API matching and IPTV channel availability are independent. A missing score does not mean a working channel is broken; a valid score does not guarantee the user has a playable stream.
- **Add:** Separate indicators `Score available/unavailable`, `Channel matched/unmatched`, and `Playback tested/unknown`; event-to-channel match confidence labels (e.g. Exact/Likely/No match) grounded in match quality; distinguish guide metadata from confirmed playable stream. Handle scoreboard mismatch and missing event data gracefully.
- **Optional demo/documentation:** Pick a game from a user's own guide, show matched channel, compare a clear score match against an unmatched scoreboard event, show that missing score doesn't disable channel.
- **Acceptance:** Sports UI doesn't imply that missing scores break playback or that matching a channel guarantees a working stream. Clicking available channel still opens playback without needing a scoreboard match.

### FEATURE-02 · Optional SmartTube launch as YouTube alternative

- **Status:** **Fixed; awaiting physical Android TV confirmation.** The TV APK now exposes a validated native bridge and the YouTube player shows **Open in SmartTube** only in TV mode when that bridge exists. It tries known SmartTube package variants through `vnd.youtube` and leaves TikTak TV's embedded player running when SmartTube is absent or cannot open the video. Native policy and browser handoff tests cover safe video IDs and the fallback path.
- **User-reported:** `Wonderful-Ordinary-1` asked about SmartTube / TizenTube-like behavior instead of ordinary YouTube.
- **Practical phase 1:** On Android TV, investigate an optional “Open in SmartTube” button or default YouTube app preference, using supported installed-app detection/deep links/intents with graceful fallback. Keep in-app YouTube functionality intact.
- **Constraints:** SmartTube is Android-TV-oriented; TizenTube targets a different platform, so it isn't a drop-in Android TV dependency. Do not promise integrated ad blocking or unsupported playback. Check technical/legal and distribution implications before deeper integration.
- **Acceptance:** User can choose supported YouTube playback route on supported devices; if external app absent, the current method still works.

### FEATURE-03 · Optional TV home launcher mode (long-term)

- **Status:** **Deferred / research**, not a short-term blocker.
- **User-reported:** `Wonderful-Ordinary-1` suggests making TikTak TV an all-in-one Google TV launcher similar to their personal Projectivy/other launcher setup, with buttons for TiviMate, Stremio, sports, and calendar.
- **Possible scope:** Launch installed external apps via Android intents, customizable shortcut cards, sports/calendar modules, TV home screen mode; evaluate OS restrictions on replacing Google TV default launcher.
- **Recommended phase:** Start with optional app shortcuts _inside TikTak TV_; assess true launcher support only after core TV navigation/playback is stable. Keep standard media app usable without becoming the OS launcher.
- **Acceptance for research:** feasibility, Android TV launcher intent requirements, policy/compatibility constraints, user opt-in design, scope estimate.

### FEATURE-04 · Mini live-TV video preview while browsing the EPG/guide

- **Priority:** P2 — user-requested convenience feature; schedule after basic TV playback and remote-navigation stability.
- **Status:** **Fixed after two user-found regressions; automated matrix verified, physical-device confirmation pending.** The first implementation only worked through its dedicated minimize button in TV mode; ordinary X/Back still stopped playback and non-TV CSS was incomplete. A second production test found that minimizing could lock the outer Live TV/Sports page and trigger an expensive full-app redraw. X, Escape, and Android TV Back now minimize full-screen live playback; Restore reuses the exact same video element/session; only closing the mini-player stops it. Mini-player state is isolated inside the player, the mini-player no longer activates the global dialog scroll lock, and Sports scanning yields between small guide slices. Tests cover TV mode and ordinary browser mode in Chromium, Firefox, iPhone/WebKit, and iPad/WebKit, including viewport containment, same-element identity, outer-page scrolling, Live TV guide interaction, and the reported Sports → Football → ESPN → minimize sequence.
- **User-reported:** Reddit tester `Wonderful-Ordinary-1` (November 5, 2026, 12:45 PM) asked: “Will you be adding small preview video of what’s currently playing when in guide?” Developer replied: “I’d be happy to do that!”
- **Intent:** When the user opens the Live TV electronic program guide, preserve visibility of the currently playing channel in a small picture-in-guide preview pane, so browsing programs does not interrupt viewing. Clarify whether the requester means the _currently tuned channel_ (safest default) or the highlighted guide channel (optional future preview behavior).
- **Proposed behavior:** Keep the current video session playing while the guide overlays or shrinks the playback surface; show a small video tile at a consistent location without covering program titles or focus targets; allow the user to navigate EPG rows and times with a D-pad, select a channel to tune, return to fullscreen using OK/Back or a clear “Expand” action; preserve current audio unless user deliberately changes channels. Clearly distinguish program metadata from stream playback.
- **Implementation investigation:** Identify whether IPTV playback uses native player/ExoPlayer, browser video, WebView, or embedded surface. Reuse the **same active player** and streaming session where possible (rather than starting a second stream); check video-surface reparenting/resizing, aspect ratio, buffering, memory and bandwidth usage, DRM restrictions where applicable, lifecycle when exiting guide or app, rotation and device-dependent layout.
- **Remote/accessibility acceptance:** Guide can be opened during live TV without stopping video; currently tuned channel continues in the preview; highlight and D-pad focus remain stable; switching channels is explicit, not triggered by hover; going back to fullscreen does not restart playback or lose the selected program; preview hides/reflows gracefully on small screens and constrained hardware.
- **Fallback/edge cases:** If a stream is loading, failed, paused, or playback backend cannot support a live preview, show artwork or “Preview unavailable” while keeping the guide usable. Do not start multiple simultaneous streams or consume extra stream connections without user permission. Honor reduced-motion preferences and mute/audio controls.
- **Validation:** Test with multiple EPG sizes, fast channel switching, long guide browsing, unsupported streams and back-button paths on Google TV Streamer, Nvidia Shield, Fire TV, Android TV; explicitly check player controls auto-hide (BUG-06) and Discover/guide focus interactions (BUG-05/UX-02).
- **Follow-up:** Once shipped, ask `Wonderful-Ordinary-1` to test the preview on the TV setup shown in their screenshot and confirm it behaves as expected.

### UX-03 · Accessible first-run install and onboarding

- **Status:** **In progress.** The TV APK has a stable signed release workflow, checksum metadata and in-app update prompt; the website has first-run setup guidance. Downloader code 2564237 still requires external revalidation before publication.
- **Evidence:** A tester initially browsed a GitHub source tree in Downloader and didn't know where to install; later successfully installed after receiving Downloader code **2564237** (code must be revalidated before publishing).
- **Add:** Prominent Android TV/Fire TV download button, Downloader code, exact APK release link, simple instructions, screenshot of correct install flow, warning not to navigate source tree, Google TV sideload permission guidance where needed. Separate web vs TV APK instructions; ensure download link matches supported platform.
- **Acceptance:** A first-time user can install from website or Reddit post without needing a DM; broken links and old codes caught in release smoke tests.

### UX-04 · Better onboarding and returning-user experience

- **Status:** **Verified.** First-run setup, persistent profiles/preferences, in-app What's New, feedback, health checks and returning-user account sync are implemented.
- **Add:** Quick device-specific welcome guide, clear support/feedback path, optional “What's new” after updates, save preferences/profiles, ensure user configuration survives updates.
- **Acceptance:** User can get started, understand where TV/YouTube/Sports features live, return later with their setup intact.

# P2 — Analytics: learn who really returns

### ANALYTICS-01 · Distinguish signed-in vs active vs online

- **Status:** **Verified.** The private owner dashboard separates visits, online devices, active interaction/playback, signed-in accounts and returning users, and explains each definition.
- **Definitions to implement/document:**
  - `Signed-in account`: unique account with valid session activity during given period, _not_ proof of media viewing.
  - `Online now`: heartbeat from foreground/open app within a short clearly stated interval.
  - `Active now`: real app interaction OR foreground video playback heartbeat, not merely a stale login.
  - `Returning user`: same pseudonymous device/account active on 2+ distinct dates after initial activity.
- **Pitfall:** On-screen `Signed in now` could undercount a person watching a long video if heartbeats stop; use appropriate foreground/playback heartbeat without collecting what they're watching.
- **Acceptance:** Dashboard labels and definitions are precise; metrics don't imply sessions/viewing when only presence is measured.

### ANALYTICS-02 · Retention and session health metrics

- **Status:** **Verified.** The private dashboard reports 24-hour/7-day/30-day activity, new/returning accounts, sessions, active duration and D1/D7/D30 retention without collecting titles, searches, credentials or media URLs.
- **Add or verify:** Daily/weekly/monthly active users (DAU/WAU/MAU), new vs returning users, D1/D7/D30 cohort retention, sessions per user, average active session duration, optionally visits by TV/mobile/desktop/PWA, anonymous vs signed-in device counts. Display trends over time and **avoid treating raw visits as unique people**.
- **Privacy:** Pseudonymous salted random device IDs and consent-aware anonymous heartbeat; minimize collection, enforce retention period, avoid tracking viewing history, provider details or media links.
- **Acceptance:** 24h/7d/30d figures are accurate and deduplicated; developer can tell whether people come back without collecting sensitive viewing data.

### ANALYTICS-03 · Instrument feature health and release quality (privacy-safe)

- **Status:** **Partially implemented.** Playback/source failures are diagnosable in the UI and can be submitted privately. Broader privacy-safe aggregate release-health reporting remains optional.
- **Optional aggregate events:** App open / session start, navigate to section, begin source search, source-search success/failure count, start playback success/failure, major remote navigation failures, install/update version, bug-report submitted. Do not log titles, stream URLs, private manifests, credentials, or identifiable details.
- **Acceptance:** Dashboard can show which device classes or releases have failures and whether fixes improve completion; aggregate counts only unless user consents to diagnostics.

### ANALYTICS-04 · Understand initial acquisition vs real retention

- **Status:** Product insight, not an engineering bug.
- **Context:** Screenshots showed accounts using TikTak TV increasing 8 → 15 → 22 → 36 in a day, but `Signed in now` sometimes displayed 1, and 30-day new sign-ups were fewer than accounts using the app. Earlier screenshots showed 126 anonymous devices and 137 visits; these counts have different meanings and may include testing/multiple devices. Reddit post views alone don't prove app installs.
- **Goal:** Validate regular use with 7-day returning cohorts and non-friend testers rather than total installations or Reddit views.

# P2 — Releases, feedback and stability

### RELEASE-01 · Lightweight release notes / What's New

- **Status:** **Verified.** A dismissible once-per-release prompt and reopenable update history are implemented in-app.
- **Add or refine:** In-app update notes, release version/date, fixes/new features/known limitations, link to full changelog, show once per release or allow reopening; especially helpful to testers who asked whether fixes landed.
- **Acceptance:** User knows whether a known problem has been addressed; release notes correspond to actual shipped builds.

### RELEASE-02 · Reliable update/install process

- **Status:** **Verified for the TV release pipeline.** Signed versioned APK publishing, stable download metadata, SHA-256 verification and in-app update/install prompting are implemented. Permanent signing secrets remain in GitHub Actions.
- **Add:** Versioned Android TV APK releases; trustworthy download distribution; clear install/update steps; no accidental app data loss; backward-compatible config migration; checksum/signing consistency; if feasible, in-app update notification (without misleading automatic updates).
- **Acceptance:** Existing users can update without reinstalling or losing addons/profiles/settings; downloadable APK matches public version.

### RELEASE-03 · Known-good builds + regression safety

- **Status:** **Verified in repository/CI.** Release workflows test builds before publication and keep commit-addressable history and stable release artifacts. Physical-device candidate testing remains a release discipline.
- **Add:** Release tags, candidate/testing builds, rollback APK or previous release, changelog linked to commits/issues, automated player/search/navigation smoke tests where feasible.
- **Acceptance:** If the controls fix causes unrelated playback failures, team can isolate changed code and roll back safely.

### RELEASE-04 · Public GitHub issues and bug templates

- **Status:** **In progress.** Public bug and feature templates exist. This pass adds TikTak TV/Shield/Google TV/Fire TV platform choices, privacy-safe screenshot guidance and correct TikTak release/documentation links.
- **Add:** GitHub Issues, labels for `bug`, `enhancement`, `Android TV`, `Google TV`, `Nvidia Shield`, `playback`, `add-ons`, `focus`, `needs reproduction`; privacy-safe issue template fields: app version, OS/device, section, steps, expected vs actual, safe error text, redacted screenshot.
- **Acceptance:** Reddit and in-app reports become trackable issues with links to release fixes; no secrets disclosed.

### RELEASE-05 · Feedback system quality

- **Status:** **Verified.** Bugs and feature requests can be submitted inside TikTak TV with up to three screenshots and privacy guidance; the owner-only inbox supports triage statuses and deletion.
- **Add:** Triage categories, version/device metadata when consented, privacy warning before screenshot submission, follow-up status or GitHub link, avoid duplicate reports; no secret scraping.
- **Acceptance:** Developer can act on feedback and users can see when known issues are fixed.

# P3 — Discovery, community, positioning

### GROWTH-01 · Clear TikTak TV identity and first impression

- **Status:** Ongoing.
- **Positioning idea:** An accessible, customizable Nuvio-powered entertainment hub for movies/series (via users' own configured sources), IPTV/live TV, sports, YouTube, and cross-device use. Avoid promising universal functionality unsupported on a given platform.
- **Add:** Short above-the-fold description, screenshots/video of _working_ TV UI, feature/device matrix, quick install CTA, current limitations, privacy/FAQ. Make it obvious why someone should choose this fork rather than just using original Nuvio.

### GROWTH-02 · Community communication and feedback loop

- **Status:** Ongoing.
- **Channels:** r/NuvioForks, r/AndroidTVApps, GitHub releases/issues, optional in-app changelog.
- **Guidance:** Post concise, accurate change notes and device-tested results; answer issues kindly, ask targeted reproduction questions, avoid promises of unverified same-day fixes. Invite useful testers to confirm fixes, without overpromoting or posting spam.
- **Goal:** Build a small base of genuine returning users outside family/friends, not just one-time trials.

### GROWTH-03 · README / compatibility / known issues page

- **Status:** Suggested.
- **Add:** Official web vs TV builds, install details, tested Android/Google TV/Shield/Fire TV devices, supported inputs, remote layout, known playback/add-on limitations, troubleshooting guide, source/privacy notes.
- **Acceptance:** New tester can self-serve installation and provide actionable feedback without a private chat.

---

## 2026-11-05 deployed-code audit (v1.5)

- **Audited source:** remote `web-enhanced-pages` commit `6a080626a`, confirmed identical to the code currently deployed before this pass. The older dirty project-root checkout was not used for implementation.
- **P0 data safety:** Web profile baselines now use account owner + profile index, and saving is rejected before any remote write unless that exact profile finished loading. Added regression coverage for same-number profiles across different accounts. The real family profile was not modified; recovery remains unverified.
- **Add-on enumeration:** No hard-coded five-add-on limit exists. Every enabled manifest that declares a compatible `stream` resource is queried with per-add-on isolation and timeout. This pass adds a user-visible, privacy-safe enumeration summary.
- **TV classification:** The Android TV APK is Leanback-only, landscape, no-touch, and forces `https://www.tiktaktv.me/?tv=1` plus `TikTakTV-AndroidTV/<version>`. Google TV cannot silently fall back to the mobile layout through ordinary user-agent detection.
- **Remote/player evidence:** Automated tests cover Discover row movement, long-page scrolling, modal focus, guide navigation, full-screen TV playback and 3.5-second control hiding. Physical Nvidia Shield/Google TV/Fire TV verification is still required where stated.
- **Already shipped and verified by audit:** Sports score/channel separation and filters; channel artwork/EPG feature panel; responsive portrait routes; in-app feedback with screenshots/private inbox; What's New; private active/returning/retention analytics; signed/checksummed TV update pipeline.
- **Validation in this pass:** 77 web unit tests and all 220 runnable Playwright checks passed across desktop Chromium, Firefox, iPhone, and iPad projects (12 intentional engine-specific skips); the production bundle built successfully. GitHub run `42125290564` independently passed build, unit tests, all four E2E projects, and production deployment. Android TV run `42125290644` passed unit tests, lint, APK build, 1080p emulator launch, remote/media keys, and crash smoke. Signed-release run `42125945356` built and signature-verified the 0.3.5 APK, published the stable Downloader asset, and uploaded the signed build evidence. Public metadata reports version code 8, version name 0.3.5, and SHA-256 `91761de318375e4807ed05ba2689706fc5263a736e144c6c844d34f966480177`.
- **Still intentionally open:** Physical-device confirmation for BUG-01/03/04/07 and FEATURE-02/04, Downloader-code revalidation, optional analytics event detail, and long-term launcher research FEATURE-03.

## Suggested implementation sequence for Codex

**Phase 0: Audit and reproduce.** Inspect repo structure, where web/TV builds diverge, player implementations, device classification, addon query layer, analytics heartbeats, current release version and issue tracker. Reproduce with minimal lawful working test sources and actual or emulated TV remotes. Establish known-good baseline.

**Phase 1: Restore core reliability and protect saved data.** Immediately triage BUG-08 (secondary-profile watch-history loss while primary profile on same account stayed intact) with safe backup, multi-profile reproduction, and recovery investigation; in parallel handle BUG-01 and BUG-02, then BUG-03 and BUG-04. Add proper error/diagnostic handling (QA-02). Validate movie/episode, Live TV and YouTube with regression matrix QA-01 before release.

**Phase 2: TV navigation.** BUG-05 and verified BUG-06/07. Improve focus semantics UX-02, then implement UX-01 compact sidebar without breaking focus navigation. Test on real TV form factors.

**Phase 3: Make adoption and feedback easy.** Protect web-to-TV setup/sync (QA-03), improve UX-03 installation/docs, RELEASE-01 to RELEASE-05, and clear roadmap. Roll out fixes with real tester confirmation.

**Phase 4: Measure actual retention.** Verify shipped analytics, implement ANALYTICS-01/02 safely; optionally ANALYTICS-03. Do not substitute sign-ins or Reddit views for active/returning use.

**Phase 5: Feature differentiators.** FEATURE-01 sports clarity; FEATURE-04 mini video preview in Live TV guide; FEATURE-02 optional SmartTube integration; UX-04 onboarding. Research FEATURE-03 launcher only when core TV app is reliable.

## Codex kickoff prompt (copy this with the file)

> Read `TikTak_TV_Living_Backlog.md` and the full ChatGPT conversation. Audit the actual TikTak TV codebase first. Map each open item to relevant components/files and mark already-implemented or already-fixed items. Prioritize BUG-08 (watch-history loss on one secondary profile while primary profile on the same account remained intact; protect existing data and reproduce with multiple profiles in disposable test accounts only), broken Nvidia Shield add-on source discovery and movie/TV playback, then Google TV UI compatibility and Discover D-pad navigation. Produce a short implementation plan with reproduction steps, test strategy, and affected modules before editing code. Implement in small reversible changes; retain a known-good version, protect secrets, and run platform-specific regression checks. Update the backlog with statuses, evidence, version, and change history after each fix. Do not conflate user reports, guesses, and verified root causes.

---

## Update log

- **2026-11-05 — v1.0:** Consolidated all developer discussion, screenshots, user reports, feature requests, analytics recommendations, and release/community suggestions in this conversation. Statuses are conservative because Codex has not audited the repository yet.
- **2026-11-05 — v1.1:** Added FEATURE-04, requested by `Wonderful-Ordinary-1`: keep currently playing live-TV video visible as a small preview while browsing the EPG; developer agreed to explore/add. Added remote-control, playback-lifecycle, and no-extra-stream acceptance criteria. Kept UX-01 collapsible sidebar as a separate existing feature request.
- **2026-11-05 — v1.2:** Logged positive feedback from `Wonderful-Ordinary-1` praising web-based updates followed by TV sync. Added QA-03 to preserve and regression-test that existing convenience, without misclassifying praise as a new bug or unimplemented feature. FEATURE-04 and UX-01 remain requested; no implementation verification yet.
- **2026-11-05 — v1.3:** Added **BUG-08 (P0)** after owner reported their mother’s watch history and other unspecified saved state apparently cleared the night following recent Reddit-announced updates. Added cautious forensic checks, recovery precautions, safe test-account reproduction steps, version/migration/profile/sync hypotheses, persistence acceptance criteria, and links to existing QA/release items. No root cause or permanent deletion has been confirmed. Updated Codex implementation priorities.
- **2026-11-05 — v1.4:** Clarified **BUG-08**: mother and developer use _different profiles on the **same account**_; only her profile reportedly lost history, while the developer’s own profile and saved data were unaffected. Elevated profile-scoped ID/keying, account+profile mapping, cross-profile sync/overwrite, and multi-profile update reproduction checks. Cause and recoverability remain unverified.
- **2026-11-05 — v1.5:** Audited the exact deployed commit `6a080626a`; mapped shipped behavior and automated evidence; hardened account+profile sync baselines before any writes; added privacy-safe add-on enumeration diagnostics; implemented the focus-expanding compact TV sidebar; verified 77 web tests, production build and focused TV navigation/layout tests; kept physical-device-only and unimplemented requests open.

- **2026-11-05 — v1.6:** Implemented the optional SmartTube Android TV handoff with safe fallback, the same-session Live TV guide mini-player, compact focus-expanding TV navigation, safer account+profile sync baselines, add-on enumeration diagnostics, improved device/privacy issue forms, TV APK 0.3.4 (version code 7), and user-facing release notes. Physical TV hardware confirmation and the external Downloader code remain open.
- **2026-11-05 — v1.7:** Withdrew the earlier overbroad FEATURE-04 completion claim after user testing found X/Back still ended Live TV and ordinary mobile/desktop styling was incomplete. Fixed X/Escape/Android TV Back to minimize the same live video session, made the corner player responsive outside TV mode, added same-element and viewport assertions, passed 77 unit tests and the full 220-test browser/device matrix, and published the signed TV APK 0.3.5 (version code 8). Current web, Android TV emulator, and signed-release evidence is recorded above; physical-device checks remain open.

- **2026-11-05 — v1.8:** User testing exposed severe lag and an outer-page scroll lock after minimizing Live TV from both the guide and Sports, especially through Sports → Football → ESPN on a large provider. Root causes were global dialog scroll locking, top-level mini-player state rebuilding the large Live TV/Sports tree, and continuously queued Sports guide scans. Isolated player state, exempted only the nonmodal mini-player from scroll locking, memoized Sports playback/render boundaries, and scheduled guide scans in idle-time slices with an Android/Fire TV fallback. Added the exact reported Sports sequence and outer-page Live TV scroll regression tests. Validation passed 77 unit tests, production build, and all 224 runnable Playwright checks across desktop Chromium, Firefox, iPhone/WebKit, and iPad/WebKit (12 intentional engine-specific skips). Physical Shield/Google TV/Fire TV confirmation remains open.

- **2026-11-05 — v1.9:** User reported that the Sports page appeared to reload every 30–60 seconds and lose their browsing position, and that real live score games were buried among generic events. Sports now keeps its existing results mounted while guide scans rebuild in the background, applies completed scans atomically, pauses score polling in hidden tabs, and ignores unchanged score responses. Added a top-priority Live scores section for matched games that are live and contain real team scores. Validation passed 78 unit tests, production build, and the score/filter/playback/mini-player/mobile-layout flow across desktop Chromium, Firefox, iPhone/WebKit, and iPad/WebKit. Physical TV confirmation remains open.

- **2026-11-05 - v2.0:** Added an automatic landing-page showcase that cycles through Movies, Live TV, YouTube, and Sports every 5.75 seconds. Manual selection holds the chosen preview for 12 seconds; hover, keyboard focus, hidden tabs, and reduced-motion preferences pause rotation. Tabs remain directly selectable and expose their selected state to assistive technology. Added desktop Chromium/Firefox timing and interaction coverage plus compact iPhone/iPad layout checks.

- **2026-11-05 - v2.1:** Reworked title search after a Home search for a TV series opened Discover in Movies and a one-letter misspelling returned no results. New searches default to a combined All scope across movie and series add-on catalogs, offer conservative TMDB-backed spelling corrections, preserve a one-click exact-query option, and retain Movies/Series filters. Search metadata loads lazily and failed add-ons remain isolated. Added pure spelling tests and the exact Home -> misspelling -> corrected series -> exact-query flow across Chromium, Firefox, iPhone, and iPad.

- **2026-11-05 - v2.2:** Expanded the public landing layout across the complete desktop viewport, added low-height desktop sizing so the showcase, tabs, benefits, and account panel remain visible at 720p and 768p, and kept portrait layouts free of horizontal overflow. Shortened automatic showcase rotation slightly to 5.75 seconds. Verified layout metrics at 1920x1080, 1366x768, 1024x768, and 390x844 in addition to the cross-browser landing tests.

## New feedback inbox (append here before triage)

_No untriaged items yet. Every new screenshot/comment should be analyzed, converted into a new item or linked to an existing ID, and then recorded in the update log._
