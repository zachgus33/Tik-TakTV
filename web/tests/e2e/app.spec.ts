import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { latestRelease, releases } from "../../src/WhatsNew";

const meta = {
  id: "tt-test",
  name: "The Test Movie",
  type: "movie",
  description: "A test catalog title.",
  year: "2026",
  imdbRating: "8.1",
  runtime: "120 min",
};
async function mockSources(page: Page) {
  await page
    .context()
    .route("https://vpn.trx-pro-iptvstore.cc/live/**", (route) =>
      route.request().url().endsWith(".m3u8")
        ? route.fulfill({
            contentType: "application/vnd.apple.mpegurl",
            body: "#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2,\nsegment0.ts\n#EXT-X-ENDLIST\n",
          })
        : route.fulfill({ status: 200, contentType: "video/mp2t", body: "" }),
    );
  await page
    .context()
    .route("https://vpn.trx-pro-iptvstore.cc/xmltv.php**", (route) =>
      route.fulfill({ status: 404, body: "No full guide" }),
    );
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.includes("/meta/") ? { meta } : { metas: [meta] },
    });
  });
  await page
    .context()
    .unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page
    .context()
    .route(
      "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
      async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
          "action",
        );
        const data = !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action.endsWith("_categories")
            ? [{ category_id: "1", category_name: "News" }]
            : action === "get_short_epg"
              ? {
                  epg_listings: [
                    {
                      id: "1",
                      title: btoa("Evening news"),
                      start_timestamp: Math.floor(Date.now() / 1000) - 100,
                      stop_timestamp: Math.floor(Date.now() / 1000) + 900,
                    },
                  ],
                }
              : [
                  {
                    stream_id: 10,
                    name: "Test News",
                    category_id: "1",
                    epg_channel_id: "test.news",
                  },
                ];
        await route.fulfill({ json: data });
      },
    );
  await page.route("https://playback.example/request", async (route) => {
    const source = new URL(route.request().postDataJSON().url);
    if (
      source.hostname !== "vpn.trx-pro-iptvstore.cc" ||
      !/[\\/](?:player_api|xmltv)\.php$/i.test(source.pathname)
    )
      return route.fallback();
    if (source.pathname === "/xmltv.php")
      return route.fulfill({ status: 404, body: "No full guide" });
    const action = source.searchParams.get("action");
    const data = !action
      ? { user_info: { auth: 1, status: "Active" } }
      : action.endsWith("_categories")
        ? [{ category_id: "1", category_name: "News" }]
        : action === "get_short_epg"
          ? {
              epg_listings: [
                {
                  id: "1",
                  title: btoa("Evening news"),
                  start_timestamp: Math.floor(Date.now() / 1000) - 100,
                  stop_timestamp: Math.floor(Date.now() / 1000) + 900,
                },
              ],
            }
          : [
              {
                stream_id: 10,
                name: "Test News",
                category_id: "1",
                epg_channel_id: "test.news",
              },
            ];
    return route.fulfill({ json: data });
  });
}
async function connect(page: Page) {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page
    .getByLabel("Server address", { exact: true })
    .fill("https://vpn.trx-pro-iptvstore.cc");
  await page.getByLabel("Username", { exact: true }).fill("test-user");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Test & connect" }).click();
  await expect(
    page.getByText("Connection verified.", { exact: false }),
  ).toBeVisible();
}
async function openPlaybackOptions(page: Page) {
  const toggle = page.getByRole("button", { name: "Open playback options" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  const panel = page.getByRole("dialog", { name: "Playback options" });
  await expect(panel).toBeVisible();
  const panelBox = await panel.boundingBox();
  const viewport = page.viewportSize();
  expect(panelBox?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect(panelBox?.y ?? -1).toBeGreaterThanOrEqual(0);
  expect(
    Math.ceil((panelBox?.x ?? Infinity) + (panelBox?.width ?? Infinity)),
  ).toBeLessThanOrEqual(viewport?.width ?? 0);
  expect(
    Math.ceil((panelBox?.y ?? Infinity) + (panelBox?.height ?? Infinity)),
  ).toBeLessThanOrEqual(viewport?.height ?? 0);
  await expect
    .poll(() =>
      panel.evaluate(
        (element) => element.scrollWidth <= element.clientWidth + 1,
      ),
    )
    .toBe(true);
  return panel;
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript((release) => {
    localStorage.setItem("tiktak:established-local", "1");
    localStorage.setItem("tiktak:whats-new-seen", release);
  }, latestRelease);
  await mockSources(page);
});

test("series player offers next episode and optional auto-advance", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const item = {
      id: "tt-next-test",
      name: "Next Episode Test",
      type: "series",
      source: "addon",
      provider: "https://v3-cinemeta.strem.io",
    };
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item,
          seconds: 20,
          duration: 100,
          at: Date.now(),
          episode: {
            id: "tt-next-test:1:1",
            name: "Pilot",
            season: 1,
            episode: 1,
          },
        },
      ]),
    );
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://v3-cinemeta.strem.io",
          manifest: {
            id: "test-series",
            name: "Test series streams",
            types: ["series"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "series" }],
          },
        },
      ]),
    );
  });
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/meta/series/")) {
      await route.fulfill({
        json: {
          meta: {
            id: "tt-next-test",
            name: "Next Episode Test",
            type: "series",
            videos: [1, 2, 3].map((episode) => ({
              id: `tt-next-test:1:${episode}`,
              title: `Episode ${episode}`,
              season: 1,
              episode,
            })),
          },
        },
      });
    } else if (path.includes("/stream/series/")) {
      const episode =
        /:(\d+)\.json$/.exec(decodeURIComponent(path))?.[1] ?? "1";
      await route.fulfill({
        json: {
          streams: [
            {
              name: "1080p AAC",
              url: `https://cdn.example/episode-${episode}.mp4`,
            },
          ],
        },
      });
    } else {
      await route.fulfill({ json: { metas: [] } });
    }
  });
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/#library");
  await page
    .getByRole("button", { name: /Next Episode Test/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Resume S1 E1/ }).click();
  await expect(page.locator(".player-dialog video")).toHaveAttribute(
    "src",
    /episode-1\.mp4/,
  );
  await openPlaybackOptions(page);
  await page.getByRole("button", { name: "Play next: S1 E2" }).click();
  await expect(page.locator(".player-dialog video")).toHaveAttribute(
    "src",
    /episode-2\.mp4/,
  );
  await openPlaybackOptions(page);
  await expect(
    page.getByRole("checkbox", { name: /Auto-advance to the next episode/ }),
  ).not.toBeChecked();
  await page
    .getByRole("checkbox", { name: /Auto-advance to the next episode/ })
    .check();
  await page
    .locator(".player-dialog video")
    .evaluate((video) => video.dispatchEvent(new Event("ended")));
  await expect(page.locator(".player-dialog video")).toHaveAttribute(
    "src",
    /episode-3\.mp4/,
  );
  await expect(page.getByRole("button", { name: /Play next:/ })).toHaveCount(0);
});

test("series player shows native IntroDB skip controls without changing source", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const item = {
      id: "tt1234567",
      name: "Skip Segment Test",
      type: "series",
      source: "addon",
      provider: "https://v3-cinemeta.strem.io",
    };
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item,
          seconds: 20,
          duration: 1_800,
          at: Date.now(),
          episode: {
            id: "tt1234567:1:1",
            name: "Pilot",
            season: 1,
            episode: 1,
          },
        },
      ]),
    );
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://v3-cinemeta.strem.io",
          manifest: {
            id: "skip-test",
            name: "Skip test streams",
            types: ["series"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "series" }],
          },
        },
      ]),
    );
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ introSubmitEnabled: true }),
    );
    localStorage.setItem("tiktak:introdb-api-key", "intro-secret");
  });
  await page.unroute("https://v3-cinemeta.strem.io/**");
  let streamRequests = 0;
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/meta/series/"))
      return route.fulfill({
        json: {
          meta: {
            id: "tt1234567",
            name: "Skip Segment Test",
            type: "series",
            videos: [
              {
                id: "tt1234567:1:1",
                title: "Pilot",
                season: 1,
                episode: 1,
              },
            ],
          },
        },
      });
    if (path.includes("/stream/series/")) {
      streamRequests += 1;
      return route.fulfill({
        json: {
          streams: [
            {
              name: "1080p direct",
              url: "https://cdn.example/skip-segment.mp4",
            },
          ],
        },
      });
    }
    return route.fulfill({ json: { metas: [] } });
  });
  await page.route("https://api.introdb.app/segments**", (route) =>
    route.fulfill({
      json: {
        intro: { start_sec: 10, end_sec: 45 },
        recap: null,
        outro: { start_sec: 1_700, end_sec: 1_790 },
      },
    }),
  );
  await page.route("https://api.simkl.com/**", (route) =>
    route.fulfill({ json: [] }),
  );
  let submittedTiming: Record<string, unknown> | undefined;
  await page.route("https://api.introdb.app/submit", async (route) => {
    submittedTiming = route.request().postDataJSON();
    return route.fulfill({ status: 201, json: { ok: true } });
  });
  await page.route("https://cdn.example/skip-segment.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );

  await page.goto("/#library");
  await page
    .getByRole("button", { name: /Skip Segment Test/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Resume S1 E1/ }).click();
  const video = page.locator("dialog.tv-web-player video");
  await video.evaluate((element) => {
    Object.defineProperty(element, "duration", {
      configurable: true,
      value: 1_800,
    });
    Object.defineProperty(element, "seekable", {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 1_800 },
    });
    element.currentTime = 20;
    element.dispatchEvent(new Event("durationchange"));
    element.dispatchEvent(new Event("timeupdate"));
  });
  const skip = page.getByRole("button", { name: "Skip intro" });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(45);
  await expect(skip).toBeHidden();
  expect(streamRequests).toBe(1);
  await openPlaybackOptions(page);
  await page.getByRole("button", { name: "Submit skip timing" }).click();
  const submitDialog = page.getByRole("dialog", { name: "Submit skip timing" });
  await submitDialog.getByLabel("Start time").fill("0:10");
  await submitDialog.getByLabel("End time").fill("0:45");
  await submitDialog.getByRole("button", { name: "Submit timing" }).click();
  await expect(submitDialog).toBeHidden();
  await expect
    .poll(() => submittedTiming)
    .toMatchObject({
      imdb_id: "tt1234567",
      season: 1,
      episode: 1,
      start_sec: 10,
      end_sec: 45,
      segment_type: "intro",
    });
  expect(streamRequests).toBe(1);
});

test("series search merges year-range duplicates and fills a missing first season", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://incomplete.example",
          manifest: {
            id: "incomplete",
            name: "Incomplete catalog",
            types: ["series"],
            resources: ["catalog", "meta"],
            catalogs: [
              { id: "find", type: "series", extra: [{ name: "search" }] },
            ],
          },
        },
      ]),
    ),
  );
  await page.route("https://api.themoviedb.org/3/search/multi**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.route("https://incomplete.example/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.includes("/meta/")
        ? {
            meta: {
              id: "tt3501074",
              name: "Madam Secretary",
              type: "series",
              videos: [
                {
                  id: "tt3501074:2:1",
                  season: 2,
                  episode: 1,
                  title: "Season two",
                },
              ],
            },
          }
        : {
            metas: ["2014", "2014–2019"].map((releaseInfo) => ({
              id: "tt3501074",
              name: "Madam Secretary",
              type: "series",
              releaseInfo,
            })),
          },
    });
  });
  await page.route(
    "https://v3-cinemeta.strem.io/meta/series/tt3501074.json",
    (route) =>
      route.fulfill({
        json: {
          meta: {
            id: "tt3501074",
            name: "Madam Secretary",
            type: "series",
            videos: [
              { id: "tt3501074:1:1", season: 1, episode: 1, title: "Pilot" },
              {
                id: "tt3501074:2:1",
                season: 2,
                episode: 1,
                title: "Season two",
              },
            ],
          },
        },
      }),
  );
  await page.goto("/#discover");
  await page.getByRole("button", { name: "Series" }).click();
  await page.getByLabel("Search titles or channels").fill("Madam Secretary");
  await expect(page.locator(".media-card")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.locator(".media-card strong").first()).toHaveText(
    "Madam Secretary",
  );
  await expect(page.getByText("1 titles")).toBeVisible();
  await page.locator(".media-card").click();
  await expect(page.getByRole("combobox", { name: "Season" })).toHaveValue("1");
  await expect(page.getByRole("button", { name: /Pilot/ })).toBeVisible();
});

test("a new release shows once and links to the complete change history", async ({
  page,
}) => {
  await page.addInitScript(
    (previousRelease) =>
      localStorage.setItem("tiktak:whats-new-seen", previousRelease),
    releases[1].version,
  );
  await page.goto("/#home");
  const update = page.getByRole("dialog", {
    name: releases[0].title,
  });
  await expect(update).toBeVisible({ timeout: 4_000 });
  await update.getByRole("button", { name: "View all changes" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: releases[0].title,
    }),
  ).toBeVisible({ timeout: 15_000 });
  await page.reload();
  await expect(update).toBeHidden();
});

test("YouTube and YouTube Music are remote-friendly inside TikTak TV", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item: {
            id: "youtube:dQw4w9WgXcQ",
            name: "youtube:dQw4w9WgXcQ",
            type: "movie",
            source: "addon",
          },
          seconds: 47,
          duration: 300,
          at: Date.now(),
        },
      ]),
    ),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "tiktak:youtube-history",
      JSON.stringify([{ videoId: "dQw4w9WgXcQ", title: "Recently watched" }]),
    ),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({ url: "https://playback.example", token: "test-key" }),
    ),
  );
  await page.addInitScript(() => {
    class MockYouTubePlayer {
      private time = 0;
      private muted = false;
      private playing = false;
      private options: any;
      private videoId: string;
      private iframe: HTMLIFrameElement;
      constructor(target: HTMLElement, options: any) {
        this.options = options;
        this.videoId = options.videoId;
        this.iframe = document.createElement("iframe");
        target.replaceWith(this.iframe);
        (window as any).__playedYouTubeVideoId = options.videoId;
        ((window as any).__youtubePlayers ??= []).push(this);
        queueMicrotask(() => options.events.onReady({ target: this }));
      }
      destroy() {
        this.iframe.remove();
      }
      getCurrentTime() {
        return this.time;
      }
      getDuration() {
        return 300;
      }
      getIframe() {
        return this.iframe;
      }
      getPlayerState() {
        return this.playing ? 1 : 2;
      }
      getVideoData() {
        return {
          video_id: this.videoId,
          title: "Test video",
          author: "Test channel",
        };
      }
      isMuted() {
        return this.muted;
      }
      mute() {
        this.muted = true;
      }
      nextVideo() {
        (window as any).__youtubePlaylistAdvanced = true;
      }
      pauseVideo() {
        this.playing = false;
        this.options.events.onStateChange({ data: 2, target: this });
      }
      playVideo() {
        this.playing = true;
        (window as any).__youtubePlayerStarted = true;
        this.options.events.onStateChange({ data: 1, target: this });
      }
      seekTo(value: number) {
        this.time = value;
      }
      unMute() {
        this.muted = false;
      }
      fail(code: number) {
        this.options.events.onError({ data: code, target: this });
      }
      end() {
        this.playing = false;
        this.options.events.onStateChange({ data: 0, target: this });
      }
    }
    (window as any).YT = {
      Player: MockYouTubePlayer,
      PlayerState: { ENDED: 0, PLAYING: 1 },
    };
  });
  await page.route("https://api.tiktaktv.me/sponsorblock", (route) =>
    route.fulfill({ json: { segments: [] } }),
  );
  await page.route("https://playback.example/youtube/account", (route) => {
    const refresh = route.request().postDataJSON()?.refresh === true;
    return route.fulfill({
      json: {
        configured: true,
        connected: true,
        channel: { title: "Test viewer" },
        videoFeed: [
          {
            videoId: "dQw4w9WgXcQ",
            title: refresh ? "Fresh recommendation" : "Account recommendation",
            channel: "Test channel",
            thumbnail: "https://img.example/recommendation.jpg",
            kind: "video",
          },
          ...Array.from({ length: 29 }, (_, index) => ({
            videoId: String(index + 1).padStart(11, "0"),
            title: `More video ${index + 1}`,
            channel: "Another channel",
            thumbnail: "https://img.example/more-video.jpg",
            kind: "video",
          })),
        ],
        recentFeed: [
          {
            videoId: "aqz-KE-bpKQ",
            title: "From recently watched channel",
            channel: "Recent channel",
            kind: "video",
          },
        ],
        musicFeed: [
          {
            videoId: "M7lc1UVf-VE",
            title: "Account song",
            channel: "Test artist",
            thumbnail: "https://img.example/song.jpg",
            kind: "music",
          },
          {
            videoId: "5qap5aO4i9A",
            title: "Second account song",
            channel: "Second artist",
            thumbnail: "https://img.example/second-song.jpg",
            kind: "music",
          },
        ],
        playlists: [
          {
            playlistId: "PL1234567890",
            videoId: "dQw4w9WgXcQ",
            title: "Saved playlist",
            itemCount: 12,
            kind: "video",
          },
          {
            playlistId: "PL0987654321",
            videoId: "M7lc1UVf-VE",
            title: "Saved music playlist",
            itemCount: 8,
            kind: "music",
          },
        ],
        subscriptions: [{ id: "channel-1", title: "Subscribed channel" }],
        subscriptionFeed: [
          {
            videoId: "aqz-KE-bpKQ",
            title: "Subscription upload",
            channel: "Subscribed channel",
            kind: "video",
          },
        ],
        historyFeed: [
          {
            videoId: "dQw4w9WgXcQ",
            title: "Previously watched",
            channel: "History channel",
            kind: "video",
          },
        ],
      },
    });
  });
  await page.route("https://playback.example/youtube/search", async (route) => {
    const body = route.request().postDataJSON() as {
      kind?: string;
      channelId?: string;
    };
    await route.fulfill({
      json: {
        results: body.channelId
          ? [
              {
                videoId: "aqz-KE-bpKQ",
                title: "Newest subscription video",
                channel: "Subscribed channel",
                thumbnail: "https://img.example/subscription.jpg",
                kind: "video",
              },
            ]
          : body.kind === "music"
            ? [
                {
                  videoId: "M7lc1UVf-VE",
                  title: "Music result",
                  channel: "Test artist",
                  thumbnail: "https://img.example/music-result.jpg",
                  kind: "music",
                },
              ]
            : [
                {
                  videoId: "aqz-KE-bpKQ",
                  title: "Video result",
                  channel: "Test channel",
                  thumbnail: "https://img.example/video-result.jpg",
                  kind: "video",
                },
              ],
      },
    });
  });
  await page.route("https://playback.example/youtube/playlist", (route) =>
    route.fulfill({
      json: {
        selection: {
          playlistId: "PL1234567890",
          videoId: "dQw4w9WgXcQ",
          title: "Saved playlist",
          kind: "video",
        },
      },
    }),
  );
  await page.route("https://playback.example/youtube/playback", (route) =>
    route.request().postDataJSON()?.kind === "video"
      ? route.fulfill({
          json: {
            playback: {
              type: "progressive",
              url: "/media/test/stream",
              mimeType: "video/mp4",
            },
          },
        })
      : route.fulfill({ status: 404, json: { error: "No compatible stream" } }),
  );
  await page.route("https://playback.example/sponsorblock", (route) =>
    route.fulfill({ json: { segments: [] } }),
  );
  await page.route("https://img.example/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#30213f"/><circle cx="320" cy="180" r="60" fill="#9b5cff"/><path d="M304 146v68l55-34z" fill="white"/></svg>',
    }),
  );
  await page.goto("/#youtube");
  const updateDialog = page.getByRole("dialog", {
    name: /YouTube discovery and library/,
  });
  await updateDialog
    .waitFor({ state: "visible", timeout: 3_000 })
    .catch(() => {});
  if (await updateDialog.isVisible())
    await updateDialog.getByRole("button", { name: "Dismiss update" }).click();
  await expect(
    page.getByRole("heading", { name: "YouTube", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Test viewer", { exact: true })).toBeVisible();
  await expect(page.getByText("Account recommendation")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Related uploads from channels you watched",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "For You", exact: true }),
  ).toBeVisible();
  const youtubeHeadings = await page
    .locator(".youtube-section h2")
    .allTextContents();
  expect(youtubeHeadings.indexOf("For You")).toBeLessThan(
    youtubeHeadings.indexOf("Related uploads from channels you watched"),
  );
  if (testInfo.project.name === "iphone")
    await page.screenshot({
      path: "tests/visual/youtube-for-you-mobile-after.png",
    });
  await expect(page.getByText("More video 29")).toHaveCount(0);
  await page.getByRole("button", { name: "Show more videos" }).click();
  await expect(page.getByText("More video 29")).toBeVisible();
  await page.getByRole("button", { name: "Refresh suggestions" }).click();
  await expect(page.getByText("Fresh recommendation")).toBeVisible();
  const sections = page.getByRole("navigation", { name: "YouTube sections" });
  await sections.getByRole("button", { name: "My Playlists" }).click();
  await expect(page.getByText("Saved playlist")).toBeVisible();
  await expect(page.getByText("Fresh recommendation")).toBeHidden();
  await sections.getByRole("button", { name: "History" }).click();
  await expect(page.getByText("Previously watched")).toBeVisible();
  await sections.getByRole("button", { name: "Subscriptions" }).click();
  await expect(
    page.getByLabel("Search videos from Subscribed channel"),
  ).toBeVisible();
  await expect(page.getByText("Subscription upload")).toBeVisible();
  await page.getByLabel("Search videos from Subscribed channel").click();
  await expect(
    page.getByRole("heading", { name: "Latest from Subscribed channel" }),
  ).toBeVisible();
  await expect(page.getByText("Newest subscription video")).toBeVisible();
  await page
    .getByLabel("Search YouTube or paste a link")
    .fill("plane crash in florida");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Video search results" }),
  ).toBeVisible();
  await page.getByText("Video result", { exact: true }).click();
  await expect(page.locator(".youtube-player-card")).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => (window as any).__playedYouTubeVideoId))
    .toBe("aqz-KE-bpKQ");
  await expect
    .poll(() => page.evaluate(() => (window as any).__youtubePlayerStarted))
    .toBe(true);
  await expect(
    page
      .locator(".youtube-player-card")
      .getByText("Video result", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const players = (window as any).__youtubePlayers;
    players[players.length - 1].fail(150);
  });
  await expect(page.locator(".youtube-direct-player")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Let’s try that again." }),
  ).toBeHidden();
  await page.getByRole("tab", { name: "Music" }).click();
  await expect(
    page.getByRole("heading", { name: "YouTube Music" }),
  ).toBeVisible();
  await expect(page.getByText("Account song", { exact: true })).toBeVisible();
  await expect(page.getByText("Saved music playlist")).toBeVisible();
  await expect(page.getByText("Account recommendation")).toBeHidden();
  await page
    .getByLabel("Search YouTube or paste a link")
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByLabel("YouTube playback controls")).toBeVisible();
  await expect(page.getByLabel("Fast forward 10 seconds")).toBeVisible();
  await expect(page.getByText("Skip SponsorBlock segments")).toBeVisible();
  await page.getByText("Choose what to skip").click();
  await expect(page.getByLabel("Sponsors")).toBeChecked();
  await page.getByLabel("Self-promotion").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Self-promotion")).toBeInViewport();
  await page.getByLabel("Interaction reminders").scrollIntoViewIfNeeded();
  await expect(page.getByLabel("Interaction reminders")).toBeInViewport();
  await page.getByLabel("Introductions").uncheck();
  await expect(page.getByLabel("Introductions")).not.toBeChecked();

  await page.evaluate(() => {
    const players = (window as any).__youtubePlayers;
    players[players.length - 1].fail(150);
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__playedYouTubeVideoId))
    .toBe("M7lc1UVf-VE");
  await expect(
    page.getByText("This upload is unavailable in embedded players", {
      exact: false,
    }),
  ).toBeHidden();
  const autoplay = page.getByLabel("Autoplay next YouTube item");
  await expect(autoplay).toBeChecked();
  await autoplay.evaluate((input: HTMLInputElement) => input.click());
  await expect(autoplay).not.toBeChecked();
  await page.evaluate(() => {
    const players = (window as any).__youtubePlayers;
    players[players.length - 1].end();
  });
  await page.waitForTimeout(800);
  await expect
    .poll(() => page.evaluate(() => (window as any).__playedYouTubeVideoId))
    .toBe("M7lc1UVf-VE");
  await autoplay.evaluate((input: HTMLInputElement) => input.click());
  await expect(autoplay).toBeChecked();
  await page.evaluate(() => {
    const players = (window as any).__youtubePlayers;
    players[players.length - 1].end();
  });
  await expect
    .poll(() => page.evaluate(() => (window as any).__playedYouTubeVideoId))
    .toBe("5qap5aO4i9A");

  await page.goto("/?tv=1#youtube");
  await page.getByText("Account recommendation", { exact: true }).click();
  const tvPlayer = page.locator("dialog.tv-youtube-player");
  await expect(tvPlayer).toBeVisible();
  const tvPlayerBox = await tvPlayer.boundingBox();
  const viewport = page.viewportSize();
  expect(tvPlayerBox?.x).toBe(0);
  expect(tvPlayerBox?.y).toBe(0);
  expect(Math.round(tvPlayerBox?.width ?? 0)).toBe(viewport?.width);
  expect(Math.round(tvPlayerBox?.height ?? 0)).toBe(viewport?.height);
  if (testInfo.project.name === "desktop") {
    await expect(tvPlayer).not.toHaveClass(/controls-hidden/);
    await page.waitForTimeout(3700);
    await expect(tvPlayer).toHaveClass(/controls-hidden/);
    await page.keyboard.press("ArrowRight");
    await expect(tvPlayer).not.toHaveClass(/controls-hidden/);
  }
  await page.keyboard.press("Escape");
  await expect(tvPlayer).toBeHidden();

  await page.goto("/#home");
  const continueSection = page.locator(".media-row", {
    has: page.getByRole("heading", { name: "Pick up where you left off" }),
  });
  await expect(
    continueSection.locator(".media-card strong").first(),
  ).not.toHaveText("youtube:dQw4w9WgXcQ");
  await continueSection.locator(".media-card").first().click();
  await expect(page).toHaveURL(/#youtube$/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const players = (window as any).__youtubePlayers;
        return players?.[players.length - 1]?.getCurrentTime();
      }),
    )
    .toBe(47);
  await page.evaluate(() => {
    const players = (window as any).__youtubePlayers;
    players[players.length - 1].seekTo(90);
  });
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("nuvio:progress") ?? "[]").find(
            (entry: any) => entry.item.id === "youtube:dQw4w9WgXcQ",
          )?.seconds,
      ),
    )
    .toBe(90);
});

