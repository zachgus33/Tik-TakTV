import { test, expect, type Page } from "@playwright/test";

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
  await page.getByLabel("Username", { exact: true }).fill("test-user");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Test & connect" }).click();
  await expect(
    page.getByText("Connection verified.", { exact: false }),
  ).toBeVisible();
}
test.beforeEach(async ({ page }) => {
  await mockSources(page);
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
  await expect(page.getByRole("alert")).toContainText(
    "Install a streaming add-on",
  );
  await page.getByRole("button", { name: "Close details" }).click();
  await page.goto("/#library");
  await expect(
    page.locator(".media-card strong").filter({ hasText: "The Test Movie" }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth + 1,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
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
  await page
    .getByRole("button", { name: "Test News News", exact: false })
    .click();
  await expect(
    page.locator(".guide").getByText("Evening news", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Favorite Test News", exact: true })
    .click();
  await page.goto("/#library");
  await expect(
    page.locator(".media-card strong").filter({ hasText: "Test News" }),
  ).toBeVisible();
  await page.goto("/#settings");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("nuvio:provider")),
  ).toBeNull();
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
test("large channel lists render in bounded batches and search locally", async ({
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
  await expect(page.locator(".channel")).toHaveCount(60);
  await page.getByLabel("Search titles or channels").fill("Channel 4999");
  await expect(page.locator(".channel")).toHaveCount(1);
  await expect(page.locator(".channel")).toContainText("Channel 4999");
});

test("imports native collections and opens their addon catalogs", async ({
  page,
}) => {
  await page.goto("/#settings");
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
  await page.getByRole("button", { name: "Cinema nights 1 folders" }).click();
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
    page.getByRole("button", { name: "Cinema nights 1 folders" }),
  ).toBeVisible();
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
  await expect(page.locator(".channel")).toContainText(
    "Automatic XMLTV programme",
  );
});
