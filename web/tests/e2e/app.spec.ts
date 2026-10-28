import { test, expect, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";

const meta = {
  id: "tt-test",
  name: "The Test Movie",
  type: "movie",
  description: "A test catalog title.",
  year: "2026",
  imdbRating: "8.1",
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
  await page.route(
    "https://vpn.trx-pro-iptvstore.cc/player_api.php**",
    async (route) => {
      const action = new URL(route.request().url()).searchParams.get("action");
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
            : [{ stream_id: 10, name: "Test News", category_id: "1" }];
      await route.fulfill({ json: data });
    },
  );
}
async function connect(page: Page) {
  await page.goto("/#settings");
  await page.getByRole("button", { name: /Live TV/ }).click();
  await page.getByLabel("Username", { exact: true }).fill("test-user");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Test & connect" }).click();
  await expect(
    page.getByText("Connection verified.", { exact: false }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("tiktak:established-local", "1"),
  );
  await mockSources(page);
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
    page.getByText(/starts with Cinemeta.*OpenSubtitles v3/),
  ).toBeVisible();
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
  expect(prepared.url).toContain("/live/test-user/test-password/10.ts");
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
    page.locator(".collections-section .media-card strong"),
  ).toHaveText("The Test Movie");
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
  await page.getByRole("checkbox", { name: "Cinema nights" }).uncheck();
  await page.goto("/#home");
  await expect(
    page.getByRole("button", { name: "Open Cinema nights: Movies" }),
  ).toHaveCount(0);
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
test("autoplay selects 720p with most seeders over 4K and SD", async ({
  page,
}) => {
  await streamingAddon(page);
  await page.route("https://v3-cinemeta.strem.io/stream/**", (route) =>
    route.fulfill({
      json: {
        streams: [
          { name: "4K", seeders: 3, url: "https://cdn.example/4k.mp4" },
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
  await expect(page.locator("video")).toHaveAttribute(
    "src",
    "https://cdn.example/best.mp4",
  );
});
test("search uses every searchable catalog even when a trending catalog is selected", async ({
  page,
}) => {
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
  await expect(page.getByLabel("Catalog")).toHaveValue(/trending/);
});
test("browser-incompatible add-on video is transcoded before playback", async ({
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
  expect(prepared.url).toBe("https://cdn.example/the-rookie.mkv");
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
  await page.route("https://playback.example/media/job/download.mp4", (route) =>
    route.fulfill({
      contentType: "video/mp4",
      headers: {
        "Content-Disposition": 'attachment; filename="The Test Movie.mp4"',
      },
      body: "mp4",
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore title" }).click();
  const transfer =
    browserName === "chromium"
      ? page.waitForEvent("download")
      : page.waitForRequest("https://playback.example/media/job/download.mp4");
  await page.getByRole("button", { name: "Download", exact: true }).click();
  await expect.poll(() => requested.url).toBe("https://cdn.example/best.mkv");
  expect(requested.filename).toBe("The Test Movie.mp4");
  const result = await transfer;
  if (browserName === "chromium")
    expect("suggestedFilename" in result && result.suggestedFilename()).toBe(
      "The Test Movie.mp4",
    );
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
  expect(stored.catalogs[0].custom_title).toBe("Owner picks");
  expect(stored.torbox).toBe("friend:signed-grant");
});
test("raw torrent is resolved through cached-only TorBox and correct file id", async ({
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
  await connect(page);
  await page.goto("/#live");
  await expect(page.getByText("Guide ready - 61 channel guides")).toBeVisible();
  await expect(page.getByText("61 channels with schedules")).toBeVisible();
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
      const action = new URL(route.request().url()).searchParams.get("action");
      return route.fulfill({
        json: !action
          ? { user_info: { auth: 1, status: "Active" } }
          : action === "get_short_epg"
            ? { epg_listings: [] }
            : action.endsWith("_categories")
              ? [
                  { category_id: "us", category_name: "US| NEWS NETWORK" },
                  { category_id: "uk", category_name: "UK| ENTERTAINMENT" },
                ]
              : [
                  { stream_id: 1, name: "American News", category_id: "us" },
                  {
                    stream_id: 2,
                    name: "British Entertainment",
                    category_id: "uk",
                  },
                ],
      });
    },
  );
  await connect(page);
  await page.goto("/#live");
  await page.getByLabel("Country or region").selectOption("US");
  await expect(page.locator(".tv-guide-row")).toHaveCount(0);
  await page.getByLabel("Channel category").selectOption("us");
  await expect(page.locator(".tv-guide-row")).toHaveCount(0);
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
      .poll(() =>
        addonsPayload?.p_addons?.every(
          (addon: { name?: string; url?: string }) =>
            addon.name !== "PenguPlay" && !addon.url?.includes("pengu.uk"),
        ),
      )
      .toBe(true);
    await page.goto("/#settings");
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
      folders: [
        {
          id: "prime",
          title: "Prime Video",
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
    await page.getByRole("button", { name: /Home/ }).click();
    await expect(
      page.getByRole("heading", { name: "The Test Movie" }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const raw = localStorage.getItem("nuvio:playback-service");
          if (!raw) return false;
          const service = JSON.parse(raw);
          return /^https:\/\//.test(service.url) && !!service.token;
        }),
      )
      .toBe(true);
    await page.goto("/#settings");
    await page.getByRole("button", { name: /Playback/ }).click();
    await expect(
      page.getByText("Playback service connected.", { exact: false }),
    ).toBeVisible();
    await page.goto("/#account");
    await page.getByText("Show selector", { exact: true }).click();
    await page.goto("/#home");
    await page
      .getByRole("button", { name: "Open Streaming Services: Prime Video" })
      .click();
    await expect(
      page.locator(".collections-section .media-card strong"),
    ).toHaveText("The Test Movie");
    await page.reload();
    await expect(
      page.getByRole("button", {
        name: "Open Streaming Services: Prime Video",
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
      "https://raw.githubusercontent.com/zachgus33/Tik-TakTV-Endpoint/main/endpoint.json**",
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