test("SponsorBlock category choices persist in Playback settings", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Playback/ }).click();
  await expect(
    page.getByRole("heading", { name: "YouTube playback" }),
  ).toBeVisible();
  await page.getByLabel("Autoplay next YouTube item").uncheck();
  await page.getByLabel("Self-promotion").uncheck();
  await page.getByLabel("Enable SponsorBlock skipping").uncheck();
  await page.reload();
  await page.getByRole("button", { name: /Playback/ }).click();
  await expect(page.getByLabel("Autoplay next YouTube item")).not.toBeChecked();
  await expect(page.getByLabel("Self-promotion")).not.toBeChecked();
  await expect(
    page.getByLabel("Enable SponsorBlock skipping"),
  ).not.toBeChecked();
});

test("TV YouTube player can hand a video to the optional SmartTube app", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (
      window as Window & {
        openedSmartTube?: string;
        TikTakTV?: { openSmartTube(id: string): void };
      }
    ).TikTakTV = {
      openSmartTube(id: string) {
        (window as Window & { openedSmartTube?: string }).openedSmartTube = id;
      },
    };
  });
  await page.goto("/?tv=1#youtube");
  await page
    .getByLabel("Search YouTube or paste a link")
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("button", { name: "Open in SmartTube" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { openedSmartTube?: string }).openedSmartTube,
      ),
    )
    .toBe("dQw4w9WgXcQ");
});

test("first visit offers TikTakTV sign in and account creation", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("tiktak:established-local"),
  );
  await page.goto("/#home");
  await expect(
    page.getByRole("heading", { name: "Your entertainment, your way" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  await expect(
    page.getByText(/starts with TikTakTV Catalog Addon.*OpenSubtitles v3/),
  ).toBeVisible();
});
test("landing showcase rotates automatically and manual selection stays longer", async ({
  page,
}) => {
  await page.clock.install();
  await page.addInitScript(() =>
    localStorage.removeItem("tiktak:established-local"),
  );
  await page.goto("/#home");
  const viewport = page.viewportSize();
  const gateBounds = await page.locator(".profile-gate").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, width: bounds.width };
  });
  expect(Math.abs(gateBounds.left)).toBeLessThan(1);
  expect(
    Math.abs(gateBounds.width - (viewport?.width ?? gateBounds.width)),
  ).toBeLessThan(1);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  if ((page.viewportSize()?.width ?? 0) <= 900) {
    await expect(page.locator(".profile-gate-preview")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Your entertainment, your way" }),
    ).toBeInViewport();
    return;
  }
  const preview = page.locator(".profile-preview-window img");
  const home = page.getByRole("tab", { name: "Movies & series" });
  const live = page.getByRole("tab", { name: "Live TV & guide" });
  const sports = page.getByRole("tab", { name: "Sports & scores" });
  await expect(home).toHaveAttribute("aria-selected", "true");
  await expect(preview).toHaveAttribute("src", "/showcase/home.png");
  await page.clock.fastForward(5_850);
  await expect(live).toHaveAttribute("aria-selected", "true");
  await expect(preview).toHaveAttribute("src", "/showcase/live.png");
  await sports.click();
  await expect(preview).toHaveAttribute("src", "/showcase/sports.png");
  await page.clock.fastForward(11_500);
  await expect(sports).toHaveAttribute("aria-selected", "true");
  await page
    .getByRole("heading", { name: "Your entertainment, your way" })
    .click();
  await page.clock.fastForward(700);
  await page.waitForTimeout(0);
  await page.clock.fastForward(6_600);
  await expect(home).toHaveAttribute("aria-selected", "true");
});
test("TV sign-in and account creation remain inside a 720p viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() =>
    localStorage.removeItem("tiktak:established-local"),
  );
  await page.goto("/?tv=1#home");
  const card = page.locator(".profile-auth-card");
  await expect(card).toBeVisible();
  await expect(card).toBeInViewport();
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Confirm password")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Create free account" }),
  ).toBeInViewport();
});

test("desktop account creation keeps every required action reachable at laptop height", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "Desktop viewport contract.");
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.addInitScript(() =>
    localStorage.removeItem("tiktak:established-local"),
  );
  await page.goto("/#home");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Profile name")).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Create free account" }),
  ).toBeInViewport();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    )
    .toBe(true);
});

test("TV onboarding traps remote focus and keeps its controls visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1152, height: 648 });
  await page.goto("/?tv=1#home");
  await page.evaluate(() => {
    const background = document.createElement("button");
    background.id = "behind-modal";
    background.textContent = "Behind modal";
    document.body.append(background);
    const backdrop = document.createElement("div");
    backdrop.className = "setup-wizard-backdrop";
    backdrop.innerHTML = `
      <section class="setup-wizard" role="dialog" aria-modal="true" aria-label="Health check">
        <div class="setup-progress">${"<span></span>".repeat(5)}</div>
        <div class="setup-wizard-body" tabindex="0">
          <h1>Let's make sure you're ready</h1>
          <div class="setup-checks">${"<div><span><strong>Ready</strong><small>Health check detail</small></span></div>".repeat(12)}</div>
        </div>
        <footer>
          <button>Review settings</button>
          <button class="primary" data-tv-initial-focus>Continue</button>
        </footer>
      </section>`;
    document.body.append(backdrop);
  });
  const wizard = page.getByRole("dialog", { name: "Health check" });
  const next = wizard.getByRole("button", { name: "Continue" });
  await expect(wizard).toBeInViewport();
  await expect(next).toBeInViewport();
  await expect(next).toBeFocused();
  const scrollBefore = await page.evaluate(() => scrollY);
  await page.keyboard.press("ArrowDown");
  await expect(next).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  const body = wizard.locator(".setup-wizard-body");
  await body.focus();
  await body.evaluate((element) => (element.scrollTop = 0));
  const bodyScrollBefore = await body.evaluate((element) => element.scrollTop);
  await page.keyboard.press("ArrowDown");
  await expect
    .poll(() => body.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(bodyScrollBefore);
  await body.evaluate(
    (element) =>
      (element.scrollTop = element.scrollHeight - element.clientHeight),
  );
  await page.keyboard.press("ArrowDown");
  await expect(
    wizard.getByRole("button", { name: "Review settings" }),
  ).toBeFocused();
  await expect(page.locator("#behind-modal")).not.toBeFocused();
});

test("TV remote scrolls long pages and Discover uses ten-foot spacing", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?tv=1#discover");
  await expect(page.locator("html")).toHaveClass(/tv-mode/);
  const columns = await page
    .locator(".media-grid")
    .evaluate(
      (grid) =>
        getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    );
  expect(columns).toBeLessThanOrEqual(5);
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "1600px";
    const last = document.createElement("button");
    last.textContent = "Last TV control";
    spacer.append(last);
    document.querySelector(".main-shell")?.append(spacer);
    document.querySelector<HTMLElement>(".filter-toolbar button")?.focus();
  });
  const before = await page.evaluate(() => scrollY);
  for (let index = 0; index < 6; index++)
    await page.keyboard.press("ArrowDown");
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before);
});

test("TV sidebar expands for remote focus and the decorative brand is not a target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?tv=1#home");
  await expect(page.locator("html")).toHaveClass(/tv-mode/);
  await page.locator(".hero button").first().focus();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((sidebar) =>
          Math.round(sidebar.getBoundingClientRect().width),
        ),
    )
    .toBeLessThanOrEqual(88);
  const layout = await page.locator(".sidebar").evaluate((sidebar) => {
    const brand = sidebar.querySelector<HTMLElement>(".brand")!;
    const home = sidebar.querySelector<HTMLElement>("nav a")!;
    const main = document.querySelector<HTMLElement>(".main-shell")!;
    return {
      sidebarWidth: sidebar.getBoundingClientRect().width,
      mainLeft: main.getBoundingClientRect().left,
      brandTag: brand.tagName,
      brandWidth: brand.getBoundingClientRect().width,
      homeHeight: home.getBoundingClientRect().height,
      homeFontSize: Number.parseFloat(getComputedStyle(home).fontSize),
    };
  });
  expect(layout.sidebarWidth).toBeGreaterThanOrEqual(82);
  expect(layout.sidebarWidth).toBeLessThanOrEqual(88);
  expect(layout.mainLeft).toBeGreaterThanOrEqual(layout.sidebarWidth - 1);
  expect(layout.brandTag).toBe("DIV");
  expect(layout.brandWidth).toBeLessThan(layout.sidebarWidth);
  expect(layout.homeHeight).toBeGreaterThanOrEqual(58);
  expect(layout.homeFontSize).toBeGreaterThanOrEqual(16);
  await page.locator(".sidebar nav a").first().focus();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((sidebar) =>
          Math.round(sidebar.getBoundingClientRect().width),
        ),
    )
    .toBeGreaterThanOrEqual(220);
  await expect(page.getByRole("link", { name: /TikTak TV home/i })).toHaveCount(
    0,
  );
});

test("desktop widths use the compact TikTakTV navigation rail", async ({
  page,
}, testInfo) => {
  test.skip(
    ["iphone", "ipad"].includes(testInfo.project.name),
    "Desktop navigation is covered here; device projects validate the mobile shell separately.",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#home");

  const readLayout = () =>
    page.evaluate(() => {
      const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
      const main = document.querySelector<HTMLElement>(".main-shell")!;
      const links = [...sidebar.querySelectorAll<HTMLElement>("nav a")];
      return {
        sidebar: Math.round(sidebar.getBoundingClientRect().width),
        mainLeft: Math.round(main.getBoundingClientRect().left),
        labels: links.map((link) => link.textContent?.trim()),
        clippedLabels: links.filter(
          (link) => link.scrollWidth > link.clientWidth + 1,
        ).length,
      };
    });

  await expect(page.locator(".sidebar")).toBeVisible();
  let layout = await readLayout();
  expect(layout.sidebar).toBe(92);
  expect(layout.mainLeft).toBe(92);
  expect(layout.clippedLabels).toBe(0);
  expect(layout.labels).toEqual([
    "Home",
    "Discover",
    "Live TV",
    "YouTube",
    "My library",
    "Account",
  ]);

  await page.setViewportSize({ width: 1024, height: 768 });
  layout = await readLayout();
  expect(layout.sidebar).toBe(92);
  expect(layout.mainLeft).toBe(92);
  expect(layout.clippedLabels).toBe(0);
  await expect(page.locator(".bottom-nav")).toBeHidden();
});

test("Fire TV viewport keeps the navigation compact and content readable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/?tv=1#home");
  await expect(page.locator(".sidebar")).toBeVisible();
  await expect(page.locator(".hero")).toBeVisible();
  await page.locator(".hero button").first().focus();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((sidebar) =>
          Math.round(sidebar.getBoundingClientRect().width),
        ),
    )
    .toBeLessThanOrEqual(76);
  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
    const main = document.querySelector<HTMLElement>(".main-shell")!;
    const hero = document.querySelector<HTMLElement>(".hero")!;
    const links = [...sidebar.querySelectorAll<HTMLElement>("nav a")];
    return {
      sidebar: sidebar.getBoundingClientRect().width,
      mainLeft: main.getBoundingClientRect().left,
      heroHeight: hero.getBoundingClientRect().height,
      labels: links.map((link) => link.textContent?.trim()),
      lastLinkBottom: links.at(-1)?.getBoundingClientRect().bottom ?? Infinity,
    };
  });
  expect(layout.sidebar).toBeGreaterThanOrEqual(70);
  expect(layout.sidebar).toBeLessThanOrEqual(76);
  expect(layout.mainLeft).toBe(layout.sidebar);
  expect(layout.heroHeight).toBeLessThanOrEqual(365);
  expect(layout.labels).toEqual([
    "Home",
    "Discover",
    "Live TV",
    "YouTube",
    "My library",
    "Account",
  ]);
  expect(layout.lastLinkBottom).toBeLessThan(510);

  await page.goto("/?tv=1#discover");
  await expect(page.locator(".media-grid")).toBeVisible();
  const columns = await page
    .locator(".media-grid")
    .evaluate(
      (grid) =>
        getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean)
          .length,
    );
  expect(columns).toBeGreaterThanOrEqual(4);
});

test("TV shell does not install the offline website service worker", async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Chromium owns the service-worker check.",
  );
  await page.goto("/?tv=1#home");
  await expect(page.locator("html")).toHaveClass(/tv-mode/);
  await expect
    .poll(() =>
      page.evaluate(
        async () => (await navigator.serviceWorker.getRegistrations()).length,
      ),
    )
    .toBe(0);
});

test("an open app reloads itself when a deployment replaces its chunks", async ({
  page,
}) => {
  await page.goto("/?tv=1#home");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("vite:preloadError", { cancelable: true })),
  );
  await expect
    .poll(() => new URL(page.url()).searchParams.has("release"))
    .toBe(true);
});

test("TV remote keeps horizontal movement in the current row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/?tv=1#home");
  await page.evaluate(() => {
    const modal = document.createElement("section");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Remote navigation test");
    modal.style.cssText =
      "position:fixed;inset:80px;background:#111;z-index:9999;padding:30px";
    modal.innerHTML = `
      <button id="row-start" style="position:absolute;left:40px;top:40px">Start</button>
      <button id="row-right" style="position:absolute;left:340px;top:40px">Right</button>
      <button id="near-diagonal" style="position:absolute;left:140px;top:180px">Diagonal</button>`;
    document.body.append(modal);
    document.querySelector<HTMLElement>("#row-start")?.focus();
  });
  await expect(page.locator("#row-start")).toBeFocused();
  await expect(page.locator("#row-right")).toBeVisible();
  await page.waitForTimeout(50);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#row-right")).toBeFocused();
  await expect(page.locator("#near-diagonal")).not.toBeFocused();
});

test("TV live guide uses ten-foot rows and moves between channels by remote", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
      }),
    ),
  );
  await connect(page);
  await page.goto("/?tv=1#live");
  const rows = page.locator(".tv-guide-row");
  await expect(rows.first()).toContainText("Evening news", { timeout: 15_000 });
  const dimensions = await rows.first().evaluate((row) => {
    const channel = row.querySelector<HTMLElement>(".tv-guide-channel")!;
    const art = row.querySelector<HTMLElement>(".tv-guide-channel-art")!;
    return {
      rowHeight: row.getBoundingClientRect().height,
      channelWidth: channel.getBoundingClientRect().width,
      artWidth: art.getBoundingClientRect().width,
    };
  });
  expect(dimensions.rowHeight).toBeGreaterThanOrEqual(96);
  expect(dimensions.channelWidth).toBeGreaterThanOrEqual(260);
  expect(dimensions.artWidth).toBeGreaterThanOrEqual(54);
  await rows.first().evaluate((row) => {
    const copy = row.cloneNode(true) as HTMLElement;
    copy.querySelector("strong")!.textContent = "Second Test Channel";
    row.after(copy);
  });
  const first = rows.nth(0).locator(".tv-guide-channel");
  const second = rows.nth(1).locator(".tv-guide-channel");
  await first.focus();
  await expect(first).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeFocused();
});

