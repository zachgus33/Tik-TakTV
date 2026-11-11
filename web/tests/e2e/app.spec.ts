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
test.beforeEach(async ({ page }) => {
  await page.addInitScript((release) => {
    localStorage.setItem("tiktak:established-local", "1");
    localStorage.setItem("tiktak:whats-new-seen", release);
  }, latestRelease);
  await mockSources(page);
});

test("a new release shows once and links to the complete change history", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.removeItem("tiktak:whats-new-seen"),
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
      constructor(_target: HTMLElement, options: any) {
        this.options = options;
        this.videoId = options.videoId;
        (window as any).__playedYouTubeVideoId = options.videoId;
        ((window as any).__youtubePlayers ??= []).push(this);
        queueMicrotask(() => options.events.onReady({ target: this }));
      }
      destroy() {}
      getCurrentTime() {
        return this.time;
      }
      getDuration() {
        return 300;
      }
      getIframe() {
        return document.createElement("iframe");
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
  await page.route("https://playback.example/youtube/account", (route) =>
    route.fulfill({
      json: {
        configured: true,
        connected: true,
        channel: { title: "Test viewer" },
        videoFeed: [
          {
            videoId: "dQw4w9WgXcQ",
            title: "Account recommendation",
            channel: "Test channel",
            thumbnail: "https://img.example/recommendation.jpg",
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
      },
    }),
  );
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
  await page.route("https://playback.example/sponsorblock", (route) =>
    route.fulfill({ json: { segments: [] } }),
  );
  await page.goto("/#youtube");
  await expect(
    page.getByRole("heading", { name: "YouTube", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Test viewer", { exact: true })).toBeVisible();
  await expect(page.getByText("Account recommendation")).toBeVisible();
  await expect(page.getByText("Saved playlist")).toBeVisible();
  await expect(page.getByText("Subscribed channel")).toBeVisible();
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

test("first visit offers Nuvio sign in and account creation", async ({
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
    page.getByText(/starts with Nuvio Catalog Addon.*OpenSubtitles v3/),
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

test("desktop sidebar stays slim while keeping every navigation label visible", async ({
  page,
}) => {
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
  expect(layout.sidebar).toBe(184);
  expect(layout.mainLeft).toBe(184);
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
  expect(layout.sidebar).toBe(168);
  expect(layout.mainLeft).toBe(168);
  expect(layout.clippedLabels).toBe(0);
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
  await page.getByRole("button", { name: "Find streams" }).click();
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
  }
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
test("live TV sends the provider transport stream through browser-safe Pi transcoding", async ({
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
  let prepared: any;
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
  await page.goto("/?tv=1#live");
  await page
    .locator(".tv-guide-channel")
    .filter({ hasText: "Test News" })
    .click();
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
  await page
    .locator(".tv-guide-channel")
    .filter({ hasText: "Test News" })
    .click();
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
test("autoplay selects highest quality first and seeders break quality ties", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
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
  await page.getByRole("button", { name: "Play best stream" }).click();
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await expect(page.getByText("Preparing The Test Movie")).toBeVisible();
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

test("the player exposes every compatible stream while automatic fallback stays bounded", async ({
  page,
}) => {
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await expect(
    page.getByRole("button", { name: "Choose stream" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Choose stream" }).click();
  const chooser = page.getByRole("dialog", { name: "Choose a stream" });
  await expect(chooser).toContainText(
    "Automatic playback tries up to 5 streams",
  );
  await expect(chooser.locator(".player-source-list > button")).toHaveCount(7);
  await chooser
    .locator(".player-source-list > button")
    .filter({ hasText: "Option 7" })
    .click();
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/option-7.mp4",
  );
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  const choose = page.getByRole("button", { name: "Choose stream" });
  await choose.focus();
  await page.keyboard.press("Enter");
  const last = page
    .getByRole("dialog", { name: "Choose a stream" })
    .locator(".player-source-list > button")
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await fallbackRequested;
});
test("an independent user's configured Torrentio debrid stream uses the playback relay", async ({
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
    expect(route.request().postDataJSON().url).toContain("/stream/movie/");
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await expect.poll(() => preparations.length).toBeGreaterThan(0);
  expect(directStreamCalls).toBe(0);
  expect(preparations[0].url).toContain("/resolve/torbox/");
  expect(preparations[0].mode).toBe("direct");
  await expect(page.locator("video")).toBeVisible();
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
  await page.getByRole("button", { name: "Play best stream" }).click();
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
  await expect.poll(() => prepared.at(-1)?.start).toBe(3600);
  await expect(page.locator("video")).not.toHaveAttribute("controls", "");
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await page
    .getByRole("button", { name: /TV test stream Direct play/ })
    .click();

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
  await expect(page.getByLabel("Rewind 10 seconds")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(player).toBeHidden();
});
test("subtitle timing controls persist the selected offset", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.addInitScript(() => {
    const addons = JSON.parse(localStorage.getItem("nuvio:addons") || "[]");
    addons[0].manifest.resources.push("subtitles");
    localStorage.setItem("nuvio:addons", JSON.stringify(addons));
  });
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          {
            name: "1080p English",
            url: "https://cdn.example/subtitle-test.mp4",
          },
        ],
      },
    }),
  );
  await page.route("https://v3-cinemeta.strem.io/subtitles/**", (route) =>
    route.fulfill({
      json: {
        subtitles: [
          { url: "https://subs.example/en.vtt", lang: "eng", name: "English" },
        ],
      },
    }),
  );
  await page.route("https://subs.example/en.vtt", (route) =>
    route.fulfill({
      contentType: "text/vtt",
      body: "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello",
    }),
  );
  await page.route("https://cdn.example/subtitle-test.mp4", (route) =>
    route.fulfill({ status: 200, contentType: "video/mp4", body: "" }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  await page.getByRole("button", { name: "Play best stream" }).click();
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
      page.evaluate(() => localStorage.getItem("tiktak:subtitle-offset")),
    )
    .toBe("1");
});
test("phone autoplay chooses the highest quality stream and normalizes HEVC", async ({
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
        ],
      },
    }),
  );
  let prepared: Record<string, unknown> = {};
  await page.route("https://playback.example/prepare", async (route) => {
    prepared = route.request().postDataJSON();
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
  await page.getByRole("button", { name: "Play best stream" }).click();
  await expect.poll(() => prepared.mode).toBe("transcode");
  expect(prepared.live).toBe(false);
  expect(prepared.url).toBe("https://cdn.example/episode.x265.mp4");
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
  await page.getByRole("button", { name: "Play best stream" }).click();
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
test("downloads the best ranked movie stream automatically as an MP4", async ({
  page,
  browserName,
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
  await page.route("https://playback.example/download", async (route) => {
    requested = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({ json: { path: "/media/job/download.mp4" } });
  });
  let mediaRequests = 0;
  await page
    .context()
    .route("https://playback.example/media/job/download.mp4", (route) => {
      mediaRequests += 1;
      return route.fulfill({
        contentType: "video/mp4",
        headers: {
          "Content-Disposition": 'attachment; filename="The Test Movie.mp4"',
        },
        body: "mp4",
      });
    });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  const transfer =
    browserName === "chromium" ? page.waitForEvent("download") : null;
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => requested.url).toBe("https://cdn.example/4k.mkv");
  expect(requested.filename).toBe("The Test Movie.mp4");
  const appleTouchBrowser = await page.evaluate(() =>
    /iPad|iPhone|iPod/i.test(navigator.userAgent),
  );
  if (appleTouchBrowser)
    await page.getByRole("link", { name: "Open MP4 / Save to Files" }).click();
  if (browserName === "chromium") {
    const result = await transfer!;
    expect("suggestedFilename" in result && result.suggestedFilename()).toBe(
      "The Test Movie.mp4",
    );
  } else await expect.poll(() => mediaRequests).toBeGreaterThan(0);
});
test("friend code installs the shared add-ons, catalogs and TorBox grant", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "nuvio:playback-service",
      JSON.stringify({
        url: "https://playback.example",
        token: "x".repeat(40),
      }),
    ),
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
  }));
  expect(stored.addons[0].manifest.name).toBe("Owner catalog");
  expect(stored.addons[0].base).toBe("https://v3-cinemeta.strem.io");
  expect(stored.catalogs[0].custom_title).toBe("Owner picks");
  expect(stored.torbox).toBe("friend:signed-grant");
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
  await page.route("https://playback.example/friend/setup", async (route) => {
    published = JSON.parse(route.request().postData() ?? "{}");
    await route.fulfill({
      json: {
        ok: true,
        torboxKey: "friend:owner-grant",
        realDebridKey: "friend-rd:owner-grant",
      },
    });
  });
  let revoked = false;
  await page.route("https://playback.example/friend/revoke", async (route) => {
    revoked = true;
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Playback/ }).click();
  await page.getByLabel("Your private share code").fill("654321");
  await page.getByRole("button", { name: "Create code" }).click();
  await expect(page.getByText(/encrypted friend code is active/)).toBeVisible();
  expect(published.code).toBe("654321");
  expect(published.torboxKey).toBe("own-torbox");
  expect(published.realDebridKey).toBe("own-real-debrid");
  expect(
    Array.isArray((published.template as { addons?: unknown[] }).addons),
  ).toBe(true);
  await page.getByText("Manage your friend code", { exact: true }).click();
  await page.getByRole("button", { name: "Revoke my code" }).click();
  await expect(page.getByText(/friend code was revoked/)).toBeVisible();
  expect(revoked).toBe(true);
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
  await page.getByRole("button", { name: "Play best stream" }).click();
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
          ? [{ profile_index: 1, name: "Home", pin_enabled: false }]
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
    await page.getByRole("button", { name: "Create free account" }).click();

    await expect(page.getByRole("button", { name: /Home/ })).toBeVisible();
    expect(profilePayload?.p_profiles).toEqual([
      expect.objectContaining({ profile_index: 1, name: "Home" }),
    ]);
    await page.getByRole("button", { name: /Home/ }).click();
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
        data = [{ profile_index: 1, name: "Home", pin_enabled: false }];
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
        data = [
          {
            settings_json: {
              unrelatedSetting: "preserve",
              tikTakWebV1: {
                playbackService: {
                  url: "https://playback.example",
                  token: "fake-private-key-for-browser-sync",
                  mode: "direct",
                },
              },
            },
          },
        ];
      else if (url.pathname.includes("/sync_push_")) {
        pushes.push({
          path: url.pathname,
          body: route.request().postDataJSON(),
        });
        data = null;
      }
      await route.fulfill({ json: data });
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
    await expect(homeProfile).toHaveCSS("border-top-color", "rgb(184, 138, 255)");
    await homeProfile.focus();
    await expect(homeProfile).toHaveCSS("border-top-color", "rgb(184, 138, 255)");
    await homeProfile.click();
    await expect(
      page.getByRole("heading", { name: "The Test Movie" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("nuvio:playback-service")),
      )
      .toBeNull();
    const setupClose = page.getByRole("button", { name: "Close setup" });
    if (await setupClose.isVisible().catch(() => false))
      await setupClose.click();
    await page.goto("/#settings");
    await page
      .getByRole("button", { name: "Close setup" })
      .click({ timeout: 3000 })
      .catch(() => undefined);
    await page.getByRole("button", { name: /Playback/ }).click();
    await expect(
      page.getByText("Playback service connected.", { exact: false }),
    ).toBeVisible();
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
    await page.goto("/#account");
    await page.getByText("Show selector", { exact: true }).click();
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
    await page.goto("/#settings");
    await page.getByRole("button", { name: /Playback/ }).click();
    await page
      .getByLabel("Automatically play the best 720p-or-higher stream")
      .uncheck();
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
      .find((p) => p.path.endsWith("sync_push_profile_settings_blob"))!;
    expect(saved.body.p_settings_json.unrelatedSetting).toBe("preserve");
    expect(saved.body.p_settings_json.tikTakWebV1.autoplay).toBe(false);
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
