# TikTak TV release radar

Reddit Developer Platform app for `r/TikTakTV`. Every 15 minutes it checks the official GitHub Actions release workflows and posts a text update only after a successful production website deployment or TV APK publication. It posts as the app account, not as the moderator's personal account.

## Release sources

| Product | Successful workflow | Post link |
| --- | --- | --- |
| Web/PWA | `web-pages.yml` | https://www.tiktaktv.me/ |
| Native Android TV / Fire TV | `native-tv-android.yml` | https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest |
| Manually published Android TV APK | `tv-android-release.yml` | https://github.com/zachgus33/Tik-TakTV/releases/tag/tv-latest |

The first scheduled check records the latest successful run for each source without reposting old releases. Later successful runs are posted in order. The website post uses the first entry in `web/src/WhatsNew.tsx` when its version advances; otherwise the bot summarizes commit subjects. TV posts use the built app version from the relevant Gradle file and summarize commit subjects. Every post includes the workflow run link for traceability, and the app checks recent subreddit posts before retrying a run if Redis was not updated after submission.

## Build and deploy

1. From this directory, run `npm ci`, `npm run check`, `npm test`, and `npm run build`.
2. Register the Reddit account with the Developer Platform at https://developers.reddit.com/new and accept Reddit's developer terms personally.
3. Create an app named `tiktak-release-radar` (or change `name` in `devvit.json` if unavailable). From this directory, run `npx devvit login` and `npx devvit upload` using the registered account.
4. The app requests HTTP access to `api.github.com`. Wait until that domain is approved in the app's Developer Settings. It does not need a GitHub token because the repository and release workflow runs are public.
5. Install the app on `r/TikTakTV` as a moderator. Check the app's logs after the first scheduled run. That run establishes the baseline without creating a post. The next successful website or TV release creates a post.

Keep the app installed for the schedule to run. If a release succeeds while GitHub is temporarily unavailable, the next check retries it. The bot does not require GitHub Actions secrets or a Reddit Data API client ID.

## Scope and behavior

The bot reads only the public `zachgus33/Tik-TakTV` repository. It stores only release run IDs, commit SHAs, and version strings in Reddit's installation-scoped Redis. It does not read subscriber accounts, viewing history, add-on URLs, or credentials. GitHub's public API rate limit and Reddit's HTTP domain approval apply.