test("narrow TV WebViews leave useful room for programme cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 699, height: 780 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
      }),
    ),
  );
  await connect(page);
  await page.goto("/?tv=1#live");
  await expect(page.locator(".tv-guide-row").first()).toContainText(
    "Evening news",
    {
      timeout: 15_000,
    },
  );
  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector<HTMLElement>(".sidebar")!;
    const grid = document.querySelector<HTMLElement>(".tv-guide-grid")!;
    const channel = document.querySelector<HTMLElement>(".tv-guide-channel")!;
    return {
      sidebar: sidebar.getBoundingClientRect().width,
      grid: grid.getBoundingClientRect().width,
      channel: channel.getBoundingClientRect().width,
    };
  });
  expect(layout.sidebar).toBeLessThanOrEqual(150);
  expect(layout.grid).toBeGreaterThanOrEqual(480);
  expect(layout.channel).toBeLessThanOrEqual(210);
  expect(layout.grid - layout.channel).toBeGreaterThanOrEqual(270);
});
test("a clean profile starts without another user's IPTV connection", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await expect(page.getByLabel("Server address", { exact: true })).toHaveValue(
    "",
  );
  await expect(page.getByText("My IPTV", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Username", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
});

test("offline app shell retains library and never caches provider requests", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== "chromium",
    "Service-worker caching is checked in Chromium; device playback is a separate check.",
  );
  await page.goto("/#library");
  await page.evaluate(() =>
    localStorage.setItem(
      "nuvio:library",
      JSON.stringify([
        {
          id: "offline",
          name: "Offline favorite",
          type: "movie",
          source: "addon",
          provider: "https://v3-cinemeta.strem.io",
        },
      ]),
    ),
  );
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect(page.locator(".media-card strong")).toHaveText(
    "Offline favorite",
  );
  const cached = await page.evaluate(async () =>
    (
      await Promise.all(
        (await caches.keys()).map(async (name) =>
          (await (await caches.open(name)).keys()).map((r) => r.url),
        ),
      )
    ).flat(),
  );
  expect(
    cached.every((url) => new URL(url).origin === "http://127.0.0.1:4173"),
  ).toBe(true);
  expect(
    cached.some(
      (url) => url.includes("hls-") || url.includes("player_api.php"),
    ),
  ).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".media-card strong")).toHaveText(
    "Offline favorite",
  );
  await expect(page.locator(".banner")).toContainText("offline");
});
test("discovery, library persistence, accessible modal and mobile layout", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "My library", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "In my library" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sources", exact: true }).click();
  await expect(
    page.getByText("No streams found. Try another source."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close details" }).click();
  await page.goto("/#library");
  await expect(
    page
      .locator(".media-card strong")
      .filter({ hasText: "The Test Movie" })
      .first(),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});
test("home Random Pick opens a title from the loaded catalogs", async ({
  page,
}) => {
  await page.goto("/#home");
  await page.getByRole("button", { name: "Random Pick" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("The Test Movie");
});
test("home featured gallery advances and its controls change the title", async ({
  page,
}) => {
  const first = {
    ...meta,
    id: "tt-first",
    name: "First Feature",
    background: "https://images.example/first.jpg",
  };
  const second = {
    ...meta,
    id: "tt-second",
    name: "Second Feature",
    background: "https://images.example/second.jpg",
  };
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.includes("/meta/")
        ? { meta: first }
        : { metas: [first, second] },
    });
  });
  await page.goto("/#home");
  await expect(page.locator(".hero h1")).toHaveText("First Feature");
  await page.getByRole("button", { name: "Next featured title" }).click();
  await expect(page.locator(".hero h1")).toHaveText("Second Feature");
  await page.getByRole("button", { name: "Previous featured title" }).click();
  await expect(page.locator(".hero h1")).toHaveText("First Feature");
});
test("Discover Random Pick opens a title from the active results", async ({
  page,
}) => {
  await page.goto("/#discover");
  await expect(
    page.locator(".media-card strong").filter({ hasText: "The Test Movie" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Random Pick" }).click();
  await expect(page.getByRole("dialog")).toContainText("The Test Movie");
});
test("a title can be removed from watch history", async ({ page }) => {
  await page.addInitScript(
    (item) => {
      localStorage.setItem(
        "nuvio:progress",
        JSON.stringify([
          {
            item,
            seconds: 300,
            duration: 1800,
            at: Date.now(),
          },
        ]),
      );
    },
    {
      id: meta.id,
      name: meta.name,
      type: meta.type,
      source: "addon",
      provider: "https://v3-cinemeta.strem.io",
      description: meta.description,
      year: meta.year,
    },
  );
  await page.goto("/#home");
  const continueSection = page.locator(".media-row", {
    has: page.getByRole("heading", { name: "Pick up where you left off" }),
  });
  await continueSection
    .locator(".media-card strong", { hasText: "The Test Movie" })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove from watch history" })
    .click();
  await expect(
    page.getByRole("button", { name: "Remove from watch history" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("nuvio:progress")!),
    ),
  ).toEqual([]);
});
test("Friends resume history shows watched icons on earlier episodes", async ({
  page,
}) => {
  const friends = {
    id: "tt0108778",
    name: "Friends",
    type: "series",
    description: "Six friends living in Manhattan.",
    videos: [
      {
        id: "tt0108778:1:1",
        title: "The One Where Monica Gets a Roommate",
        season: 1,
        episode: 1,
      },
      {
        id: "tt0108778:1:2",
        title: "The One with the Sonogram at the End",
        season: 1,
        episode: 2,
      },
      {
        id: "tt0108778:1:3",
        title: "The One with the Thumb",
        season: 1,
        episode: 3,
      },
    ],
  };
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item: {
            id: "tt0108778",
            name: "Friends",
            type: "series",
            source: "addon",
            provider: "https://v3-cinemeta.strem.io",
          },
          seconds: 300,
          duration: 1800,
          at: Date.now(),
          episode: {
            id: "tt0108778:1:3",
            name: "The One with the Thumb",
            season: 1,
            episode: 3,
          },
        },
      ]),
    );
  });
  await page.unroute("https://v3-cinemeta.strem.io/**");
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.includes("/meta/") ? { meta: friends } : { metas: [friends] },
    });
  });
  await page.goto("/#home");
  await page
    .locator(".media-card strong", { hasText: "Friends" })
    .first()
    .click();
  await expect(
    page.getByRole("button", {
      name: /1 The One Where Monica Gets a Roommate Watched/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /2 The One with the Sonogram at the End Watched/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /3 The One with the Thumb/,
    }),
  ).not.toContainText("Watched");
  await page
    .getByRole("button", {
      name: "Mark episode 3 watched",
    })
    .click();
  await expect(
    page.getByRole("button", {
      name: /3 The One with the Thumb Watched/,
    }),
  ).toBeVisible();
});
test("Friends resume preserves provider order when a regex matches multiple streams", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const item = {
      id: "tt0108778",
      name: "Friends",
      type: "series",
      source: "addon",
      provider: "https://v3-cinemeta.strem.io",
    };
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://v3-cinemeta.strem.io",
          manifest: {
            id: "debridio-test",
            name: "Debridio",
            types: ["series"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "series" }],
          },
        },
      ]),
    );
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item,
          seconds: 300,
          duration: 1800,
          at: Date.now(),
          episode: {
            id: "tt0108778:1:3",
            name: "The One with the Thumb",
            season: 1,
            episode: 3,
          },
        },
      ]),
    );
    localStorage.setItem(
      "tiktak:stream-preferences",
      JSON.stringify({
        autoPlayMode: "regex",
        autoPlayRegex: "Debridio (2160p|4k|1440p|1080p|720p)",
        updatedAt: Date.now(),
      }),
    );
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  const friends = {
    id: "tt0108778",
    name: "Friends",
    type: "series",
    description: "Six friends living in Manhattan.",
    videos: [
      {
        id: "tt0108778:1:3",
        title: "The One with the Thumb",
        season: 1,
        episode: 3,
      },
    ],
  };
  await page.unroute("https://v3-cinemeta.strem.io/**");
  await page.route("https://v3-cinemeta.strem.io/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/stream/"))
      return route.fulfill({
        json: {
          streams: [
            {
              name: "720p Portuguese",
              seeders: 5000,
              url: "https://cdn.example/friends-portuguese.mp4",
            },
            {
              name: "720p English",
              seeders: 10,
              url: "https://cdn.example/friends-english.mp4",
            },
          ],
        },
      });
    return route.fulfill({
      json: path.includes("/meta/") ? { meta: friends } : { metas: [friends] },
    });
  });
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );

  await page.goto("/#home");
  await page
    .locator(".media-card strong", { hasText: "Friends" })
    .first()
    .click();
  await page.getByRole("button", { name: /Resume S1 E3/ }).click();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/friends-portuguese.mp4",
  );
});
test("catalog manager creates, renames, reorders and hides Home rows", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /^Collections/ }).click();
  await page.getByText("Advanced add-on Home rows", { exact: true }).click();
  await page.getByRole("button", { name: "Create layout" }).click();

  const manager = page.locator(".catalog-manager");
  await expect(manager.locator("article")).toHaveCount(2);
  const movieTitle = page.getByLabel("Title for Popular movies");
  await movieTitle.fill("Friday night movies");
  await page.getByRole("button", { name: "Move Popular series up" }).click();
  await page.getByRole("button", { name: "Hide Popular movies" }).click();

  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nuvio:home-catalogs") ?? "[]"),
  );
  expect(stored).toHaveLength(2);
  expect(stored[0]).toMatchObject({
    catalog_id: "top",
    type: "series",
    order: 0,
  });
  expect(stored[1]).toMatchObject({
    catalog_id: "top",
    type: "movie",
    order: 1,
    enabled: false,
    custom_title: "Friday night movies",
  });

  await page.reload();
  await page.getByRole("button", { name: /^Collections/ }).click();
  await page.getByText("Advanced add-on Home rows", { exact: true }).click();
  await expect(page.getByLabel("Title for Popular movies")).toHaveValue(
    "Friday night movies",
  );
  await expect(
    page.getByRole("button", { name: "Show Popular movies" }),
  ).toBeVisible();
});
test("Xtream session login, channels, guide, favorites and disconnect", async ({
  page,
}) => {
  await connect(page);
  expect(
    await page.evaluate(() => localStorage.getItem("nuvio:provider")),
  ).toBeNull();
  expect(
    await page.evaluate(() => !!sessionStorage.getItem("nuvio:provider")),
  ).toBe(true);
  await page.goto("/#live");
  await expect(page.locator(".tv-guide-row")).toContainText("Evening news");
  await page
    .getByRole("button", { name: "Favorite Test News", exact: true })
    .click();
  await page.goto("/#library");
  await expect(
    page.locator(".media-card strong").filter({ hasText: "Test News" }),
  ).toBeVisible();
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("nuvio:provider")),
  ).toBeNull();
});
test("mobile live guide uses stacked channel cards without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);
  await page.goto("/#live");
  const row = page.locator(".tv-guide-row").first();
  await expect(row).toContainText("Evening news");
  const layout = await row.evaluate((element) => {
    const channel = element.querySelector<HTMLElement>(".tv-guide-channel")!;
    const programme = element.querySelector<HTMLElement>(
      ".tv-guide-programmes button",
    )!;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      rowWidth: element.getBoundingClientRect().width,
      channelWidth: channel.getBoundingClientRect().width,
      programmeWidth: programme.getBoundingClientRect().width,
      channelHeight: channel.getBoundingClientRect().height,
    };
  });
  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
  expect(layout.channelWidth).toBeGreaterThan(layout.rowWidth - 2);
  expect(layout.programmeWidth).toBeGreaterThan(220);
  expect(layout.channelHeight).toBeGreaterThanOrEqual(44);
  await expect(page.locator(".bottom-nav")).toBeVisible();
  await expect(page.locator(".sidebar")).toBeHidden();
  const mobileNavigation = await page.locator(".bottom-nav").evaluate((nav) => {
    const bounds = nav.getBoundingClientRect();
    return {
      position: getComputedStyle(nav).position,
      bottom: Math.round(innerHeight - bounds.bottom),
      width: Math.round(bounds.width),
    };
  });
  expect(mobileNavigation.position).toBe("fixed");
  expect(mobileNavigation.bottom).toBe(0);
  expect(mobileNavigation.width).toBe(390);

  await page.getByRole("tab", { name: "Sports" }).click();
  const sportsLayout = await page.locator(".sports-hub").evaluate((element) => {
    const toolbar = element.querySelector<HTMLElement>(".sports-toolbar")!;
    const kinds = element.querySelector<HTMLElement>(".sports-kinds")!;
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: innerWidth,
      hubWidth: element.getBoundingClientRect().width,
      toolbarWidth: toolbar.getBoundingClientRect().width,
      kindsWidth: kinds.getBoundingClientRect().width,
    };
  });
  expect(sportsLayout.documentWidth).toBeLessThanOrEqual(
    sportsLayout.viewportWidth + 1,
  );
  expect(sportsLayout.toolbarWidth).toBeLessThanOrEqual(
    sportsLayout.hubWidth + 1,
  );
  expect(sportsLayout.kindsWidth).toBeLessThanOrEqual(
    sportsLayout.hubWidth + 1,
  );
});

test("every primary page and settings section fits a portrait viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await connect(page);

  const expectNoPageOverflow = async (label: string) => {
    const layout = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      viewportWidth: innerWidth,
      widest: Array.from(document.querySelectorAll<HTMLElement>("body *"))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            node: `${element.tagName.toLowerCase()}.${String(element.className).replaceAll(" ", ".")}`,
            type: element.getAttribute("type"),
            aria: element.getAttribute("aria-label"),
            parent:
              element.parentElement?.className ||
              element.parentElement?.tagName,
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            scrollWidth: element.scrollWidth,
          };
        })
        .filter((item) => item.right > innerWidth + 1 || item.left < -1)
        .sort((a, b) => b.right - a.right)
        .slice(0, 5),
    }));
    expect(
      Math.max(layout.documentWidth, layout.bodyWidth),
      `${label} widened the portrait page: ${JSON.stringify(layout.widest)}`,
    ).toBeLessThanOrEqual(layout.viewportWidth + 1);
  };

  for (const route of [
    "home",
    "discover",
    "live",
    "youtube",
    "library",
    "account",
    "settings",
  ]) {
    await page.goto(`/#${route}`);
    await page.waitForTimeout(80);
    await expectNoPageOverflow(route);
  }

  await page.goto("/#live");
  await page.getByRole("tab", { name: "Sports" }).click();
  await expectNoPageOverflow("sports");

  await page.goto("/#settings");
  const settingsNav = page.getByRole("navigation", {
    name: "Settings sections",
  });
  for (const section of [
    "Add-ons",
    "Collections",
    "Live TV",
    "Playback",
    "General",
    "Health check",
    "Downloads",
    "Feedback",
    "What's new",
    "Privacy & status",
  ]) {
    await settingsNav
      .getByRole("button", { name: new RegExp(section) })
      .click();
    await expectNoPageOverflow(`settings: ${section}`);
    await page.getByRole("button", { name: "Back to settings" }).click();
  }
});
test("native subtitle appearance choices persist across a PWA restart", async ({
  page,
}) => {
  await page.goto("/#settings");
  const openPlayerSettings = () =>
    page
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button")
      .filter({ has: page.getByText("Player", { exact: true }) })
      .click();
  await openPlayerSettings();
  await page.getByLabel(/Bold subtitles/).check();
  await page.getByLabel(/Show preferred languages only/).check();
  await page.getByLabel(/Subtitle text color/).selectOption("#fff176");
  await page.getByLabel(/Subtitle background color/).selectOption("#102033");
  await page.getByLabel(/Preferred audio/).selectOption("original");
  await page.getByLabel(/Preferred subtitles/).selectOption("forced");
  await page.getByLabel(/Anime-Skip provider/).check();
  await page.getByLabel(/Anime-Skip client ID/).fill("anime-client");
  await page.getByLabel(/Submit IntroDB corrections/).check();
  await page.getByLabel(/IntroDB API key/).fill("local-intro-key");
  await page.getByLabel(/IntroDB API key/).blur();
  await expect
    .poll(() =>
      page.evaluate(() => ({
        bold: document.documentElement.dataset.nuvioSubtitleBold,
        text: document.documentElement.style.getPropertyValue(
          "--nuvio-subtitle-text-color",
        ),
        background: document.documentElement.style.getPropertyValue(
          "--nuvio-subtitle-background-color",
        ),
      })),
    )
    .toEqual({ bold: "true", text: "#fff176", background: "#102033" });

  await page.reload();
  await openPlayerSettings();
  await expect(page.getByLabel(/Bold subtitles/)).toBeChecked();
  await expect(page.getByLabel(/Show preferred languages only/)).toBeChecked();
  await expect(page.getByLabel(/Subtitle text color/)).toHaveValue("#fff176");
  await expect(page.getByLabel(/Subtitle background color/)).toHaveValue(
    "#102033",
  );
  await expect(page.getByLabel(/Preferred audio/)).toHaveValue("original");
  await expect(page.getByLabel(/Preferred subtitles/)).toHaveValue("forced");
  await expect(page.getByLabel(/Anime-Skip provider/)).toBeChecked();
  await expect(page.getByLabel(/Anime-Skip client ID/)).toHaveValue(
    "anime-client",
  );
  await expect(page.getByLabel(/Submit IntroDB corrections/)).toBeChecked();
  await expect(page.getByLabel(/IntroDB API key/)).toHaveValue(
    "local-intro-key",
  );
});
test("bad credentials show a useful error and are never saved", async ({
  page,
}) => {
  await page.unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => route.fulfill({ json: { user_info: { auth: 0 } } }),
  );
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page
    .getByLabel("Server address", { exact: true })
    .fill("https://vpn.trx-pro-iptvstore.cc");
  await page.getByLabel("Username", { exact: true }).fill("wrong");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Test & connect" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "rejected these credentials",
  );
  expect(
    await page.evaluate(() => sessionStorage.getItem("nuvio:provider")),
  ).toBeNull();
});
test("live TV tries native HLS before using Pi transcoding as a fallback", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  let prepared: any;
  let directHlsRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/live/test-user/test-password/10.m3u8"))
      directHlsRequests += 1;
  });
  await page.route("https://playback.example/prepare", async (route) => {
    prepared = route.request().postDataJSON();
    await route.fulfill({
      json: { path: "/media/live/index.m3u8", hls: true },
    });
  });
  await page.route("https://playback.example/media/live/index.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-ENDLIST\n",
    }),
  );
  await connect(page);
  await page.goto("/#live");
  await page
    .locator(".tv-guide-channel")
    .filter({ hasText: "Test News" })
    .click();
  const liveVideo = page.locator("dialog.player-dialog video");
  await expect(liveVideo).toBeVisible();
  if (["iphone", "ipad"].includes(testInfo.project.name)) return;
  await expect.poll(() => directHlsRequests).toBeGreaterThan(0);
  expect(prepared).toBeUndefined();
  await liveVideo.evaluate((video) => video.dispatchEvent(new Event("error")));
  await expect.poll(() => prepared).toBeTruthy();
  expect(prepared.mode).toBe("transcode");
  expect(prepared.live).toBe(true);
  expect(prepared.url).toContain("/live/test-user/test-password/10.ts");
});

test("TV viewers can keep a live mini player open while browsing the guide", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  let preparations = 0;
  await page.route("https://playback.example/prepare", (route) => {
    preparations += 1;
    return route.fulfill({
      json: { path: "/media/live/index.m3u8", hls: true },
    });
  });
  await page.route("https://playback.example/media/live/index.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-ENDLIST\n",
    }),
  );
  await connect(page);
  await page.goto("/?tv=1#live");
  await page
    .locator(".tv-guide-channel")
    .filter({ hasText: "Test News" })
    .click();
  await page
    .locator(".player-tools button")
    .filter({ hasText: "Choose stream" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("dialog", { name: "Choose a stream" })
    .locator(".player-source-group > button")
    .nth(1)
    .click();
  await expect.poll(() => preparations).toBeGreaterThan(0);
  const originalVideo = page.locator("dialog.player-dialog video");
  await originalVideo.evaluate((video) => {
    (window as Window & { __liveVideo?: HTMLVideoElement }).__liveVideo =
      video as HTMLVideoElement;
  });
  await page.getByRole("button", { name: "Minimize live player" }).click();
  const mini = page.locator("dialog.mini-live-player");
  await expect(mini).toBeVisible();
  await expect
    .poll(() =>
      mini
        .locator("video")
        .evaluate(
          (video) =>
            video ===
            (window as Window & { __liveVideo?: HTMLVideoElement }).__liveVideo,
        ),
    )
    .toBe(true);
  await expect(page.locator(".tv-guide-grid")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .not.toBe("hidden");
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    if (main) main.style.minHeight = "2200px";
    window.scrollTo(0, 0);
  });
  if (!["iphone", "ipad"].includes(testInfo.project.name)) {
    await page.locator("#main-content").hover({ position: { x: 8, y: 8 } });
    await page.mouse.wheel(0, 700);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
  }
  await page.locator(".tv-guide-programmes button").first().focus();
  await expect(
    page.locator(".tv-guide-programmes button").first(),
  ).toBeFocused();
  const restore = mini.getByRole("button", { name: "Restore live player" });
  await restore.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog.tv-player-surface")).not.toHaveClass(
    /mini-live-player/,
  );
  await page.keyboard.press("Escape");
  await expect(mini).toBeVisible();
  await mini
    .getByRole("button", { name: "Close player" })
    .click({ force: true });
  await expect(page.locator("dialog.player-dialog")).toBeHidden();
});

test("desktop and mobile browsers minimize live playback instead of closing it", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  let preparations = 0;
  await page.route("https://playback.example/prepare", (route) => {
    preparations += 1;
    return route.fulfill({
      json: { path: "/media/live/index.m3u8", hls: true },
    });
  });
  await page.route("https://playback.example/media/live/index.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-ENDLIST\n",
    }),
  );
  await connect(page);
  await page.goto("/#live");
  await page
    .locator(".tv-guide-channel")
    .filter({ hasText: "Test News" })
    .click();
  await page
    .locator(".player-tools button")
    .filter({ hasText: "Choose stream" })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page
    .getByRole("dialog", { name: "Choose a stream" })
    .locator(".player-source-group > button")
    .nth(1)
    .click();
  await expect.poll(() => preparations).toBeGreaterThan(0);
  const originalVideo = page.locator("dialog.player-dialog video");
  await originalVideo.evaluate((video) => {
    (window as Window & { __liveVideo?: HTMLVideoElement }).__liveVideo =
      video as HTMLVideoElement;
  });
  await page.getByRole("button", { name: "Minimize live player" }).click();
  const mini = page.locator("dialog.mini-live-player");
  await expect(mini).toBeVisible();
  await expect(page.locator(".tv-guide-grid")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .not.toBe("hidden");
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("#main-content");
    if (main) main.style.minHeight = "2200px";
    window.scrollTo(0, 0);
  });
  if (!["iphone", "ipad"].includes(testInfo.project.name)) {
    await page.locator("#main-content").hover({ position: { x: 8, y: 8 } });
    await page.mouse.wheel(0, 700);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);
  }
  await expect
    .poll(() =>
      mini
        .locator("video")
        .evaluate(
          (video) =>
            video ===
            (window as Window & { __liveVideo?: HTMLVideoElement }).__liveVideo,
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      mini.evaluate((dialog) => {
        const bounds = dialog.getBoundingClientRect();
        return (
          bounds.left >= 0 &&
          bounds.top >= 0 &&
          bounds.right <= innerWidth &&
          bounds.bottom <= innerHeight
        );
      }),
    )
    .toBe(true);
  await mini.getByRole("button", { name: "Restore live player" }).click();
  await expect(page.locator("dialog.player-dialog")).not.toHaveClass(
    /mini-live-player/,
  );
  await page.keyboard.press("Escape");
  await expect(mini).toBeVisible();
  await mini
    .getByRole("button", { name: "Close player" })
    .click({ force: true });
  await expect(page.locator("dialog.player-dialog")).toBeHidden();
});

test("Sports stays responsive when college football playback is minimized", async ({
  page,
}) => {
  await page.route(
    "https://site.api.espn.com/apis/site/v2/sports/**",
    (route) => {
      const collegeFootball = route
        .request()
        .url()
        .includes("/football/college-football/");
      return route.fulfill({
        headers: { "Access-Control-Allow-Origin": "*" },
        json: {
          leagues: [{ name: "College Football", slug: "college-football" }],
          events: collegeFootball
            ? [
                {
                  id: "state-tech-live",
                  name: "State vs Tech",
                  shortName: "State vs Tech",
                  date: new Date().toISOString(),
                  status: {
                    period: 3,
                    displayClock: "8:42",
                    type: { state: "in", shortDetail: "3rd · 8:42" },
                  },
                  competitions: [
                    {
                      competitors: [
                        {
                          homeAway: "away",
                          score: "21",
                          team: {
                            id: "state",
                            displayName: "State",
                            shortDisplayName: "State",
                            abbreviation: "STA",
                          },
                        },
                        {
                          homeAway: "home",
                          score: "17",
                          team: {
                            id: "tech",
                            displayName: "Tech",
                            shortDisplayName: "Tech",
                            abbreviation: "TEC",
                          },
                        },
                      ],
                      broadcasts: [{ names: ["ESPN"] }],
                    },
                  ],
                },
              ]
            : [],
        },
      });
    },
  );
  await page
    .context()
    .unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page
    .context()
    .route(
      "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
      async (route) => {
        const action = new URL(route.request().url()).searchParams.get(
          "action",
        );
        const now = Math.floor(Date.now() / 1000);
        const data = !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action.endsWith("_categories")
            ? [{ category_id: "7", category_name: "US| SPORTS NETWORK" }]
            : action === "get_short_epg"
              ? {
                  epg_listings: [
                    {
                      id: "football-1",
                      title: btoa("College Football: State vs Tech"),
                      description: btoa("Live NCAA football game coverage."),
                      start_timestamp: now - 300,
                      stop_timestamp: now + 7_200,
                    },
                  ],
                }
              : [
                  {
                    stream_id: 117,
                    name: "US| ESPN COLLEGE FOOTBALL HD",
                    category_id: "7",
                    epg_channel_id: "espn.college.football",
                  },
                ];
        await route.fulfill({ json: data });
      },
    );
  await page.route("https://playback.example/prepare", (route) =>
    route.fulfill({ json: { path: "/media/live/index.m3u8", hls: true } }),
  );
  await page.route("https://playback.example/media/live/index.m3u8", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-ENDLIST\n",
    }),
  );

  await connect(page);
  await page.goto("/#live");
  await expect(page.locator(".tv-guide-row")).toContainText(
    "College Football: State vs Tech",
  );
  await page.evaluate(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  await page.getByRole("tab", { name: "Sports" }).click();
  await page.getByRole("button", { name: "Football", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "College Football: State vs Tech" }),
  ).toBeVisible();
  const liveScores = page.getByRole("region", { name: "Live scores" });
  await expect(liveScores).toBeVisible();
  await expect(liveScores).toContainText("21");
  await expect(liveScores).toContainText("17");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const scores = document.querySelector('[aria-label="Live scores"]');
        const ordinary = [
          ...document.querySelectorAll(".sports-event-section"),
        ].find((element) => element.getAttribute("aria-label") === "Live now");
        return (
          !ordinary ||
          !!(
            scores?.compareDocumentPosition(ordinary) &
            Node.DOCUMENT_POSITION_FOLLOWING
          )
        );
      }),
    )
    .toBe(true);
  await page
    .locator(".sports-channels button")
    .filter({ hasText: "ESPN COLLEGE FOOTBALL" })
    .click();
  await page.getByRole("button", { name: "Minimize live player" }).click();

  await expect(page.locator("dialog.mini-live-player")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "College Football: State vs Tech" }),
  ).toBeVisible({ timeout: 1_000 });
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .not.toBe("hidden");
  await page.getByRole("button", { name: "All sports" }).click();
  await expect(page.getByRole("button", { name: "All sports" })).toHaveClass(
    /active/,
  );
});
test("HTTP Xtream API and playback stay behind the HTTPS companion", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
      }),
    ),
  );
  let directHttpCalls = 0;
  await page.route("http://iptv.example/**", (route) => {
    directHttpCalls++;
    return route.abort();
  });
  await page.route("https://playback.example/guide", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route("https://playback.example/request", async (route) => {
    const body = route.request().postDataJSON();
    const source = new URL(body.url);
    if (source.pathname === "/xmltv.php") return route.fulfill({ status: 404 });
    const action = source.searchParams.get("action");
    const json = !action
      ? { user_info: { auth: 1, status: "Active" } }
      : action.endsWith("_categories")
        ? [{ category_id: "1", category_name: "News" }]
        : action === "get_short_epg"
          ? {
              epg_listings: [
                {
                  id: "1",
                  title: btoa("HTTP evening news"),
                  start_timestamp: Math.floor(Date.now() / 1000) - 100,
                  stop_timestamp: Math.floor(Date.now() / 1000) + 900,
                },
              ],
            }
          : [
              {
                stream_id: 10,
                name: "HTTP News",
                category_id: "1",
                epg_channel_id: "http.news",
              },
            ];
    return route.fulfill({ json });
  });
  let prepared: Record<string, unknown> | undefined;
  await page.route("https://playback.example/prepare", (route) => {
    prepared = route.request().postDataJSON();
    return route.fulfill({
      json: { path: "/media/http-live/index.m3u8", hls: true },
    });
  });
  await page.route(
    "https://playback.example/media/http-live/index.m3u8",
    (route) =>
      route.fulfill({
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-ENDLIST\n",
      }),
  );
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page.getByLabel("Server address").fill("http://iptv.example:8080");
  await page.getByLabel("Username").fill("http-user");
  await page.getByLabel("Password").fill("http-password");
  await page.getByRole("button", { name: "Test & connect" }).click();
  await expect(page.getByText("Connection verified.")).toBeVisible();
  await page.goto("/#live");
  const channel = page
    .locator(".tv-guide-channel")
    .filter({ hasText: "HTTP News" });
  await expect(channel).toBeVisible();
  await channel.click();
  await expect.poll(() => prepared).toBeTruthy();
  expect(prepared?.url).toContain(
    "http://iptv.example:8080/live/http-user/http-password/10.ts",
  );
  expect(directHttpCalls).toBe(0);
});
test("channels without guide data stay out of the live guide", async ({
  page,
}) => {
  await connect(page);
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({
        json: action?.endsWith("_categories")
          ? []
          : Array.from({ length: 5000 }, (_, i) => ({
              stream_id: i,
              name: `Channel ${i}`,
              category_id: "1",
            })),
      });
    },
  );
  await page.goto("/#live");
  await expect(page.locator(".tv-guide-row")).toHaveCount(0);
  await page.getByLabel("Search titles or channels").fill("Channel 4999");
  await expect(page.locator(".tv-guide-row")).toHaveCount(0);
});

test("guide-tagged channels stay hidden when no schedule data can be loaded", async ({
  page,
}) => {
  await page.route("https://vpn.trx-pro-iptvstore.cc/xmltv.php**", (route) =>
    route.fulfill({ status: 404 }),
  );
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      if (!action)
        return route.fulfill({
          json: { user_info: { auth: 1, status: "Active" } },
        });
      if (action.endsWith("_categories"))
        return route.fulfill({
          json: [{ category_id: "1", category_name: "News" }],
        });
      if (action === "get_short_epg") return route.fulfill({ status: 404 });
      return route.fulfill({
        json: [
          {
            stream_id: 10,
            name: "Guide Tagged News",
            category_id: "1",
            epg_channel_id: "guide.tagged.news",
          },
        ],
      });
    },
  );
  await connect(page);
  await page.goto("/#live");
  await expect(page.locator(".tv-guide-row")).toHaveCount(0);
  await expect(page.getByText("Guide Tagged News")).toBeHidden();
});

test("custom XMLTV URL supplies guide data for an imported M3U playlist", async ({
  page,
}) => {
  const xmlTime = (date: Date) =>
    date.toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const now = Date.now();
  await page.route("https://guide.example/epg.xml", (route) =>
    route.fulfill({
      contentType: "application/xml",
      body: `<?xml version="1.0"?><tv>
        <channel id="test.channel"><display-name>Custom News</display-name></channel>
        <programme channel="test.channel" start="${xmlTime(new Date(now - 60_000))}" stop="${xmlTime(new Date(now + 60 * 60_000))}">
          <title>Current show</title><desc>Custom XMLTV programme</desc>
        </programme>
      </tv>`,
    }),
  );
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page
    .getByLabel("EPG / XMLTV URL")
    .fill("https://guide.example/epg.xml");
  await page.getByRole("button", { name: "Save guide" }).click();
  await expect(page.getByRole("status")).toContainText("Program guide saved");
  await page.getByLabel("Import M3U playlist").setInputFiles({
    name: "channels.m3u",
    mimeType: "audio/x-mpegurl",
    buffer: Buffer.from(
      '#EXTM3U\n#EXTINF:-1 tvg-id="test.channel" group-title="News",Custom News\nhttps://stream.example/news.m3u8',
    ),
  });
  await page.goto("/#live");
  const guideRow = page.locator(".tv-guide-row").filter({
    hasText: "Custom News",
  });
  await expect(guideRow).toContainText("Current show");
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("nuvio:epg-url") || '""'),
      ),
    )
    .toBe("https://guide.example/epg.xml");
});

test("imports native collections and opens their addon catalogs", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /General/ }).click();
  await page.getByLabel("Import collections file").setInputFiles({
    name: "collections.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          id: "cinema",
          title: "Cinema nights",
          folders: [
            {
              id: "movies",
              title: "Movies",
              sources: [
                {
                  provider: "addon",
                  addonId: "com.linvo.cinemeta",
                  type: "movie",
                  catalogId: "top",
                  title: "Netflix",
                },
                {
                  provider: "addon",
                  addonId: "com.linvo.cinemeta",
                  type: "movie",
                  catalogId: "top",
                  title: "Netflix",
                  mediaType: "tv",
                },
              ],
            },
          ],
        },
      ]),
    ),
  });
  await expect(
    page.getByText("Imported 1 collections.", { exact: false }),
  ).toBeVisible();
  await page.goto("/#library");
  await expect(page.getByText("Cinema nights", { exact: true })).toHaveCount(0);
  await page.goto("/#home");
  await page
    .getByRole("button", { name: "Open Cinema nights: Movies" })
    .click();
  await expect(
    page.locator(".collection-browser .media-card strong"),
  ).toHaveText(["The Test Movie", "The Test Movie"]);
  await expect(
    page.getByRole("heading", { name: "Netflix (Movies)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Netflix (Series)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Back to Home" }),
  ).toBeVisible();
  await expect(page.getByText("New folder", { exact: true })).toHaveCount(0);
  await expect(
    page.getByText("Remove collection", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
  ).toBe(false);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Open Cinema nights: Movies" }),
  ).toBeVisible();
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Collections/ }).click();
  await page.getByRole("button", { name: "Edit Cinema nights" }).click();
  await page.getByRole("checkbox", { name: "Show on Home" }).uncheck();
  await page.goto("/#home");
  await expect(
    page.getByRole("button", { name: "Open Cinema nights: Movies" }),
  ).toHaveCount(0);
});

test("enables remote focus navigation in TV mode", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?tv=1#home");
  await expect(page.locator("html")).toHaveClass(/tv-mode/);
  const home = page.getByRole("link", { name: "Home", exact: true });
  const discover = page.getByRole("link", { name: "Discover", exact: true });
  const live = page.getByRole("link", { name: "Live TV", exact: true });

  await home.focus();
  await expect(home).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(discover).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(live).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(discover).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#discover$/);
  await expect(discover).toHaveAttribute("aria-current", "page");
});

test("keeps remote arrows inside focused TV form controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/?tv=1#home");
  const search = page.getByRole("searchbox");
  await search.fill("remote search");
  await search.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("remote search");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#discover$/);
  await expect(page.locator("html")).toHaveClass(/tv-mode/);
});

async function streamingAddon(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://v3-cinemeta.strem.io",
          manifest: {
            id: "com.linvo.cinemeta",
            name: "Test streams",
            types: ["movie"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "movie" }],
          },
        },
      ]),
    );
  });
}
test("mobile-style autoplay preserves the source provider order", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ playerStatusOverlay: true, updatedAt: Date.now() }),
    );
    // Empty MP4 route fixtures can fail decoding immediately on WebKit. This
    // test owns ranking and full-screen layout, not media-error fallback, so
    // keep the player mounted long enough to assert those two behaviors.
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
    const attempted: string[] = [];
    Object.defineProperty(window, "__testMediaSources", { value: attempted });
    const capture = (node: Node) => {
      if (node instanceof HTMLVideoElement && node.getAttribute("src"))
        attempted.push(node.getAttribute("src")!);
      if (node instanceof Element)
        node.querySelectorAll("video[src]").forEach((video) => {
          const source = video.getAttribute("src");
          if (source) attempted.push(source);
        });
    };
    new MutationObserver((records) =>
      records.forEach((record) => {
        if (record.type === "attributes") capture(record.target);
        record.addedNodes.forEach(capture);
      }),
    ).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "4K", seeders: 3, url: "https://cdn.example/4k.mp4" },
          {
            name: "1080p MKV",
            seeders: 500,
            url: "https://cdn.example/video",
            behaviorHints: { filename: "Movie.1080p.mkv" },
          },
          { name: "720p", seeders: 200, url: "https://cdn.example/best.mp4" },
          { name: "480p", seeders: 999, url: "https://cdn.example/sd.mp4" },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const player = page.locator("dialog.tv-web-player");
  await expect(player).toBeVisible();
  const playerBox = await player.boundingBox();
  const videoBox = await player.locator("video").boundingBox();
  const viewport = page.viewportSize();
  expect(Math.round(playerBox?.x ?? -1)).toBe(0);
  expect(Math.round(playerBox?.y ?? -1)).toBe(0);
  expect(Math.round(playerBox?.width ?? 0)).toBe(viewport?.width);
  expect(Math.round(playerBox?.height ?? 0)).toBe(viewport?.height);
  expect(Math.round(videoBox?.x ?? -1)).toBe(0);
  expect(Math.round(videoBox?.y ?? -1)).toBe(0);
  expect(Math.round(videoBox?.width ?? 0)).toBe(viewport?.width);
  expect(Math.round(videoBox?.height ?? 0)).toBe(viewport?.height);
  await expect(player.locator(".tv-web-center-controls")).toBeVisible();
  await expect(player.locator(".player-status-overlay")).toContainText(
    "Direct",
  );
  await expect(player.locator(".tv-web-progress-controls")).toBeVisible();
  await expect(
    page.getByText(/Checking stream|SMART SOURCE SEARCH/),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      player.locator(".tv-web-center-controls button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const label = button.getAttribute("aria-label");
          return label === "Play" || label === "Pause" ? "Play/Pause" : label;
        }),
      ),
    )
    .toEqual(["Rewind 10 seconds", "Play/Pause", "Fast forward 10 seconds"]);
  const transportBox = await player
    .locator(".tv-web-center-controls")
    .boundingBox();
  expect(
    Math.abs(
      (transportBox?.x ?? 0) +
        (transportBox?.width ?? 0) / 2 -
        (viewport?.width ?? 0) / 2,
    ),
  ).toBeLessThanOrEqual(2);
  const options = page.getByRole("dialog", { name: "Playback options" });
  await expect(options).toBeHidden();
  await openPlaybackOptions(page);
  await options.getByRole("button", { name: "Close playback options" }).click();
  await expect(options).toBeHidden();
  // The empty media fixture intentionally fails decoding and can trigger the
  // player's automatic fallback before a normal DOM assertion runs on slower
  // CI workers. Assert the first assigned source instead: that is the ranking
  // behavior this test owns, while fallback has its own test below.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __testMediaSources?: string[] })
            .__testMediaSources?.[0],
      ),
    )
    .toBe("https://cdn.example/4k.mp4");
});
test("autoplay starts without waiting for slow add-ons", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "tiktak:stream-preferences",
      JSON.stringify({
        autoPlayMode: "first",
        autoPlayTimeoutSeconds: 0,
      }),
    );
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ streamSourcePinning: true, updatedAt: Date.now() }),
    );
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://fast.example",
          manifest: {
            id: "fast",
            name: "Fast source",
            types: ["movie"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "movie" }],
          },
        },
        {
          base: "https://slow.example",
          manifest: {
            id: "slow",
            name: "Debridio",
            types: ["movie"],
            resources: ["stream"],
            catalogs: [],
          },
        },
      ]),
    );
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://fast.example/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/stream/"))
      return route.fulfill({
        json: {
          streams: [
            {
              name: "720p AAC",
              seeders: 500,
              url: "https://cdn.example/fast-720.mp4",
            },
          ],
        },
      });
    return route.fulfill({
      json: path.includes("/meta/") ? { meta } : { metas: [meta] },
    });
  });
  let slowFinished = false;
  await page.route("https://slow.example/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    slowFinished = true;
    return route.fulfill({
      json: {
        streams: [
          {
            name: "Debridio cached 1440p AAC",
            seeders: 100,
            url: "https://cdn.example/debridio-1440.mp4",
          },
        ],
      },
    });
  });
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).first().click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/fast-720.mp4",
  );
  expect(slowFinished).toBe(false);
  await expect.poll(() => slowFinished).toBe(true);
  // Completing the remaining add-ons must enrich the manual list without
  // replacing or restarting the stream that already began playing.
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/fast-720.mp4",
  );
  await openPlaybackOptions(page);
  await page.getByRole("button", { name: "Choose stream" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a stream" });
  await expect(chooser).toContainText(
    "2 sources loaded from completed add-ons",
  );
  await expect(chooser.locator(".player-source-group")).toHaveCount(2);
  await expect(
    chooser.locator(".player-source-group > header strong"),
  ).toHaveText(["Fast source", "Debridio"]);
  await expect(chooser).toContainText("Debridio cached 1440p AAC");
  await chooser.getByRole("button", { name: "Pin Debridio" }).click();
  await expect(
    chooser.locator(".player-source-group > header strong"),
  ).toHaveText(["Debridio", "Fast source"]);
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(
          localStorage.getItem("tiktak:stream-preferences") ?? "{}",
        ).pinnedSources?.map((source: { name: string }) => source.name),
      ),
    )
    .toEqual(["Debridio"]);
});
test("episode resume briefly races an incompatible first result and starts the direct MP4", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const item = {
      id: "tt-resume-race",
      name: "Resume Race Series",
      type: "series",
      source: "addon",
      provider: "https://conversion-first.example",
    };
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item,
          seconds: 420,
          duration: 1320,
          at: Date.now(),
          episode: {
            id: "tt-resume-race:2:11",
            name: "The Resume Test",
            season: 2,
            episode: 11,
          },
        },
      ]),
    );
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://conversion-first.example",
          manifest: {
            id: "conversion-first",
            name: "Conversion first",
            types: ["series"],
            resources: ["meta", "stream"],
            catalogs: [],
          },
        },
        {
          base: "https://direct-second.example",
          manifest: {
            id: "direct-second",
            name: "Direct second",
            types: ["series"],
            resources: ["stream"],
            catalogs: [],
          },
        },
      ]),
    );
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    );
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://conversion-first.example/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/meta/"))
      return route.fulfill({
        json: {
          meta: {
            id: "tt-resume-race",
            name: "Resume Race Series",
            type: "series",
            videos: [
              {
                id: "tt-resume-race:2:11",
                title: "The Resume Test",
                season: 2,
                episode: 11,
              },
            ],
          },
        },
      });
    return route.fulfill({
      json: {
        streams: [
          {
            name: "[TB+] Conversion first 1080p",
            title: "Episode.1080p.x265 seeders: 500",
            url: "https://cdn.example/episode-resolved",
            behaviorHints: { filename: "Episode.S02E11.1080p.x265.mkv" },
          },
        ],
      },
    });
  });
  await page.route("https://direct-second.example/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return route.fulfill({
      json: {
        streams: [
          {
            name: "[TB+] Direct 720p",
            title: "Episode.720p.x264.AAC seeders: 120",
            url: "https://cdn.example/episode-direct.mp4",
          },
        ],
      },
    });
  });
  let prepareRequests = 0;
  await page.route("https://playback.example/prepare", async (route) => {
    prepareRequests += 1;
    return route.fulfill({ json: { path: "/media/unwanted/index.m3u8" } });
  });
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/#library");
  await page
    .getByRole("button", { name: /Resume Race Series/ })
    .first()
    .click();
  await page.getByRole("button", { name: /Resume S2 E11/ }).click();
  await expect(page.locator(".player-dialog video")).toHaveAttribute(
    "src",
    "https://cdn.example/episode-direct.mp4",
    { timeout: 2500 },
  );
  expect(prepareRequests).toBe(0);
});
test("autoplay shows a top loading state without opening the manual stream list", async ({
  page,
}) => {
  await streamingAddon(page);
  let releaseStreams!: () => void;
  const streamsReady = new Promise<void>((resolve) => {
    releaseStreams = resolve;
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", async (route) => {
    await streamsReady;
    await route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            seeders: 100,
            url: "https://cdn.example/fast.mp4",
          },
        ],
      },
    });
  });
  await page.route("https://cdn.example/fast.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const openingPlayer = page.locator(".detail-preparing");
  await expect(openingPlayer).toContainText("NOW PLAYING");
  await expect(openingPlayer).toContainText("The Test Movie");
  await expect(openingPlayer).toContainText("Starting video");
  await expect(openingPlayer).not.toContainText(/source|stream/i);
  const openingBounds = await openingPlayer.boundingBox();
  const openingViewport = page.viewportSize();
  expect(Math.round(openingBounds?.x ?? -1)).toBe(0);
  expect(Math.round(openingBounds?.y ?? -1)).toBe(0);
  expect(Math.round(openingBounds?.width ?? 0)).toBe(openingViewport?.width);
  expect(Math.round(openingBounds?.height ?? 0)).toBe(openingViewport?.height);
  await expect(page.getByText("Choose a stream", { exact: true })).toHaveCount(
    0,
  );
  releaseStreams();
  await expect(page.locator(".detail-dialog")).toHaveCount(0);
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/fast.mp4",
  );
});

test("playback capacity is cleaned up and retried without an error screen", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "test-user",
        mode: "direct",
      }),
    ),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p AAC",
            url: "https://cdn.example/movie",
            behaviorHints: { filename: "Movie.1080p.mkv" },
          },
        ],
      },
    }),
  );
  let attempts = 0;
  await page.route("https://playback.example/prepare", (route) => {
    attempts += 1;
    return attempts === 1
      ? route.fulfill({
          status: 429,
          json: {
            error: "Two video transcodes are already active. Retry shortly.",
          },
        })
      : route.fulfill({
          json: { path: "/media/retried/index.m3u8", hls: true },
        });
  });
  await page.route(
    "https://playback.example/media/retried/index.m3u8",
    (route) =>
      route.fulfill({
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-ENDLIST\n",
      }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("dialog.tv-web-player video")).toBeVisible();
  await expect(
    page.getByText("Two video transcodes are already active"),
  ).toHaveCount(0);
  await expect(page.getByText("Could not start playback")).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("iPhone retries user-selected playback without a stale play notice", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone",
    "Exercises iOS PWA media readiness.",
  );
  await streamingAddon(page);
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    let attempts = 0;
    Object.defineProperty(window, "__testPlayAttempts", {
      get: () => attempts,
    });
    HTMLMediaElement.prototype.play = function () {
      attempts += 1;
      if (attempts === 1)
        return Promise.reject(
          new DOMException("Media is not ready", "AbortError"),
        );
      return nativePlay.call(this);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "1080p", seeders: 100, url: "https://cdn.example/ready.mp4" },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/ready.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const video = page.locator("video");
  await expect(video).toBeVisible();
  await video.evaluate((element) =>
    element.dispatchEvent(new Event("canplay")),
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __testPlayAttempts?: number })
            .__testPlayAttempts,
      ),
    )
    .toBeGreaterThan(1);
  await expect(
    page.getByText("Tap the video’s play button to start."),
  ).toHaveCount(0);
  await video.evaluate((element) => element.dispatchEvent(new Event("play")));
  await expect(
    page.getByText("Tap the video’s play button to start."),
  ).toHaveCount(0);
});

test("the player exposes every compatible stream while automatic fallback stays bounded", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await streamingAddon(page);
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: Array.from({ length: 7 }, (_, index) => ({
          name: `Option ${index + 1} 1080p AAC`,
          title: `Manual stream ${index + 1}`,
          seeders: 100 - index,
          url: `https://cdn.example/option-${index + 1}.mp4`,
        })),
      },
    }),
  );
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openPlaybackOptions(page);
  await expect(
    page.getByRole("button", { name: "Choose stream" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose stream" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a stream" });
  await expect(chooser).toContainText(
    "The selected source stays locked unless you choose another one here",
  );
  await expect(chooser.locator(".player-source-group > button")).toHaveCount(7);
  await chooser
    .locator(".player-source-group > button")
    .filter({ hasText: "Option 7" })
    .click();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/option-7.mp4",
  );
});

test("manual conversion sources replace the active job instead of hitting capacity", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "replacement-test",
        mode: "direct",
      }),
    );
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "Debridio 4K REMUX HEVC",
            title: "First.2160p.REMUX.HEVC.mkv",
            url: "https://cdn.example/first-remux.mkv",
          },
          {
            name: "Debridio 1440p HEVC",
            title: "Second.1440p.HEVC.mkv",
            url: "https://cdn.example/second-remux.mkv",
          },
        ],
      },
    }),
  );
  const mediaIds = ["a".repeat(32), "b".repeat(32)];
  const preparations: Record<string, unknown>[] = [];
  let cancellations = 0;
  await page.route("https://playback.example/prepare", async (route) => {
    const body = route.request().postDataJSON();
    preparations.push(body);
    if (preparations.length === 2)
      await new Promise((resolve) => setTimeout(resolve, 500));
    const id = mediaIds[Math.min(preparations.length - 1, 1)];
    return route.fulfill({ json: { path: `/media/${id}/index.m3u8` } });
  });
  await page.route("https://playback.example/playback/cancel", (route) => {
    cancellations += 1;
    return route.fulfill({ json: { cancelled: 1 } });
  });
  await page.route("https://playback.example/media/**", (route) =>
    route.fulfill({
      contentType: "application/vnd.apple.mpegurl",
      body: "#EXTM3U\n#EXT-X-ENDLIST\n",
    }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => preparations.length).toBe(1);
  await openPlaybackOptions(page);
  await page.getByRole("button", { name: "Choose stream" }).click();
  await page
    .getByRole("dialog", { name: "Choose a stream" })
    .getByRole("button", { name: /Debridio 1440p HEVC/ })
    .click();
  await expect(page.locator("dialog.tv-web-player video")).toBeVisible();
  await expect(page.locator(".mobile-opening-player")).toHaveCount(0);
  await expect(page.locator(".player-source-handoff")).toContainText(
    "Debridio 1440p HEVC",
  );
  await expect.poll(() => preparations.length).toBe(2);
  expect(preparations[0].playbackId).toMatch(/^[A-Za-z0-9_-]{20,100}$/);
  expect(preparations[1].playbackId).toBe(preparations[0].playbackId);
  expect(preparations[1].replace).toBe(`/media/${mediaIds[0]}/index.m3u8`);
  await expect(page.locator(".player-source-handoff")).toHaveCount(0);
  await expect(
    page.getByText("Two video transcodes are already active"),
  ).toHaveCount(0);
  await expect(page.getByText("Could not start playback")).toHaveCount(0);
  await page.getByRole("button", { name: "Close player" }).click();
  await expect.poll(() => cancellations).toBeGreaterThan(0);
});

test("TV remote users can open the in-player stream chooser and switch sources", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The ten-foot player targets the Chromium Android TV shell.",
  );
  await streamingAddon(page);
  await page.addInitScript(() => {
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: Array.from({ length: 6 }, (_, index) => ({
          name: `TV option ${index + 1} 1080p AAC`,
          title: `Remote stream ${index + 1}`,
          seeders: 50 - index,
          url: `https://cdn.example/tv-option-${index + 1}.mp4`,
        })),
      },
    }),
  );
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/?tv=1");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const choose = page.getByRole("button", { name: "Choose stream" });
  await choose.focus();
  await page.keyboard.press("Enter");
  const last = page
    .getByRole("dialog", { name: "Choose a stream" })
    .locator(".player-source-group > button")
    .filter({ hasText: "TV option 6" });
  await last.evaluate((element) => {
    const target = element as HTMLElement;
    target.focus();
    target.click();
  });
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/tv-option-6.mp4",
  );
});

test("autoplay falls back to the next ranked source when playback fails", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "Synthetic empty MP4 errors are not emitted consistently by mobile WebKit.",
  );
  await streamingAddon(page);
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "1080p", seeders: 100, url: "https://cdn.example/first.mp4" },
          {
            name: "1080p",
            seeders: 90,
            url: "https://cdn.example/fallback.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  const fallbackRequested = page.waitForRequest(
    "https://cdn.example/fallback.mp4",
  );
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await fallbackRequested;
});
test("playback stays on its selected source after making progress", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "This test controls Chromium media events directly.",
  );
  await streamingAddon(page);
  await page.addInitScript(() => {
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") {
        (
          window as Window & {
            __tiktakMediaError?: EventListenerOrEventListenerObject;
          }
        ).__tiktakMediaError = listener;
        return;
      }
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            seeders: 100,
            url: "https://cdn.example/locked.mp4",
          },
          {
            name: "1080p",
            seeders: 90,
            url: "https://cdn.example/unwanted.mp4",
          },
        ],
      },
    }),
  );
  let unwantedRequests = 0;
  await page.route("https://cdn.example/**", (route) => {
    if (route.request().url().endsWith("/unwanted.mp4")) unwantedRequests += 1;
    return route.fulfill({ status: 200, contentType: "video/mp4", body: "" });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const video = page.locator("video");
  await expect(video).toHaveAttribute("src", "https://cdn.example/locked.mp4");
  await video.evaluate(async (element) => {
    Object.defineProperty(element, "currentTime", {
      configurable: true,
      writable: true,
      value: 0,
    });
    element.dispatchEvent(new Event("play"));
    await new Promise((resolve) => setTimeout(resolve, 2700));
    element.currentTime = 4;
    element.dispatchEvent(new Event("timeupdate"));
    const listener = (
      window as Window & {
        __tiktakMediaError?: EventListenerOrEventListenerObject;
      }
    ).__tiktakMediaError;
    const event = new Event("error");
    if (typeof listener === "function") listener.call(element, event);
    else listener?.handleEvent(event);
  });
  await expect(page.locator(".player-dialog .error")).toBeVisible();
  expect(unwantedRequests).toBe(0);
  await expect(video).toHaveAttribute("src", "https://cdn.example/locked.mp4");
});
test("an independent user's configured Torrentio debrid stream converts only after browser playback fails", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "independent-user",
        mode: "direct",
      }),
    ),
  );
  let directStreamCalls = 0;
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) => {
    directStreamCalls++;
    return route.abort();
  });
  await page.route("https://playback.example/request", (route) => {
    const source = String(route.request().postDataJSON().url);
    if (source.includes("/catalog/"))
      return route.fulfill({ json: { metas: [meta] } });
    if (source.includes("/meta/")) return route.fulfill({ json: { meta } });
    expect(source).toContain("/stream/movie/");
    return route.fulfill({
      json: {
        streams: [
          {
            name: "[TB+] Torrentio 1080p",
            title: "The.Rookie.S01E01.1080p seeders: 250",
            url: "https://torrentio.example/resolve/torbox/friend-key/hash/file/0/video",
          },
        ],
      },
    });
  });
  const preparations: Record<string, unknown>[] = [];
  await page.route("https://playback.example/prepare", async (route) => {
    preparations.push(route.request().postDataJSON());
    await route.fulfill({ json: { path: "/media/friend/stream" } });
  });
  await page.route("https://playback.example/media/friend/stream", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => preparations.length).toBeGreaterThan(0);
  // Direct requests are preferred; the aborted browser request represents a
  // CORS/network block, after which the authenticated companion takes over.
  expect(directStreamCalls).toBeGreaterThan(0);
  expect(preparations[0].url).toContain("/resolve/torbox/");
  expect(preparations[0].mode).toBe("transcode");
  await expect(page.locator("video")).toBeVisible();
});

test("configured add-on streams retain query settings with direct-first loading", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "test-user",
        mode: "direct",
      }),
    );
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://configured.example/account?token=private",
          manifest: {
            id: "configured.example",
            name: "Configured streams",
            types: ["movie"],
            resources: ["catalog", "meta", "stream"],
            catalogs: [{ id: "top", type: "movie" }],
          },
        },
      ]),
    );
  });
  const relayed: string[] = [];
  await page.route("https://playback.example/request", (route) => {
    const source = route.request().postDataJSON().url as string;
    if (source.startsWith("https://configured.example/")) relayed.push(source);
    return route.fulfill({ status: 502, json: { error: "upstream" } });
  });
  const direct: string[] = [];
  await page.route("https://configured.example/**", (route) => {
    const url = new URL(route.request().url());
    direct.push(url.href);
    expect(url.searchParams.get("token")).toBe("private");
    if (url.pathname.includes("/stream/"))
      return route.fulfill({
        json: {
          streams: [
            { name: "Test 1080p", url: "https://cdn.example/film.mp4" },
          ],
        },
      });
    if (url.pathname.includes("/meta/"))
      return route.fulfill({ json: { meta } });
    return route.fulfill({ json: { metas: [meta] } });
  });
  await page.route("https://cdn.example/film.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      direct.some((url) =>
        url.includes("/stream/movie/tt-test.json?token=private"),
      ),
    )
    .toBe(true);
  expect(relayed).toEqual([]);
  await expect(page.locator("video")).toBeVisible();
});

test("refresh and test preserve a configured add-on manifest URL", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://configured.example/account?token=private",
          manifest: {
            id: "configured.example",
            name: "Configured streams",
            types: ["movie"],
            resources: ["catalog", "stream"],
            catalogs: [],
          },
        },
      ]),
    ),
  );
  const requested: string[] = [];
  await page.route("https://configured.example/**", (route) => {
    requested.push(route.request().url());
    return route.fulfill({
      json: {
        id: "configured.example",
        name: "Configured streams",
        types: ["movie"],
        resources: ["catalog", "stream"],
        catalogs: [],
      },
    });
  });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Add-ons/ }).click();
  await page.getByRole("button", { name: "Test Configured streams" }).click();
  await expect(
    page.getByText("Configured streams is reachable."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Refresh installed manifests" })
    .click();
  await expect(page.getByText("All add-on manifests refreshed.")).toBeVisible();
  await page.getByRole("button", { name: "Remove Configured streams" }).click();
  const removeDialog = page.getByRole("dialog", { name: "Remove add-on" });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(removeDialog).toHaveCount(0);
  // The second action may reuse the short-lived manifest cache.
  expect(requested.length).toBeGreaterThan(0);
  expect(
    requested.every(
      (url) =>
        url ===
        "https://configured.example/account/manifest.json?token=private",
    ),
  ).toBe(true);
});
test("self-hosted HTTP add-ons install through companion fallback", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({ url: "https://playback.example", token: "test" }),
    ),
  );
  const manifestUrl = "http://192.168.4.56:3000/manifest.json";
  await page.route(manifestUrl, (route) => route.abort("blockedbyclient"));
  await page.route("https://playback.example/request", async (route) => {
    expect(route.request().postDataJSON().url).toBe(manifestUrl);
    await route.fulfill({
      json: {
        id: "lan.addon",
        name: "LAN streams",
        types: ["movie"],
        resources: ["stream"],
        catalogs: [],
      },
    });
  });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Add-ons/ }).click();
  await page
    .getByRole("textbox", { name: "Manifest URL", exact: true })
    .fill(manifestUrl);
  await page.getByRole("button", { name: "Install add-on" }).click();
  await expect(page.getByText("LAN streams installed.")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("nuvio:addons") ?? "[]").find(
            (addon: { manifest?: { id?: string } }) =>
              addon.manifest?.id === "lan.addon",
          )?.base,
      ),
    )
    .toBe("http://192.168.4.56:3000");
});
test("search uses every searchable catalog even when a trending catalog is selected", async ({
  page,
}) => {
  await page.route("https://api.themoviedb.org/3/search/multi**", (route) =>
    route.fulfill({ json: { results: [] } }),
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://search.example",
          manifest: {
            id: "search-test",
            name: "Search test",
            types: ["series"],
            resources: ["catalog", "meta"],
            catalogs: [
              { id: "trending", type: "series", name: "Trending Series" },
              {
                id: "find",
                type: "series",
                name: "Series search",
                extra: [{ name: "search" }],
              },
            ],
          },
        },
      ]),
    ),
  );
  let searched = "";
  await page.route("https://search.example/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes("/catalog/series/find/search=")) searched = path;
    return route.fulfill({
      json: {
        metas: path.includes("/catalog/series/find/search=")
          ? [{ ...meta, id: "tt7587890", name: "The Rookie", type: "series" }]
          : [],
      },
    });
  });
  await page.goto("/#discover");
  await page.getByRole("button", { name: "Series" }).click();
  await page.getByLabel("Search titles or channels").fill("the rookie");
  await expect(page.locator(".media-card strong")).toHaveText("The Rookie");
  expect(searched).toContain("search=the%20rookie");
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.getByLabel("Catalog")).toHaveValue(/trending/);
});
test("home search covers movies and series and offers a spelling correction", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:addons",
      JSON.stringify([
        {
          base: "https://smart-search.example",
          manifest: {
            id: "smart-search-test",
            name: "Smart search test",
            types: ["movie", "series"],
            resources: ["catalog", "meta"],
            catalogs: [
              {
                id: "find",
                type: "movie",
                name: "Movie search",
                extra: [{ name: "search" }],
              },
              {
                id: "find",
                type: "series",
                name: "Series search",
                extra: [{ name: "search" }],
              },
            ],
          },
        },
      ]),
    ),
  );
  const searches: string[] = [];
  await page.route("https://api.themoviedb.org/3/search/multi**", (route) => {
    const query = new URL(route.request().url()).searchParams.get("query");
    return route.fulfill({
      json: {
        results:
          query === "secre" || query === "Madam Secretary"
            ? [
                {
                  id: 61378,
                  media_type: "tv",
                  name: "Madam Secretary",
                  first_air_date: "2014-09-21",
                },
              ]
            : [],
      },
    });
  });
  await page.route("https://smart-search.example/**", (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path.includes("/search=")) searches.push(path);
    return route.fulfill({
      json: {
        metas:
          path.includes("/catalog/series/") &&
          path.includes("search=Madam Secretary")
            ? [
                {
                  ...meta,
                  id: "tt3501074",
                  name: "Madam Secretary",
                  type: "series",
                },
              ]
            : [],
      },
    });
  });
  await page.goto("/#home");
  await page.getByLabel("Search titles or channels").fill("madame secretery");
  await expect(page).toHaveURL(/#discover/);
  await expect(page.getByRole("button", { name: "All" })).toHaveClass(
    /selected/,
  );
  await expect(
    page.getByText("Showing results for Madam Secretary"),
  ).toBeVisible();
  await expect(page.locator(".media-card strong").first()).toHaveText(
    "Madam Secretary",
  );
  await expect
    .poll(() => searches.some((path) => path.includes("/catalog/movie/")))
    .toBe(true);
  await expect
    .poll(() => searches.some((path) => path.includes("/catalog/series/")))
    .toBe(true);
  await page.getByRole("button", { name: "Movies" }).click();
  await expect(page.getByText("Nothing found this time")).toBeVisible();
  await page.getByRole("button", { name: "Series" }).click();
  await expect(page.locator(".media-card strong").first()).toHaveText(
    "Madam Secretary",
  );
  await page
    .getByRole("button", { name: "Search instead for madame secretery" })
    .click();
  await expect(
    page.getByText("Searching instead for madame secretery"),
  ).toBeVisible();
  await expect
    .poll(() =>
      searches.some((path) => path.includes("search=madame secretery")),
    )
    .toBe(true);
});
test("browser-incompatible MKV is normalized before playback", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            seeders: 100,
            url: "https://cdn.example/the-rookie.mkv",
          },
        ],
      },
    }),
  );
  const prepared: Record<string, unknown>[] = [];
  await page.route("https://playback.example/prepare", async (route) => {
    prepared.push(route.request().postDataJSON());
    await route.fulfill({ json: { path: "/media/rookie/index.m3u8" } });
  });
  await page.route(
    "https://playback.example/media/rookie/index.m3u8",
    (route) =>
      route.fulfill({
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-ENDLIST\n",
      }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => prepared[0]?.mode).toBe("transcode");
  expect(prepared[0].live).toBe(false);
  expect(prepared[0].start).toBe(0);
  expect(prepared[0].url).toBe("https://cdn.example/the-rookie.mkv");
  await expect(
    page.getByRole("button", { name: "Rewind 10 seconds" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Fast forward 10 seconds" }),
  ).toBeVisible();
  await page.getByLabel("Playback position").evaluate((element) => {
    const input = element as HTMLInputElement;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, "3600");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await expect(page.getByLabel("Preparing playback")).toHaveCount(0);
  await expect(page.locator("dialog.tv-web-player")).toBeVisible();
  await expect.poll(() => prepared.at(-1)?.start).toBe(3600);
  await expect(page.locator("video")).not.toHaveAttribute("controls", "");
});
test("tapping the video surface hides and restores web player controls", async ({
  page,
}, testInfo) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            url: "https://cdn.example/control-toggle.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/control-toggle.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const player = page.locator("dialog.tv-web-player");
  await expect(player).toBeVisible();
  const video = player.locator("video");
  await expect(player.locator(".player-control-toggle-surface")).toHaveCount(0);
  const viewport = page.viewportSize()!;
  const point = {
    x: Math.round(viewport.width / 2),
    y: Math.round(viewport.height * 0.35),
  };
  if (testInfo.project.name === "iphone" || testInfo.project.name === "ipad")
    await video.tap({ position: point });
  else await video.click({ position: point });
  await expect(player).toHaveClass(/controls-hidden/);
  if (testInfo.project.name === "iphone" || testInfo.project.name === "ipad") {
    await video.tap({ position: point });
  } else {
    await page.mouse.move(point.x + 8, point.y + 8);
  }
  await expect(player).not.toHaveClass(/controls-hidden/);
  if (
    testInfo.project.name === "desktop" ||
    testInfo.project.name === "firefox"
  ) {
    await player
      .locator("video")
      .evaluate((video) => video.dispatchEvent(new Event("play")));
    await page.mouse.move(point.x + 4, point.y + 4);
    await expect(player).not.toHaveClass(/controls-hidden/);
    await page.waitForTimeout(3700);
    await expect(player).toHaveClass(/controls-hidden/);
  }
});
test("holding the mobile video temporarily applies the configured speed", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone" && testInfo.project.name !== "ipad",
    "Hold-to-speed is an iPhone/iPad touch player gesture.",
  );
  await streamingAddon(page);
  await page.addInitScript(() => {
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            url: "https://cdn.example/hold-speed.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/hold-speed.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const player = page.locator("dialog.tv-web-player");
  const video = player.locator("video");
  await expect(player).toBeVisible();
  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        pointerId: 41,
        pointerType: "touch",
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect(player.getByText("2× speed")).toBeVisible();
  await expect
    .poll(() => video.evaluate((element) => element.playbackRate))
    .toBe(2);
  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        pointerId: 41,
        pointerType: "touch",
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
  });
  await expect(player.getByText("2× speed")).toBeHidden();
  await expect
    .poll(() => video.evaluate((element) => element.playbackRate))
    .toBe(1);
});
test("mobile player gestures seek and adjust display levels without changing source", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone" && testInfo.project.name !== "ipad",
    "Surface gestures target the iPhone/iPad touch player.",
  );
  await streamingAddon(page);
  await page.addInitScript(() => {
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  let sourceRequests = 0;
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) => {
    sourceRequests += 1;
    return route.fulfill({
      json: {
        streams: [
          {
            name: "1080p direct",
            url: "https://cdn.example/gesture-player.mp4",
          },
        ],
      },
    });
  });
  await page.route("https://cdn.example/gesture-player.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  const player = page.locator("dialog.tv-web-player");
  const video = player.locator("video");
  await expect(player).toBeVisible();
  await video.evaluate((element) => {
    Object.defineProperty(element, "duration", {
      configurable: true,
      value: 7200,
    });
    Object.defineProperty(element, "seekable", {
      configurable: true,
      value: { length: 1, start: () => 0, end: () => 7200 },
    });
    element.currentTime = 600;
    element.dispatchEvent(new Event("durationchange"));
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBe(600);

  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * 0.85;
    const y = rect.top + rect.height / 2;
    for (const pointerId of [49, 50]) {
      element.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          pointerId,
          pointerType: "touch",
          clientX: x,
          clientY: y,
        }),
      );
      element.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          pointerId,
          pointerType: "touch",
          clientX: x,
          clientY: y,
        }),
      );
    }
  });
  await expect(player.getByTestId("player-gesture-feedback")).toContainText(
    "+10s",
  );
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBe(610);
  await video.evaluate((element) =>
    element.dispatchEvent(new Event("timeupdate")),
  );
  expect(sourceRequests).toBe(1);

  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    for (const [type, clientX] of [
      ["pointerdown", x],
      ["pointermove", x + rect.width * 0.25],
      ["pointerup", x + rect.width * 0.25],
    ] as const)
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 51,
          pointerType: "touch",
          clientX,
          clientY: y,
        }),
      );
  });
  await expect(player.getByTestId("player-gesture-feedback")).toContainText(
    "+",
  );
  await expect
    .poll(() => video.evaluate((element) => element.currentTime))
    .toBeGreaterThan(610);
  expect(sourceRequests).toBe(1);

  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * 0.15;
    const y = rect.top + rect.height / 2;
    for (const [type, clientY] of [
      ["pointerdown", y],
      ["pointermove", y + rect.height * 0.25],
      ["pointerup", y + rect.height * 0.25],
    ] as const)
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 52,
          pointerType: "touch",
          clientX: x,
          clientY,
        }),
      );
  });
  await expect(player.getByTestId("player-gesture-feedback")).toContainText(
    "Brightness",
  );
  await expect
    .poll(() => video.evaluate((element) => element.style.filter))
    .toMatch(/^brightness\(0\./);

  await video.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width * 0.85;
    const y = rect.top + rect.height / 2;
    for (const [type, clientY] of [
      ["pointerdown", y],
      ["pointermove", y + rect.height * 0.25],
      ["pointerup", y + rect.height * 0.25],
    ] as const)
      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          pointerId: 53,
          pointerType: "touch",
          clientX: x,
          clientY,
        }),
      );
  });
  await expect(player.getByTestId("player-gesture-feedback")).toContainText(
    "Volume",
  );
  await expect
    .poll(() => video.evaluate((element) => element.volume))
    .toBeLessThan(1);
  expect(sourceRequests).toBe(1);
});
test("TV playback opens as a full-screen remote-controlled surface", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "The ten-foot player targets the Chromium Android TV shell.",
  );
  await streamingAddon(page);
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "TV test stream",
            url: "https://cdn.example/tv-player.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/tv-player.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/?tv=1");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();

  const player = page.locator("dialog.tv-player-surface");
  await expect(player).toBeVisible();
  await expect(player.getByLabel("Playback controls")).toBeVisible();
  const box = await player.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
  expect(Math.round(box?.width ?? 0)).toBe(viewport?.width);
  expect(Math.round(box?.height ?? 0)).toBe(viewport?.height);

  await player
    .locator("video")
    .evaluate((video) => video.dispatchEvent(new Event("play")));
  await page.waitForTimeout(3700);
  await expect(player).toHaveClass(/controls-hidden/);
  await page.keyboard.press("Enter");
  await expect(player).not.toHaveClass(/controls-hidden/);

  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("button", { name: /^(Pause|Play)$/ }),
  ).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByLabel("Fast forward 10 seconds")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(player).toBeHidden();
});
test("subtitle timing controls persist the selected offset", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await streamingAddon(page);
  await page.addInitScript(() => {
    const addons = JSON.parse(localStorage.getItem("nuvio:addons") || "[]");
    addons[0].manifest.resources.push("subtitles");
    localStorage.setItem("nuvio:addons", JSON.stringify(addons));
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ preferredSubtitleLanguage: "en" }),
    );
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p English",
            url: "https://cdn.example/subtitle-test.mp4",
            subtitles: [
              {
                id: "source-english",
                url: "https://subs.example/source.vtt",
                lang: "eng",
                name: "Source English",
              },
            ],
            behaviorHints: {
              filename: "The.Test.Movie.1080p.mkv",
              videoHash: "0123456789abcdef",
              videoSize: 123456789,
            },
          },
        ],
      },
    }),
  );
  let subtitleRequestUrl = "";
  await page.route("https://v3-cinemeta.strem.io/subtitles/**", (route) => {
    subtitleRequestUrl = route.request().url();
    return route.fulfill({
      json: {
        subtitles: [
          { url: "https://subs.example/en.vtt", lang: "eng", name: "English" },
          {
            url: "https://subs.example/es.vtt",
            lang: "spa",
            name: "Addon",
          },
        ],
      },
    });
  });
  await page.route("https://subs.example/**", (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:01.000 --> 00:00:18.000 line:20% position:95% align:end\nTranscribed: Hello\n\n00:00:03.000 --> 00:00:12.000\nTranscribed: Next line\n\n00:20:00.000 --> 00:20:20.000\nTranscribed: The distant matching line",
    }),
  );
  await page.route("https://cdn.example/subtitle-test.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openPlaybackOptions(page);
  await expect
    .poll(() => subtitleRequestUrl)
    .toContain("videoHash=0123456789abcdef");
  expect(decodeURIComponent(subtitleRequestUrl)).toContain(
    "filename=The.Test.Movie.1080p.mkv",
  );
  await expect(page.getByLabel("Subtitle language")).toContainText(
    "Source · Source English",
  );
  await expect(page.getByLabel("Subtitle language")).toContainText(
    "Add-on · Spanish",
  );
  await expect(
    page.getByRole("button", { name: "Show subtitles later" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show subtitles later" }).click();
  await page.getByRole("button", { name: "Show subtitles later" }).click();
  await expect(
    page.getByRole("button", { name: "Reset subtitle timing" }),
  ).toHaveText("+1.0s");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("tiktak:subtitle-offset:tt-test:movie"),
      ),
    )
    .toBe("1");
  await page.getByLabel("Subtitle timing increment").selectOption("2");
  await page.getByRole("button", { name: "Show subtitles later" }).click();
  await expect(
    page.getByRole("button", { name: "Reset subtitle timing" }),
  ).toHaveText("+3.0s");
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("tiktak:subtitle-increment")),
    )
    .toBe("2");
  await page.getByRole("button", { name: "Reset subtitle timing" }).click();
  const video = page.locator("video");
  await video.evaluate((element) => {
    element.addTextTrack("subtitles", "Embedded English", "en");
    Object.defineProperty(element, "currentTime", {
      configurable: true,
      writable: true,
      value: 10,
    });
  });
  await expect(page.getByLabel("Subtitle language")).toContainText(
    "Built-in · Embedded English",
  );
  await page.getByLabel("Subtitle language").selectOption("embedded:0");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("tiktak:subtitle-selection:tt-test") ?? "null",
          )?.type,
      ),
    )
    .toBe("embedded");
  await expect
    .poll(() =>
      video.evaluate(
        (element) =>
          Array.from(element.textTracks).find(
            (track) => track.label === "Embedded English",
          )?.mode,
      ),
    )
    .toBe("hidden");
  await video.evaluate((element) => {
    const track = Array.from(element.textTracks).find(
      (candidate) => candidate.label === "Embedded English",
    )!;
    const oldCue = new VTTCue(0, 30, "Transcribed: Old overlapping line");
    const latestCue = new VTTCue(
      9,
      30,
      "<00:00:09.000><c.green>Transcribed: Newest centered line</c>",
    );
    Object.defineProperty(track, "activeCues", {
      configurable: true,
      value: { 0: oldCue, 1: latestCue, length: 2 },
    });
    track.dispatchEvent(new Event("cuechange"));
  });
  const renderedCue = page.locator(".player-subtitle-overlay");
  await expect(renderedCue).toHaveText("Newest centered line");
  await expect(renderedCue).not.toContainText("Transcribed:");
  await expect(renderedCue).not.toContainText("Old overlapping line");
  const cueBox = await renderedCue.boundingBox();
  const viewport = page.viewportSize()!;
  expect(
    Math.abs((cueBox?.x ?? 0) + (cueBox?.width ?? 0) / 2 - viewport.width / 2),
  ).toBeLessThan(3);
  const mediaSource = await video.getAttribute("src");
  await page.getByLabel("Subtitle language").selectOption("external:0");
  await expect(video.locator("track")).toHaveCount(0);
  await expect(video).toHaveAttribute("src", mediaSource!);
  await video.evaluate((element) => {
    Object.defineProperty(element, "currentTime", {
      configurable: true,
      writable: true,
      value: 2,
    });
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect(renderedCue).toHaveText("Hello");
  await video.evaluate((element) => {
    element.currentTime = 10;
    element.dispatchEvent(new Event("timeupdate"));
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem("tiktak:subtitle-selection:tt-test") ?? "null",
          )?.type,
      ),
    )
    .toBe("external");
  await page
    .getByRole("button", { name: "Capture dialogue for subtitle sync" })
    .click();
  const cuePicker = page.getByRole("dialog", {
    name: "Choose the matching subtitle line",
  });
  await expect(cuePicker).toBeVisible();
  await expect(
    cuePicker.getByRole("button", { name: /20:00 The distant matching line/ }),
  ).toHaveCount(0);
  await cuePicker
    .getByLabel("Search subtitle dialogue")
    .fill("distant matching");
  await cuePicker.getByLabel("Search subtitle dialogue").press("Enter");
  const distantResult = cuePicker.getByRole("button", {
    name: /20:00 The distant matching line/,
  });
  await expect(distantResult).toBeVisible();
  await expect(distantResult).toBeFocused();
  await cuePicker.getByLabel("Search subtitle dialogue").fill("");
  const matchingCue = cuePicker.getByRole("button", { name: /0:01 Hello/ });
  await expect(matchingCue).toBeInViewport();
  await matchingCue.click();
  await expect(cuePicker).toBeHidden();
  const timingNotice = page.getByText("Subtitle timing set to +9.0s.", {
    exact: true,
  });
  await expect(timingNotice).toBeVisible();
  await expect(timingNotice).toHaveCount(0, { timeout: 4_000 });
  await expect(
    page.getByText(
      "Playback paused. Select the subtitle line that matches the dialogue you just heard.",
    ),
  ).toHaveCount(0);
  await openPlaybackOptions(page);
  await expect(
    page.getByRole("button", { name: "Reset subtitle timing" }),
  ).toHaveText("+9.0s");
  await expect
    .poll(() =>
      page.evaluate(() =>
        localStorage.getItem("tiktak:subtitle-offset:tt-test:movie"),
      ),
    )
    .toBe("9");
  await page
    .getByRole("button", { name: "Capture dialogue for subtitle sync" })
    .click();
  await expect(cuePicker).toBeVisible();
  await video.evaluate((element) => element.dispatchEvent(new Event("play")));
  await expect(cuePicker).toBeHidden();
  await expect(
    page.getByText(
      "Playback paused. Select the subtitle line that matches the dialogue you just heard.",
    ),
  ).toHaveCount(0);
});
test("subtitle auto mode respects Off and forced-subtitle preferences", async ({
  page,
}) => {
  test.setTimeout(45_000);
  await streamingAddon(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("tiktak:nuvio-web-settings")) return;
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({
        preferredSubtitleLanguage: "none",
        secondaryPreferredSubtitleLanguage: "none",
        useForcedSubtitles: false,
      }),
    );
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            url: "https://cdn.example/forced-subtitle.mp4",
            subtitles: [
              {
                id: "forced-en",
                url: "https://subs.example/forced-en.vtt",
                lang: "en",
                name: "English Forced",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("https://subs.example/forced-en.vtt", (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nForced line",
    }),
  );
  await page.route("https://cdn.example/forced-subtitle.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  const openPlayer = async () => {
    await page.getByRole("button", { name: "Explore title" }).click();
    await page.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator("dialog.tv-web-player")).toBeVisible();
  };
  await page.goto("/");
  await openPlayer();
  await expect(page.getByLabel("Subtitle language")).toHaveValue("off", {
    timeout: 6_000,
  });
  expect(
    await page.evaluate(() =>
      localStorage.getItem("tiktak:subtitle-selection:tt-test"),
    ),
  ).toBeNull();

  await page.getByRole("button", { name: "Close player" }).click();
  await page.evaluate(() => {
    const current = JSON.parse(
      localStorage.getItem("tiktak:nuvio-web-settings") ?? "{}",
    );
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ ...current, useForcedSubtitles: true }),
    );
  });
  await page.reload();
  await openPlayer();
  await expect(page.getByLabel("Subtitle language")).toHaveValue("external:0", {
    timeout: 6_000,
  });
});
test("autoplay skips resolved HEVC and MKV files when a browser-ready MP4 exists", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
    const sources: string[] = [];
    const capture = (node: Node) => {
      if (node instanceof HTMLVideoElement && node.src) sources.push(node.src);
      if (node instanceof Element)
        node.querySelectorAll("video[src]").forEach((video) => {
          if (video.src) sources.push(video.src);
        });
    };
    new MutationObserver((records) =>
      records.forEach((record) => {
        if (record.type === "attributes") capture(record.target);
        record.addedNodes.forEach(capture);
      }),
    ).observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src"],
    });
    Object.defineProperty(window, "__testMediaSources", { value: sources });
    // Empty MP4 route fixtures cannot decode. This test verifies source
    // selection, so keep that synthetic decode error from exercising the
    // separate runtime recovery path.
    const add = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype.addEventListener = function (
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      if (type === "error") return;
      return add.call(this, type, listener, options);
    };
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "[TB+] Torrentio 1080p",
            title: "Episode.1080p.x265 seeders: 230",
            url: "https://cdn.example/episode.x265.mp4",
          },
          {
            name: "[TB+] Torrentio 720p",
            title: "Episode.720p.x264 seeders: 170",
            url: "https://cdn.example/resolve",
            behaviorHints: { filename: "Episode.720p.x264.mkv" },
          },
          {
            name: "[TB+] Torrentio 720p",
            title: "Episode.720p.x264.AAC seeders: 120",
            url: "https://cdn.example/episode.x264.mp4",
          },
        ],
      },
    }),
  );
  let prepareRequests = 0;
  await page.route("https://playback.example/prepare", async (route) => {
    prepareRequests += 1;
    await route.fulfill({ json: { path: "/media/rookie/index.m3u8" } });
  });
  await page.route(
    "https://playback.example/media/rookie/index.m3u8",
    (route) =>
      route.fulfill({
        contentType: "application/vnd.apple.mpegurl",
        body: "#EXTM3U\n#EXT-X-ENDLIST\n",
      }),
  );
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __testMediaSources?: string[] })
            .__testMediaSources,
      ),
    )
    .toContain("https://cdn.example/episode.x264.mp4");
  expect(prepareRequests).toBe(0);
});
test("Watch Together creates a shareable room from the resolved source", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p",
            seeders: 100,
            url: "https://cdn.example/movie.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://cdn.example/movie.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  let createRequest: Record<string, unknown> = {};
  let sharedPlayback: Record<string, unknown> = {};
  await page.route("https://playback.example/party", async (route) => {
    const request = route.request().postDataJSON();
    if (request.action === "create") {
      createRequest = request;
      sharedPlayback = request.playback as Record<string, unknown>;
    }
    await route.fulfill({
      json: {
        id: "abcdefghijklmnopqrstuvwx",
        host: true,
        participants: 1,
        playback: sharedPlayback,
        state: {
          position: 0,
          paused: false,
          updatedAt: Date.now(),
          serverTime: Date.now(),
          revision: 1,
        },
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await openPlaybackOptions(page);
  await page.getByRole("button", { name: "Watch Together" }).click();
  await expect(
    page.getByText("You control this room", { exact: false }),
  ).toBeVisible({ timeout: 10_000 });
  expect(createRequest.action).toBe("create");
  expect((createRequest.playback as Record<string, unknown>).url).toBe(
    "https://cdn.example/movie.mp4",
  );
  await expect(page).toHaveURL(/party=abcdefghijklmnopqrstuvwx/);
});
test("a Watch Together invite opens the host source and timeline", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "fake-private-key",
        mode: "direct",
      }),
    ),
  );
  await page.route("https://playback.example/party", async (route) => {
    const request = route.request().postDataJSON();
    expect(["join", "state"]).toContain(request.action);
    await route.fulfill({
      json: {
        id: "abcdefghijklmnopqrstuvwx",
        host: false,
        participants: 2,
        playback: {
          item: {
            id: "tt-test",
            name: "The Test Movie",
            type: "movie",
            source: "addon",
          },
          url: "https://cdn.example/party.mp4",
          prepared: true,
        },
        state: {
          position: 84,
          paused: true,
          updatedAt: Date.now(),
          serverTime: Date.now(),
          revision: 2,
        },
      },
    });
  });
  await page.route("https://cdn.example/party.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/?party=abcdefghijklmnopqrstuvwx#home");
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "The Test Movie" }),
  ).toBeVisible();
  await expect(
    page.getByText("Following the host", { exact: false }),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/party.mp4",
  );
});
test("queues the best ranked movie download without blocking the app", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "x".repeat(40),
        mode: "direct",
      }),
    ),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "4K low seeds",
            seeders: 3,
            url: "https://cdn.example/4k.mkv",
          },
          {
            name: "720p most seeds",
            seeders: 200,
            url: "https://cdn.example/best.mkv",
          },
          {
            name: "480p high seeds",
            seeders: 999,
            url: "https://cdn.example/sd.mkv",
          },
        ],
      },
    }),
  );
  let requested: Record<string, unknown> = {};
  const downloadJobId = "a".repeat(32);
  const statusPath = `/media/${downloadJobId}/status.json`;
  const downloadPath = `/media/${downloadJobId}/download.mp4`;
  await page.route("https://playback.example/download", async (route) => {
    requested = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      status: 202,
      json: { status: "preparing", statusPath, path: downloadPath },
    });
  });
  let statusReady = false;
  await page.route(`https://playback.example${statusPath}`, (route) =>
    route.fulfill({
      json: statusReady
        ? {
            status: "ready",
            statusPath,
            path: downloadPath,
            bytes: 3,
          }
        : { status: "preparing", statusPath, bytes: 1 },
    }),
  );
  let mediaRequests = 0;
  await page
    .context()
    .route(`https://playback.example${downloadPath}`, (route) => {
      mediaRequests += 1;
      return route.fulfill({
        contentType: "video/mp4",
        headers: {
          "Content-Disposition": 'attachment; filename="The Test Movie.mp4"',
          "Content-Length": "3",
          "Accept-Ranges": "bytes",
        },
        body: "mp4",
      });
    });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect(page.locator(".detail-preparing")).toHaveCount(0);
  await expect.poll(() => requested.url).toBe("https://cdn.example/4k.mkv");
  expect(requested.filename).toBe("The Test Movie.mp4");
  const before = page.url();
  await page.getByRole("button", { name: "View download manager" }).click();
  await expect(
    page.getByText("Copying the source into a complete MP4", { exact: false }),
  ).toBeVisible();
  expect(mediaRequests).toBe(0);
  await page.reload();
  statusReady = true;
  await page.getByRole("button", { name: /^Downloads/ }).click();
  await expect(
    page.getByRole("link", { name: /Download MP4|Open MP4 \/ Save to Files/ }),
  ).toHaveAttribute("href", `https://playback.example${downloadPath}`);
  expect(new URL(page.url()).origin).toBe(new URL(before).origin);
  expect(new URL(page.url()).hash).toBe("#settings");
  expect(page.url()).not.toContain("about:blank");
  expect(mediaRequests).toBe(0);
});
test("source regex survives a complete settings reload", async ({ page }) => {
  const regex = "Debridio (2160p|4k|1440p|1080p|720p)";
  await page.goto("/#settings");
  await page.getByRole("button", { name: /^Streams/ }).click();
  await page.getByLabel("Automatic source selection").selectOption("regex");
  await page.getByLabel("Selection delay").selectOption("0");
  await page.getByLabel("Custom stream regex").fill(regex);
  await page.getByLabel("Reuse the last working link").check();
  await page.getByRole("button", { name: "Save stream settings" }).click();
  await expect(page.getByText(/saved to this TikTakTV profile/)).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        JSON.parse(localStorage.getItem("tiktak:stream-preferences") ?? "{}"),
      ),
    )
    .toMatchObject({
      autoPlayMode: "regex",
      autoPlayRegex: regex,
      autoPlayTimeoutSeconds: 0,
      reuseLastLink: true,
      updatedAt: expect.any(Number),
    });

  await page.reload();
  await page.getByRole("button", { name: /^Streams/ }).click();
  await expect(page.getByLabel("Automatic source selection")).toHaveValue(
    "regex",
  );
  await expect(page.getByLabel("Custom stream regex")).toHaveValue(regex);
  await expect(page.getByLabel("Selection delay")).toHaveValue("0");
  await expect(page.getByLabel("Reuse the last working link")).toBeChecked();
});

test("source controls accept and persist multiple comma-separated exclusions", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /^Streams/ }).click();
  const excluded = page.getByLabel("Excluded terms (comma separated)");
  await page
    .getByLabel("Selection delay")
    .selectOption(String(Number.MAX_SAFE_INTEGER));
  await excluded.fill("CAM");
  await excluded.pressSequentially(", telesync, dubbed");
  await expect(excluded).toHaveValue("CAM, telesync, dubbed");
  await page.getByRole("button", { name: "Save stream settings" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tiktak:stream-preferences") ?? "{}")
            .excludedTerms,
      ),
    )
    .toEqual(["CAM", "telesync", "dubbed"]);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tiktak:stream-preferences") ?? "{}")
            .autoPlayTimeoutSeconds,
      ),
    )
    .toBe(Number.MAX_SAFE_INTEGER);

  await page.reload();
  await page.getByRole("button", { name: /^Streams/ }).click();
  await expect(page.getByLabel("Excluded terms (comma separated)")).toHaveValue(
    "CAM, telesync, dubbed",
  );
  await expect(page.getByLabel("Selection delay")).toHaveValue(
    String(Number.MAX_SAFE_INTEGER),
  );
});

test("Download Center groups and cancels background preparation", async ({
  page,
}) => {
  const statusPath = `/media/${"c".repeat(32)}/status.json`;
  await page.addInitScript(
    ({ statusPath }) => {
      localStorage.setItem(
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "private-test-key",
        }),
      );
      localStorage.setItem(
        "nuvio:downloads:local",
        JSON.stringify([
          {
            id: "download-active",
            name: "Friends S01E01.mp4",
            status: "preparing",
            detail: "Copying source in the background.",
            at: Date.now(),
            statusPath,
          },
        ]),
      );
    },
    { statusPath },
  );
  let cancelled = "";
  await page.route(
    "https://playback.example/download/cancel",
    async (route) => {
      cancelled = String(route.request().postDataJSON().statusPath);
      await route.fulfill({ json: { cancelled: true } });
    },
  );
  await page.route(`https://playback.example${statusPath}`, (route) =>
    route.fulfill({
      json: {
        status: "preparing",
        stage: "copy",
        bytes: 1024,
        progressSeconds: 4,
      },
    }),
  );

  await page.goto("/#settings");
  await page.getByRole("button", { name: /^Downloads/ }).click();
  await expect(page.getByRole("heading", { name: "Active" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel Friends S01E01.mp4" }).click();
  await expect.poll(() => cancelled).toBe(statusPath);
  await expect(page.getByText("Friends S01E01.mp4")).toHaveCount(0);
});

test("mobile Settings uses a readable drill-in menu and flush bottom navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/#settings");
  const navigation = page.getByRole("navigation", {
    name: "Settings sections",
  });
  await expect(navigation).toBeVisible();
  await expect(page.locator(".settings-panels")).toBeHidden();
  const navLayout = await navigation.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: innerWidth,
    buttonsFit: [...element.querySelectorAll("button")].every(
      (button) =>
        button.getBoundingClientRect().left >= 0 &&
        button.getBoundingClientRect().right <= innerWidth + 1,
    ),
  }));
  expect(navLayout.documentWidth).toBeLessThanOrEqual(navLayout.viewportWidth);
  expect(navLayout.width).toBeLessThanOrEqual(navLayout.viewportWidth);
  expect(navLayout.buttonsFit).toBe(true);
  await navigation.getByRole("button", { name: /^Streams/ }).click();
  await expect(navigation).toBeHidden();
  await expect(page.locator(".settings-panels")).toBeVisible();
  await page.getByRole("button", { name: "Back to settings" }).click();
  await expect(navigation).toBeVisible();
  await expect(page.locator(".settings-owner-strip")).not.toContainText(
    /profile:[a-f0-9-]+:\d+/i,
  );
  const bottom = await page.locator(".bottom-nav").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: Math.round(rect.left),
      right: Math.round(innerWidth - rect.right),
      bottom: Math.round(innerHeight - rect.bottom),
      radius: getComputedStyle(element).borderRadius,
    };
  });
  expect(bottom).toEqual({ left: 0, right: 0, bottom: 0, radius: "0px" });
});

test("TikTakTV appearance settings immediately reshape the shell and survive reload", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await page.getByLabel("Navigation style").selectOption("rail");
  await page.getByLabel("Poster size").selectOption("large");
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((element) =>
          Math.round(element.getBoundingClientRect().width),
        ),
    )
    .toBe(220);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.nuvioPosterSize),
    )
    .toBe("large");

  await page.reload();
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((element) =>
          Math.round(element.getBoundingClientRect().width),
        ),
    )
    .toBe(220);
  await page.getByRole("button", { name: /^Appearance/ }).click();
  await expect(page.getByLabel("Navigation style")).toHaveValue("rail");
  await expect(page.getByLabel("Poster size")).toHaveValue("large");
  await page.goto("/#home");
  const catalogHeading = page
    .locator(".home-content > .media-row .row-heading h2")
    .first();
  await expect(catalogHeading.locator("small")).toContainText(/Movies|Series/);
  await expect
    .poll(() =>
      catalogHeading.evaluate(
        (element) => getComputedStyle(element, "::after").width,
      ),
    )
    .toBe("28px");
});

test("Home hero artwork preference switches from backdrop to poster", async ({
  page,
}) => {
  await page.route("https://v3-cinemeta.strem.io/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const illustrated = {
      ...meta,
      poster: "https://images.example/poster.jpg",
      background: "https://images.example/backdrop.jpg",
    };
    return route.fulfill({
      json: path.includes("/meta/")
        ? { meta: illustrated }
        : { metas: [illustrated] },
    });
  });
  await page.route("https://images.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("nuvio:tmdb-key", "test-key");
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ heroArtwork: "poster", updatedAt: Date.now() }),
    );
  });
  await page.goto("/#home");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("tiktak:nuvio-web-settings") || "{}")
            .heroArtwork,
      ),
    )
    .toBe("poster");
  const hero = page.locator(".hero-image");
  await expect(hero).toHaveClass(/hero-image-poster/);
  await expect(hero.locator("img")).toHaveAttribute(
    "src",
    "https://images.example/poster.jpg",
  );
});

test("Home motion preview loads muted and enables sound after a click", async ({
  page,
}, testInfo) => {
  test.skip(
    !["desktop", "iphone", "ipad"].includes(testInfo.project.name),
    "Desktop, iPhone, and iPad cover browser and PWA behavior.",
  );
  const illustrated = {
    ...meta,
    id: "tmdb:278",
    poster: "https://images.example/poster.jpg",
    background: "https://images.example/backdrop.jpg",
  };
  await page.route("https://v3-cinemeta.strem.io/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.includes("/meta/")
        ? { meta: illustrated }
        : { metas: [illustrated] },
    });
  });
  await page.route("https://api.themoviedb.org/3/movie/278/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/external_ids")
        ? { imdb_id: "tt0111161" }
        : path.endsWith("/videos")
          ? {
              results: [
                {
                  id: "trailer",
                  site: "YouTube",
                  type: "Trailer",
                  key: "preview123",
                  name: "Official trailer",
                },
              ],
            }
          : path.endsWith("/recommendations")
            ? { results: [] }
            : { production_companies: [] },
    });
  });
  await page.route("https://api.themoviedb.org/3/find/tt0111161**", (route) =>
    route.fulfill({
      json: { movie_results: [{ id: 278 }], tv_results: [] },
    }),
  );
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html>" }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("nuvio:tmdb-key", "test-key");
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({
        motionPreviews: true,
        motionPreviewSound: true,
        heroAutoScroll: false,
        updatedAt: Date.now(),
      }),
    );
  });
  await page.goto("/#home");
  const preview = page.locator("iframe.hero-motion-preview");
  await expect(preview).toHaveAttribute("src", /preview123.*mute=1/, {
    timeout: 10_000,
  });
  await page.getByRole("button", { name: "Preview sound" }).click();
  await expect(preview).toHaveAttribute("src", /preview123.*mute=0/);
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Official trailer" }).click();
  const trailerPlayer = page.getByRole("dialog", {
    name: "Official trailer trailer",
  });
  await expect(trailerPlayer).toBeVisible();
  await expect(trailerPlayer.locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/preview123/,
  );
  expect(new URL(page.url()).hash).toBe("#home");
  await expect(page.locator(".youtube-page")).toHaveCount(0);
  await trailerPlayer.getByRole("button", { name: "Close trailer" }).click();
  await expect(page.getByRole("dialog", { name: /details$/ })).toBeVisible();
});

test("details resolve trailers through the TikTakTV in-app player", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One browser verifies companion trailer resolution.",
  );
  const illustrated = { ...meta, id: "tmdb:278" };
  await page.route("https://v3-cinemeta.strem.io/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.includes("/meta/")
        ? { meta: illustrated }
        : { metas: [illustrated] },
    });
  });
  await page.route("https://api.themoviedb.org/3/movie/278/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/external_ids")
        ? { imdb_id: "tt0111161" }
        : path.endsWith("/videos")
          ? {
              results: [
                {
                  id: "trailer",
                  site: "YouTube",
                  type: "Trailer",
                  key: "preview123",
                  name: "Official trailer",
                },
              ],
            }
          : path.endsWith("/recommendations")
            ? { results: [] }
            : { production_companies: [] },
    });
  });
  await page.route("https://api.themoviedb.org/3/find/tt0111161**", (route) =>
    route.fulfill({
      json: { movie_results: [{ id: 278 }], tv_results: [] },
    }),
  );
  await page.addInitScript(() => {
    localStorage.setItem("nuvio:tmdb-key", "test-key");
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "x".repeat(40),
      }),
    );
  });
  let resolvedVideo = "";
  await page.route(
    "https://playback.example/youtube/playback",
    async (route) => {
      resolvedVideo = String(route.request().postDataJSON().videoId ?? "");
      await route.fulfill({
        json: {
          playback: {
            type: "progressive",
            url: "/media/trailer-ticket/stream",
            mimeType: "video/mp4",
          },
        },
      });
    },
  );
  await page.route(
    "https://playback.example/media/trailer-ticket/stream",
    (route) =>
      route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );

  await page.goto("/#home");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Official trailer" }).click();
  const trailerPlayer = page.getByRole("dialog", {
    name: "Official trailer trailer",
  });
  await expect(trailerPlayer.locator("video")).toHaveAttribute(
    "src",
    "https://playback.example/media/trailer-ticket/stream",
  );
  expect(resolvedVideo).toBe("preview123");
  await expect(trailerPlayer.locator("iframe")).toHaveCount(0);
  expect(new URL(page.url()).hash).toBe("#home");
});

test("Feature highlights preference can suppress the update prompt", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop",
    "One browser verifies this preference.",
  );
  await page.goto("/#settings");
  await page.evaluate(() => localStorage.removeItem("tiktak:whats-new-seen"));
  await page.getByRole("button", { name: /^Appearance/ }).click();
  const preference = page.getByRole("checkbox", {
    name: /Feature highlights/,
  });
  await preference.uncheck();
  await page.waitForTimeout(1400);
  await expect(page.locator("dialog.whats-new-dialog")).toHaveCount(0);
});

test("tabbed metadata layout switches real detail sections", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({ metaTabLayout: true, updatedAt: Date.now() }),
    ),
  );
  await page.goto("/#home");
  await page.getByRole("button", { name: "Explore title" }).click();
  const details = page.locator(".detail-dialog");
  const tabs = details.getByRole("tablist", { name: "Title detail sections" });
  await expect(tabs.getByRole("tab")).toHaveText(["Overview", "More"]);
  await expect(details.locator(".description")).toBeVisible();
  await tabs.getByRole("tab", { name: "More" }).click();
  await expect(details.locator(".description")).toBeHidden();
  await tabs.getByRole("tab", { name: "Overview" }).click();
  await expect(details.locator(".description")).toBeVisible();
});

test("Continue Watching styles and upcoming episodes follow profile settings", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const base = {
      type: "series",
      source: "addon",
      provider: "https://v3-cinemeta.strem.io",
    };
    localStorage.setItem(
      "nuvio:progress",
      JSON.stringify([
        {
          item: { ...base, id: "tt-released", name: "Released Show" },
          seconds: 600,
          duration: 1800,
          at: Date.now(),
          episode: {
            id: "tt-released:1:2",
            name: "Released episode",
            season: 1,
            episode: 2,
            released: "2025-01-01T00:00:00.000Z",
          },
        },
        {
          item: { ...base, id: "tt-upcoming", name: "Upcoming Show" },
          seconds: 0,
          duration: 1800,
          at: Date.now() - 1,
          episode: {
            id: "tt-upcoming:1:3",
            name: "Upcoming episode",
            season: 1,
            episode: 3,
            released: "2099-01-01T00:00:00.000Z",
          },
        },
      ]),
    );
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({
        continueWatchingEnabled: true,
        continueWatchingStyle: "poster",
        continueWatchingSort: "split-upcoming",
        continueWatchingShowUnaired: true,
        continueWatchingBlurUpcoming: true,
        posterCornerRadius: 22,
        updatedAt: Date.now(),
      }),
    );
  });

  await page.goto("/#home");
  await expect(
    page.getByRole("heading", { name: "Pick up where you left off" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.locator(".continue-poster")).toHaveCount(2);
  await expect(
    page.locator(".continue-upcoming-row .continue-upcoming"),
  ).toContainText("Upcoming");
  await expect
    .poll(() =>
      page.evaluate(() => ({
        radius: getComputedStyle(document.documentElement).getPropertyValue(
          "--nuvio-poster-radius",
        ),
        blur: document.documentElement.dataset.nuvioBlurUpcoming,
      })),
    )
    .toEqual({ radius: "22px", blur: "true" });
});

test("TikTakTV vertical Library filters and sorts saved media", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:library",
      JSON.stringify([
        {
          id: "tt-zebra",
          name: "Zebra Movie",
          type: "movie",
          source: "addon",
          provider: "https://v3-cinemeta.strem.io",
        },
        {
          id: "tt-alpha",
          name: "Alpha Series",
          type: "series",
          source: "addon",
          provider: "https://v3-cinemeta.strem.io",
        },
      ]),
    );
    localStorage.setItem(
      "tiktak:nuvio-web-settings",
      JSON.stringify({
        libraryLayout: "vertical",
        librarySort: "title-asc",
        updatedAt: Date.now(),
      }),
    );
  });
  await page.goto("/#library");
  await expect(page.getByLabel("Library layout")).toHaveValue("vertical");
  await expect(page.getByLabel("Library sort order")).toHaveValue("title-asc");
  await expect(page.locator(".media-grid .media-card strong")).toHaveText([
    "Alpha Series",
    "Zebra Movie",
  ]);
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page.locator(".media-grid .media-card strong")).toHaveText([
    "Zebra Movie",
  ]);
});

test("Discover records, reuses, and removes profile search history", async ({
  page,
}) => {
  await page.goto("/#home");
  const search = page.getByRole("searchbox", {
    name: "Search titles or channels",
  });
  await search.fill("Friends");
  await search.press("Enter");
  await expect(page).toHaveURL(/#discover$/);
  await page.getByRole("button", { name: "Clear search" }).click();
  const recent = page.getByRole("region", { name: "Recent searches" });
  await expect(recent).toContainText("Friends");
  await recent.getByRole("button", { name: "Friends", exact: true }).click();
  await expect(search).toHaveValue("Friends");
  await page.getByRole("button", { name: "Clear search" }).click();
  await recent
    .getByRole("button", { name: "Remove Friends from recent searches" })
    .click();
  await expect(recent).toHaveCount(0);
});

test("TikTakTV integration hub maps native-only features and opens working services", async ({
  page,
}) => {
  await page.goto("/#settings");
  await page.getByLabel("Search settings").fill("Integrations");
  const settingsNavigation = page.getByRole("navigation", {
    name: "Settings sections",
  });
  await settingsNavigation
    .locator("button")
    .filter({ hasText: "Integrations" })
    .click();
  await expect(page.getByText("CloudStream repositories")).toBeVisible();
  await expect(page.getByText("Android mpv / iOS video output")).toBeVisible();
  await page.getByRole("button", { name: /Trakt Watchlist, ratings/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your own watchlist" }),
  ).toBeVisible();
});

test("friend code installs the shared add-ons, catalogs and TorBox grant", async ({
  page,
}) => {
  await page.addInitScript(() =>
    (() => {
      localStorage.setItem(
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "x".repeat(40),
        }),
      );
      localStorage.setItem(
        "nuvio:addons",
        JSON.stringify([
          {
            base: "https://obsolete.example",
            manifest: { id: "obsolete", name: "Old setup" },
          },
        ]),
      );
    })(),
  );
  await page.route("https://playback.example/friend/status", (route) =>
    route.fulfill({ json: { available: true, owner: false } }),
  );
  let submittedCode = "";
  await page.route("https://playback.example/friend/redeem", async (route) => {
    submittedCode = JSON.parse(route.request().postData() ?? "{}").code;
    await route.fulfill({
      json: {
        torboxKey: "friend:signed-grant",
        template: {
          addons: [
            {
              base: "https://v3-cinemeta.strem.io",
              manifest: {
                id: "com.linvo.cinemeta",
                name: "Owner catalog",
                resources: ["catalog", "meta", "stream"],
                types: ["movie", "series"],
                catalogs: [{ id: "top", type: "movie" }],
              },
            },
          ],
          collections: [],
          autoplay: false,
          provider: {
            server: "https://iptv.example:8080",
            username: "friend-user",
            password: "friend-password",
            scope: "friend-scope",
            name: "Family IPTV",
          },
          homeCatalogs: [
            {
              addon_id: "com.linvo.cinemeta",
              type: "movie",
              catalog_id: "top",
              enabled: true,
              order: 0,
              custom_title: "Owner picks",
            },
          ],
        },
      },
    });
  });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Playback/ }).click();
  await page.getByLabel("Friend code").fill("389853");
  await page.getByRole("button", { name: "Install setup" }).click();
  await expect(page.getByText(/Friend setup installed/)).toBeVisible();
  expect(submittedCode).toBe("389853");
  const stored = await page.evaluate(() => ({
    addons: JSON.parse(localStorage.getItem("nuvio:addons") ?? "[]"),
    catalogs: JSON.parse(localStorage.getItem("nuvio:home-catalogs") ?? "[]"),
    torbox: JSON.parse(localStorage.getItem("nuvio:torbox-key") ?? '""'),
    provider: JSON.parse(localStorage.getItem("nuvio:provider") ?? "null"),
  }));
  expect(stored.addons[0].manifest.name).toBe("Owner catalog");
  expect(stored.addons[0].base).toBe("https://v3-cinemeta.strem.io");
  expect(stored.addons).toHaveLength(1);
  expect(
    stored.addons.some((addon: { base: string }) =>
      addon.base.includes("obsolete"),
    ),
  ).toBe(false);
  expect(stored.catalogs[0].custom_title).toBe("Owner picks");
  expect(stored.torbox).toBe("friend:signed-grant");
  expect(stored.provider?.server).toBe("https://iptv.example:8080");
  expect(stored.provider?.username).toBe("friend-user");
  expect(stored.provider?.password).toBe("friend-password");
});
test("a signed-in user can publish and revoke an isolated TorBox and Real-Debrid friend code", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "x".repeat(40),
      }),
    );
    sessionStorage.setItem("nuvio:torbox-key", JSON.stringify("own-torbox"));
    sessionStorage.setItem(
      "nuvio:realdebrid-key",
      JSON.stringify("own-real-debrid"),
    );
  });
  await page.route("https://playback.example/friend/status", (route) =>
    route.fulfill({
      json: { available: true, owner: false, published: false },
    }),
  );
  let published: Record<string, unknown> = {};
  let publishCount = 0;
  await page.route("https://playback.example/friend/setup", async (route) => {
    publishCount += 1;
    published = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      json: {
        ok: true,
        torboxKey: "friend:owner-grant",
        realDebridKey: "friend-rd:owner-grant",
        ownerTorboxKey: "own-torbox",
        ownerRealDebridKey: "own-real-debrid",
      },
    });
  });
  let revoked = 0;
  await page.route("https://playback.example/friend/revoke", async (route) => {
    revoked += 1;
    await route.fulfill({
      json: {
        ok: true,
        torboxKey: "own-torbox",
        realDebridKey: "own-real-debrid",
      },
    });
  });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Playback/ }).click();
  await page.getByLabel("Your private share code").fill("654321");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText(/encrypted friend code is active/)).toBeVisible();
  expect(published.code).toBe("654321");
  expect(published.torboxKey).toBe("own-torbox");
  expect(published.realDebridKey).toBe("own-real-debrid");
  expect(publishCount).toBe(1);
  expect(
    Array.isArray((published.template as { addons?: unknown[] }).addons),
  ).toBe(true);
  await page.getByText("Manage your friend code", { exact: true }).click();
  await page.getByRole("button", { name: "Reset and remake code" }).click();
  await expect(page.getByText(/Friend code reset/)).toBeVisible();
  const recovered = await page.evaluate(() => ({
    torbox: JSON.parse(localStorage.getItem("nuvio:torbox-key") ?? '""'),
    realDebrid: JSON.parse(
      localStorage.getItem("nuvio:realdebrid-key") ?? '""',
    ),
  }));
  expect(recovered).toEqual({
    torbox: "own-torbox",
    realDebrid: "own-real-debrid",
  });
  await page.getByLabel("Your private share code").fill("654321");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect.poll(() => publishCount).toBe(2);
  expect(published.code).toBe("654321");
  await page.getByText("Manage your friend code", { exact: true }).click();
  await page.getByRole("button", { name: "Revoke my code" }).click();
  await expect(page.getByText(/friend code was revoked/)).toBeVisible();
  expect(revoked).toBe(2);
});
test("manual raw torrent is resolved cached-only without autoplaying it", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() =>
    sessionStorage.setItem("nuvio:torbox-key", JSON.stringify("fake-key")),
  );
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [{ name: "1080p", seeders: 200, infoHash: "a".repeat(40) }],
      },
    }),
  );
  let cachedOnly = false;
  let requestedFile = "";
  await page.route("https://api.torbox.app/v1/api/**", async (route) => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname.endsWith("createtorrent")) {
      cachedOnly = /name="add_only_if_cached"[\s\S]*?true/.test(
        route.request().postData() ?? "",
      );
      data = { torrent_id: 5 };
    } else if (url.pathname.endsWith("mylist"))
      data = [
        {
          id: 5,
          files: [
            { id: 8, name: "Movie.1080p.mp4" },
            { id: 2, name: "sample.1080p.mp4" },
          ],
        },
      ];
    else {
      requestedFile = url.searchParams.get("file_id") ?? "";
      data = "https://cdn.example/torbox.mp4";
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.route("https://cdn.example/**", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator("video")).toHaveCount(0);
  expect(cachedOnly).toBe(false);
  await page.locator(".stream-results button").first().click();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/torbox.mp4",
  );
  expect(cachedOnly).toBe(true);
  expect(requestedFile).toBe("8");
});

test("full XMLTV guide loads automatically from login before channel selection", async ({
  page,
  context,
}) => {
  await context.unroute("https://vpn.trx-pro-iptvstore.cc/xmltv.php**");
  const stamp = (time: number) =>
    new Date(time).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  await context.route("https://vpn.trx-pro-iptvstore.cc/xmltv.php**", (route) =>
    route.fulfill({
      contentType: "application/xml",
      body:
        '<tv><programme channel="news.id" start="' +
        stamp(Date.now() - 60000) +
        '" stop="' +
        stamp(Date.now() + 3600000) +
        '"><title>Automatic XMLTV programme</title></programme></tv>',
    }),
  );
  await page.unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({
        json: !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action === "get_short_epg"
            ? { epg_listings: [] }
            : action.endsWith("_categories")
              ? [{ category_id: "1", category_name: "News" }]
              : [
                  {
                    stream_id: 10,
                    name: "Test News",
                    category_id: "1",
                    epg_channel_id: "news.id",
                  },
                ],
      });
    },
  );
  await connect(page);
  await page.goto("/#live");
  await expect(page.locator(".tv-guide-row")).toContainText(
    "Automatic XMLTV programme",
  );
});

test("relayed XMLTV preloads guide data beyond the rendered channel page", async ({
  page,
  context,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({ url: "https://playback.example", token: "test-key" }),
    ),
  );
  await context.unroute("https://vpn.trx-pro-iptvstore.cc/xmltv.php**");
  await context.route("https://vpn.trx-pro-iptvstore.cc/xmltv.php**", (route) =>
    route.abort("failed"),
  );
  const stamp = (time: number) =>
    new Date(time).toISOString().replace(/[-:T]/g, "").slice(0, 14) + " +0000";
  const programmes = Array.from(
    { length: 61 },
    (_, index) =>
      `<programme channel="channel.${index + 1}" start="${stamp(Date.now() - 60000)}" stop="${stamp(Date.now() + 3600000)}"><title>Programme ${index + 1}</title></programme>`,
  ).join("");
  await page.route("https://playback.example/guide", async (route) => {
    expect(route.request().postDataJSON().url).toContain("/xmltv.php?");
    await route.fulfill({
      contentType: "application/xml",
      body: `<tv>${programmes}</tv>`,
    });
  });
  let shortGuideRequests = 0;
  await page.unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
      if (action === "get_short_epg") shortGuideRequests++;
      return route.fulfill({
        json: !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action === "get_short_epg"
            ? { epg_listings: [] }
            : action.endsWith("_categories")
              ? [{ category_id: "1", category_name: "News" }]
              : Array.from({ length: 61 }, (_, index) => ({
                  stream_id: index + 1,
                  name: `Channel ${index + 1}`,
                  category_id: "1",
                  epg_channel_id: `channel.${index + 1}`,
                })),
      });
    },
  );
  await page.route("https://playback.example/request", (route) => {
    const source = new URL(route.request().postDataJSON().url);
    const action = source.searchParams.get("action");
    if (source.pathname === "/xmltv.php") return route.fulfill({ status: 404 });
    if (action === "get_short_epg") shortGuideRequests++;
    return route.fulfill({
      json: !action
        ? { user_info: { auth: 1, status: "Active" } }
        : action === "get_short_epg"
          ? { epg_listings: [] }
          : action.endsWith("_categories")
            ? [{ category_id: "1", category_name: "News" }]
            : Array.from({ length: 61 }, (_, index) => ({
                stream_id: index + 1,
                name: `Channel ${index + 1}`,
                category_id: "1",
                epg_channel_id: `channel.${index + 1}`,
              })),
    });
  });
  await connect(page);
  await page.goto("/#live");
  await expect(page.getByText("Guide ready - 61 channel guides")).toBeVisible();
  await expect(page.getByText("61 channels with schedules")).toBeVisible();
  await expect(page.locator(".tv-guide-row")).toHaveCount(30);
  const guide = page.locator(".tv-guide-grid");
  await guide.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator(".tv-guide-row")).toHaveCount(60);
  await guide.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await expect(page.locator(".tv-guide-row")).toHaveCount(61);
  await expect(page.locator(".tv-guide-row").last()).toContainText(
    "Programme 61",
  );
  expect(shortGuideRequests).toBe(0);
});

test("country filter combines with Xtream channel categories", async ({
  page,
}) => {
  await page.unroute("https://vpn.trx-pro-iptvstore.cc/player_api.php**");
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    (route) => {
      const requestUrl = new URL(route.request().url());
      const action = requestUrl.searchParams.get("action");
      return route.fulfill({
        json: !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action === "get_short_epg"
            ? {
                epg_listings: [
                  {
                    id: `guide-${requestUrl.searchParams.get("stream_id")}`,
                    title: btoa("Current programme"),
                    start_timestamp: Math.floor(Date.now() / 1000) - 60,
                    stop_timestamp: Math.floor(Date.now() / 1000) + 1800,
                  },
                ],
              }
            : action.endsWith("_categories")
              ? [
                  { category_id: "us", category_name: "US| NEWS NETWORK" },
                  { category_id: "uk", category_name: "UK| ENTERTAINMENT" },
                ]
              : [
                  {
                    stream_id: 1,
                    name: "American News",
                    category_id: "us",
                    epg_channel_id: "us.news",
                  },
                  {
                    stream_id: 2,
                    name: "British Entertainment",
                    category_id: "uk",
                    epg_channel_id: "uk.entertainment",
                  },
                ],
      });
    },
  );
  await connect(page);
  await page.goto("/#live");
  await page.getByLabel("Country or region").selectOption("US");
  await expect(page.locator(".tv-guide-row")).toHaveCount(1);
  await expect(page.locator(".tv-guide-row")).toContainText("American News");
  await page.getByLabel("Channel category").selectOption("us");
  await expect(page.locator(".tv-guide-row")).toHaveCount(1);
  await expect(page.locator(".tv-guide-row")).toContainText("American News");
});

test.describe("authenticated integrations", () => {
  test.use({ serviceWorkers: "block" });
  test("new accounts receive a selectable first profile", async ({ page }) => {
    const user = {
      id: "00000000-0000-4000-8000-000000000002",
      email: "new@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const jwt =
      btoa(JSON.stringify({ alg: "HS256" })) +
      "." +
      btoa(
        JSON.stringify({
          sub: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ) +
      ".fake";
    let profileCreated = false;
    let profilePayload: Record<string, any> | undefined;
    let addonsPayload: Record<string, any> | undefined;
    await page.route("https://api.nuvio.tv/**", async (route) => {
      const url = new URL(route.request().url());
      let data: any = [];
      if (url.pathname.includes("/auth/v1/signup"))
        data = {
          access_token: jwt,
          refresh_token: "fake-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else if (url.pathname.includes("/auth/v1/user")) data = user;
      else if (url.pathname.endsWith("/sync_pull_profiles"))
        data = profileCreated
          ? [
              {
                profile_index: 1,
                name: profilePayload?.p_profiles?.[0]?.name ?? "Home",
                avatar_color_hex:
                  profilePayload?.p_profiles?.[0]?.avatar_color_hex ??
                  "#8E24AA",
                pin_enabled: false,
              },
            ]
          : [];
      else if (url.pathname.endsWith("/sync_push_profiles")) {
        profilePayload = route.request().postDataJSON();
        profileCreated = true;
        data = null;
      } else if (url.pathname === "/rest/v1/addons")
        data = [
          {
            url: "https://v3-cinemeta.strem.io/manifest.json",
            name: "Nuvio Catalog Addon",
            enabled: true,
            sort_order: 0,
          },
          {
            url: "https://opensubtitles-v3.strem.io/manifest.json",
            name: "OpenSubtitles v3",
            enabled: true,
            sort_order: 1,
          },
          {
            url: "https://pengu.uk/removed-config/manifest.json",
            name: "PenguPlay",
            enabled: true,
            sort_order: 2,
          },
        ];
      else if (url.pathname.endsWith("/sync_push_addons")) {
        addonsPayload = route.request().postDataJSON();
        data = null;
      }
      await route.fulfill({ json: data });
    });
    await page.route("https://v3-cinemeta.strem.io/manifest.json", (route) =>
      route.fulfill({
        json: {
          id: "com.linvo.cinemeta",
          name: "Nuvio Catalog Addon",
          types: ["movie", "series"],
          resources: ["catalog", "meta"],
          catalogs: [],
        },
      }),
    );
    await page.route(
      "https://opensubtitles-v3.strem.io/manifest.json",
      (route) =>
        route.fulfill({
          json: {
            id: "org.stremio.opensubtitlesv3",
            name: "OpenSubtitles v3",
            types: ["movie", "series"],
            resources: ["subtitles"],
            catalogs: [],
          },
        }),
    );
    await page.addInitScript(() =>
      localStorage.removeItem("tiktak:established-local"),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Create account" }).click();
    await page.getByLabel("Email", { exact: true }).fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill("fake-password");
    await page.getByLabel("Confirm password").fill("fake-password");
    await page.getByLabel("Profile name").fill("Jay");
    await page.getByLabel("Use Ocean avatar").click();
    await page.getByRole("button", { name: "Create free account" }).click();

    await expect.poll(() => profilePayload?.p_profiles?.[0]?.name).toBe("Jay");
    expect(profilePayload?.p_profiles?.[0]?.avatar_color_hex).toBe("#1565C0");
    await expect(
      page.getByText("Your profile was created. Select it to enter TikTak TV."),
    ).toBeVisible();
    await page.getByRole("button", { name: /Jay/ }).click();
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("nuvio:tmdb-key")))
      .toBe("c49921f8195461e369d52a70a15fc8e1");
    await expect
      .poll(() =>
        addonsPayload?.p_addons?.every(
          (addon: { name?: string; url?: string }) =>
            addon.name !== "PenguPlay" && !addon.url?.includes("pengu.uk"),
        ),
      )
      .toBe(true);
    expect(addonsPayload?.p_addons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Nuvio Catalog Addon" }),
        expect.objectContaining({ name: "OpenSubtitles v3" }),
      ]),
    );
    const wizardClose = page.getByRole("button", { name: "Close setup" });
    if (await wizardClose.isVisible().catch(() => false))
      await wizardClose.click();
    await page.goto("/#settings");
    await page
      .getByRole("button", { name: "Close setup" })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await page.getByRole("button", { name: /Add-ons/ }).click();
    await expect(page.getByText("PenguPlay", { exact: true })).toHaveCount(0);
  });

  test("Nuvio login loads shared addons and collection tiles, persists profile and saves edits", async ({
    page,
  }) => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
      email: "test@example.com",
      aud: "authenticated",
      role: "authenticated",
    };
    const jwt =
      btoa(JSON.stringify({ alg: "HS256" })) +
      "." +
      btoa(
        JSON.stringify({
          sub: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600,
        }),
      ) +
      ".fake";
    const pushes: Array<{ path: string; body: any }> = [];
    const traktCredential = {
      access_token: "profile-trakt-access",
      refresh_token: "profile-trakt-refresh",
      token_type: "bearer",
      created_at: Math.floor(Date.now() / 1000),
      expires_in: 86_400,
      username: "profile-viewer",
    };
    let profileSettings: Record<string, any> = {
      unrelatedSetting: "preserve",
      tikTakWebV1: {
        playbackService: {
          url: "https://playback.example",
          token: "fake-private-key-for-browser-sync",
          mode: "direct",
        },
        trakt: traktCredential,
      },
    };
    const collection = {
      id: "services",
      title: "Streaming Services",
      pinToTop: true,
      viewMode: "FOLLOW_LAYOUT",
      showAllTab: true,
      folders: [
        {
          id: "prime",
          title: "",
          hideTitle: true,
          coverImageUrl: "https://images.example/prime-video-card.png",
          tileShape: "LANDSCAPE",
          sources: [
            {
              provider: "addon",
              addonId: "com.linvo.cinemeta",
              type: "movie",
              catalogId: "top",
            },
          ],
        },
      ],
    };
    await page.route("https://api.nuvio.tv/**", async (route) => {
      const url = new URL(route.request().url());
      let data: any = [];
      if (url.pathname.includes("/auth/v1/token"))
        data = {
          access_token: jwt,
          refresh_token: "fake-refresh",
          expires_in: 3600,
          token_type: "bearer",
          user,
        };
      else if (url.pathname.includes("/auth/v1/user")) data = user;
      else if (url.pathname.endsWith("/sync_pull_profiles"))
        data = [{ profile_index: 2, name: "Home", pin_enabled: false }];
      else if (url.pathname === "/rest/v1/addons")
        data = [
          {
            url: "https://v3-cinemeta.strem.io/manifest.json",
            name: "Cinemeta",
            enabled: true,
            sort_order: 0,
          },
        ];
      else if (url.pathname.endsWith("/sync_pull_collections"))
        data = [{ collections_json: [collection] }];
      else if (url.pathname.endsWith("/sync_pull_profile_settings_blob"))
        data = [{ settings_json: profileSettings }];
      else if (url.pathname.endsWith("/sync_pull_provider_credentials"))
        data = [];
      else if (url.pathname.endsWith("/sync_pull_watched_items"))
        data = [
          {
            content_id: meta.id,
            content_type: "movie",
            title: meta.name,
            watched_at: Date.now(),
          },
        ];
      else if (url.pathname.endsWith("/sync_push_provider_credentials")) {
        pushes.push({
          path: url.pathname,
          body: route.request().postDataJSON(),
        });
        return route.fulfill({
          status: 400,
          json: {
            code: "P0001",
            message: "Unsupported provider credential: trakt",
          },
        });
      } else if (url.pathname.endsWith("/sync_push_profile_settings_blob")) {
        const body = route.request().postDataJSON();
        pushes.push({ path: url.pathname, body });
        profileSettings = body.p_settings_json;
        data = null;
      } else if (
        url.pathname.includes("/sync_push_") ||
        url.pathname.includes("/sync_delete_")
      ) {
        pushes.push({
          path: url.pathname,
          body: route.request().postDataJSON(),
        });
        data = null;
      }
      await route.fulfill({ json: data });
    });
    await page.route("https://api.trakt.tv/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        json:
          path === "/users/settings"
            ? { user: { username: "profile-viewer" } }
            : [],
      });
    });
    await page.route("https://v3-cinemeta.strem.io/manifest.json", (r) =>
      r.fulfill({
        json: {
          id: "com.linvo.cinemeta",
          name: "Cinemeta",
          types: ["movie"],
          resources: ["catalog", "meta", "stream"],
          catalogs: [{ id: "top", type: "movie" }],
        },
      }),
    );
    await page.addInitScript(() =>
      localStorage.removeItem("tiktak:established-local"),
    );
    await page.goto("/");
    await page.getByLabel("Email", { exact: true }).fill("test@example.com");
    await page.getByLabel("Password", { exact: true }).fill("fake-password");
    await page
      .locator("form")
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    const homeProfile = page.locator(".profile-choices button", {
      hasText: "Home",
    });
    await expect(homeProfile).toBeVisible();
    await homeProfile.hover();
    await expect(homeProfile).toHaveCSS(
      "border-top-color",
      "rgb(184, 138, 255)",
    );
    await homeProfile.focus();
    await expect(homeProfile).toHaveCSS(
      "border-top-color",
      "rgb(184, 138, 255)",
    );
    await homeProfile.click();
    await expect(
      page.getByRole("heading", { name: "The Test Movie" }),
    ).toBeVisible();
    await expect(
      page
        .locator(".media-card", { hasText: "The Test Movie" })
        .first()
        .locator(".card-watched-icon"),
    ).toBeVisible();
    const setupClose = page.getByRole("button", { name: "Close setup" });
    await setupClose.click({ timeout: 5_000 }).catch(() => undefined);
    await page
      .locator(".media-card", { hasText: "The Test Movie" })
      .first()
      .click();
    await expect(
      page.getByRole("dialog").locator(".title-watched-badge"),
    ).toHaveText("Watched");
    await page.getByRole("button", { name: "Mark unwatched" }).click();
    await expect(
      page.getByRole("button", { name: "Mark watched" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        pushes.some(
          (entry) =>
            entry.path.endsWith("sync_delete_watched_items") &&
            entry.body.p_profile_id === 2 &&
            entry.body.p_keys?.[0]?.content_id === meta.id,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Mark watched" }).click();
    await expect(
      page.getByRole("dialog").locator(".title-watched-badge"),
    ).toHaveText("Watched");
    await expect
      .poll(() =>
        pushes.some(
          (entry) =>
            entry.path.endsWith("sync_push_watched_items") &&
            entry.body.p_profile_id === 2 &&
            entry.body.p_items?.[0]?.content_id === meta.id,
        ),
      )
      .toBe(true);
    await page.getByRole("button", { name: "Close details" }).click();
    await expect
      .poll(() =>
        page.evaluate(
          (expectedKey) => {
            const key = Object.keys(localStorage).find(
              (entry) => entry === expectedKey,
            );
            return key ? JSON.parse(localStorage.getItem(key) ?? "null") : null;
          },
          `tiktak:trakt:${encodeURIComponent(`profile:${user.id}:2`)}`,
        ),
      )
      .toMatchObject({
        access_token: "profile-trakt-access",
        refresh_token: "profile-trakt-refresh",
      });
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("nuvio:playback-service")),
      )
      .toBeNull();
    await page.goto("/#settings");
    await page
      .getByRole("button", { name: "Close setup" })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await page.getByRole("button", { name: /^Trakt/ }).click();
    await expect(page.getByText("Connected as")).toContainText(
      "profile-viewer",
    );
    const scrobble = page.getByRole("checkbox", {
      name: /Scrobble movies and episodes/,
    });
    await scrobble.check();
    await expect
      .poll(() => profileSettings.tikTakWebV1?.trakt?.scrobbling_enabled)
      .toBe(true);
    await expect(
      page.getByText(/Unsupported provider credential: trakt/),
    ).toHaveCount(0);
    if ((page.viewportSize()?.width ?? Infinity) <= 800)
      await page.getByRole("button", { name: "Back to settings" }).click();
    await page.getByRole("button", { name: /Playback/ }).click();
    await expect(
      page.getByText("Playback service connected.", { exact: false }),
    ).toBeVisible();
    if ((page.viewportSize()?.width ?? Infinity) <= 800)
      await page.getByRole("button", { name: "Back to settings" }).click();
    await page.getByRole("button", { name: /^Collections/ }).click();
    await expect(
      page.getByRole("button", { name: /Streaming Services/ }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Edit Streaming Services" }).click();
    await expect(
      page.getByRole("heading", { name: "Streaming Services" }),
    ).toBeVisible();
    await expect(page.getByLabel("View mode")).toHaveValue("FOLLOW_LAYOUT");
    await page
      .getByLabel("Backdrop image")
      .fill("https://images.example/streaming-services.jpg");
    await expect
      .poll(() =>
        pushes.some(
          (entry) =>
            entry.path.endsWith("sync_push_collections") &&
            entry.body.p_collections_json?.[0]?.backdropImageUrl ===
              "https://images.example/streaming-services.jpg" &&
            entry.body.p_collections_json?.[0]?.viewMode === "FOLLOW_LAYOUT" &&
            entry.body.p_collections_json?.[0]?.showAllTab === true,
        ),
      )
      .toBe(true);
    expect(profileSettings.tikTakWebV1?.trakt).toMatchObject({
      access_token: "profile-trakt-access",
      scrobbling_enabled: true,
    });
    await page.goto("/#account");
    await page.locator(".preference-card .switch-control").click();
    await page.goto("/#home");
    await page
      .getByRole("button", { name: "Open Streaming Services: Folder 1" })
      .click();
    await expect(
      page.locator(".collection-browser .media-card strong"),
    ).toHaveText("The Test Movie");
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Open Streaming Services: Folder 1",
      }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          (key) =>
            JSON.parse(localStorage.getItem(key) ?? "null")?.access_token,
          `tiktak:trakt:${encodeURIComponent(`profile:${user.id}:2`)}`,
        ),
      )
      .toBe("profile-trakt-access");
    await expect(page.locator(".account-hero-card h2")).toHaveText("Home");
    // Let AccountPanel's post-render effect capture the freshly loaded profile
    // before changing a setting; otherwise the change can become its baseline.
    await page.waitForTimeout(250);
    await page.goto("/#settings");
    await page.getByRole("button", { name: /^Streams/ }).click();
    await page.getByLabel("Automatic source selection").selectOption("manual");
    await page.getByRole("button", { name: "Save stream settings" }).click();
    await expect
      .poll(() =>
        pushes.some(
          (entry) =>
            entry.path.endsWith("sync_push_profile_settings_blob") &&
            entry.body.p_settings_json.tikTakWebV1?.autoplay === false,
        ),
      )
      .toBe(true);
    expect(pushes.some((p) => p.path.endsWith("sync_push_addons"))).toBe(false);
    const saved = [...pushes]
      .reverse()
      .find(
        (p) =>
          p.path.endsWith("sync_push_profile_settings_blob") &&
          p.body.p_profile_id === 2,
      )!;
    expect(saved.body.p_settings_json.unrelatedSetting).toBe("preserve");
    expect(saved.body.p_settings_json.tikTakWebV1.autoplay).toBe(false);
    expect(saved.body.p_settings_json.tikTakWebV1.trakt).toMatchObject({
      access_token: "profile-trakt-access",
      scrobbling_enabled: true,
    });
  });

  test("TorBox requests use the configured playback service instead of browser CORS", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        "nuvio:playback-service",
        JSON.stringify({
          url: "https://playback.example",
          token: "fake-private-key",
        }),
      ),
    );
    let directCalls = 0;
    await page.route("https://api.torbox.app/**", (r) => {
      directCalls++;
      return r.abort();
    });
    await page.route("https://playback.example/request", (r) => {
      const body = r.request().postDataJSON();
      expect(body.url).toBe("https://api.torbox.app/v1/api/user/me");
      expect(body.headers.authorization).toBe("Bearer fake-torbox-key");
      return r.fulfill({ json: { success: true, data: { id: 1 } } });
    });
    await page.goto("/#settings");
    await page.getByRole("button", { name: /Playback/ }).click();
    await page
      .getByLabel("TorBox API key", { exact: true })
      .fill("fake-torbox-key");
    await page
      .getByRole("button", { name: "Connect TorBox", exact: true })
      .click();
    await expect(
      page.getByText("TorBox connected.", { exact: false }),
    ).toBeVisible();
    expect(directCalls).toBe(0);
  });

  test("a signed discovery record replaces a failed tunnel automatically", async ({
    page,
  }) => {
    const token = "discovery-secret";
    const url = "https://replacement.trycloudflare.com";
    const updated = 1_792_880_620_516;
    const signature = createHmac("sha256", token)
      .update(`${url}\n${updated}`)
      .digest("hex");
    await page.addInitScript(
      ({ token }) => {
        localStorage.setItem(
          "nuvio:playback-service",
          JSON.stringify({ url: "https://expired.example", token }),
        );
      },
      { token },
    );
    await page.route("https://expired.example/request", (route) =>
      route.fulfill({ status: 503, body: "expired" }),
    );
    await page.route(
      "**/repos/zachgus33/Tik-TakTV-Endpoint/contents/endpoint.json**",
      (route) =>
        route.request().url().includes("endpoint.json?")
          ? route.fulfill({ json: { url, updated, signature } })
          : route.fulfill({ status: 404 }),
    );
    await page.route(`${url}/request`, (route) =>
      route.fulfill({ json: { success: true, data: { id: 1 } } }),
    );
    await page.goto("/#settings");
    await page.getByRole("button", { name: /Playback/ }).click();
    await page.getByLabel("TorBox API key", { exact: true }).fill("torbox-key");
    await page
      .getByRole("button", { name: "Connect TorBox", exact: true })
      .click();
    await expect(
      page.getByText("TorBox connected.", { exact: false }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("nuvio:playback-service")),
      )
      .toContain("replacement.trycloudflare.com");
  });
});
