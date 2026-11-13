import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createService,
  publicAddress,
  resolveTarget,
  rewritePlaylist,
  rotateYoutubeAccount,
  youtubeRecentVideoIds,
  safeDownloadName,
  sourceHeaders,
  youtubeVideoAllowed,
} from "./server.mjs";

test("YouTube account feeds rotate without dropping recommendations", () => {
  const account = {
    connected: true,
    videoFeed: Array.from({ length: 10 }, (_, index) => ({
      videoId: `video-${index}`,
    })),
    musicFeed: Array.from({ length: 7 }, (_, index) => ({
      videoId: `music-${index}`,
    })),
    recentFeed: Array.from({ length: 5 }, (_, index) => ({
      videoId: `recent-${index}`,
    })),
  };
  const first = rotateYoutubeAccount(account, 0);
  const second = rotateYoutubeAccount(account, 1);
  assert.notEqual(first.videoFeed[0].videoId, second.videoFeed[0].videoId);
  assert.notEqual(first.musicFeed[0].videoId, second.musicFeed[0].videoId);
  assert.notEqual(first.recentFeed[0].videoId, second.recentFeed[0].videoId);
  assert.deepEqual(
    new Set(second.videoFeed.map((item) => item.videoId)),
    new Set(first.videoFeed.map((item) => item.videoId)),
  );
  assert.equal(account.videoFeed[0].videoId, "video-0");
});

test("YouTube recent-video seeds are validated and bounded", () => {
  assert.deepEqual(
    youtubeRecentVideoIds([
      "dQw4w9WgXcQ",
      "dQw4w9WgXcQ",
      "M7lc1UVf-VE",
      "invalid",
      42,
    ]),
    ["dQw4w9WgXcQ", "M7lc1UVf-VE"],
  );
  assert.deepEqual(youtubeRecentVideoIds(null), []);
});

test("YouTube search rejects blocked embeds for video and music", () => {
  const blockedMusic = {
    snippet: { categoryId: "10" },
    status: { embeddable: false },
  };
  const playableMusic = {
    snippet: { categoryId: "10" },
    status: { embeddable: true },
  };
  assert.equal(youtubeVideoAllowed(blockedMusic, "music"), false);
  assert.equal(youtubeVideoAllowed(playableMusic, "music"), true);
  assert.equal(youtubeVideoAllowed(playableMusic, "video"), false);
});

test("public liveness endpoint exposes no private configuration", async () => {
  const server = createService({
    token: "z".repeat(40),
    origins: ["https://site.example"],
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const response = await fetch(`${base}/healthz`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-tiktak-companion"), "2");
    assert.deepEqual(await response.json(), { ok: true, version: 2 });
    assert.equal((await fetch(`${base}/health`)).status, 401);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("usage counts are anonymous and visible only to the configured owner", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiktak-analytics-"));
  const previous = {
    admin: process.env.ANALYTICS_ADMIN_USER_ID,
    path: process.env.ANALYTICS_PATH,
  };
  process.env.ANALYTICS_ADMIN_USER_ID = "site-owner";
  process.env.ANALYTICS_PATH = join(directory, "usage.json");
  const server = createService({
    token: "u".repeat(40),
    origins: ["https://site.example"],
    authorizeAccount: async (bearer) =>
      ["site-owner", "regular-user"].includes(bearer) ? bearer : false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, bearer) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Origin: "https://site.example",
        "Content-Type": "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
      body: JSON.stringify(body),
    });
  const rawVisitor = "random-browser-installation-123456";
  const rawSession = "random-browser-session-123456789";
  const rawPlayback = "random-playback-measurement-123456";
  try {
    assert.equal(
      (
        await post("/analytics/heartbeat", {
          visitorId: rawVisitor,
          client: "web-mobile",
        })
      ).status,
      200,
    );
    assert.equal(
      (await post("/analytics/admin", {}, "regular-user")).status,
      403,
    );
    assert.equal(
      (
        await post(
          "/analytics/account",
          {
            client: "web-desktop",
            createdAt: new Date().toISOString(),
            sessionId: rawSession,
            active: true,
          },
          "regular-user",
        )
      ).status,
      200,
    );
    for (const event of ["opened", "opened", "started", "started", "failed"])
      assert.equal(
        (
          await post(
            "/analytics/playback",
            {
              client: "android-tv",
              release: "0.3.6",
              sessionId: rawSession,
              playbackId: rawPlayback,
              event,
            },
            "regular-user",
          )
        ).status,
        200,
      );
    assert.equal(
      (
        await post(
          "/analytics/playback",
          {
            client: "android-tv",
            release: "0.3.6",
            sessionId: rawSession,
            playbackId: rawPlayback,
            event: "closed",
            durationSeconds: 31 * 60,
          },
          "regular-user",
        )
      ).status,
      200,
    );
    const response = await post("/analytics/admin", {}, "site-owner");
    assert.equal(response.status, 200);
    const summary = await response.json();
    assert.equal(summary.activeNow, 1);
    assert.equal(summary.allTime, 1);
    assert.equal(summary.visits, 1);
    assert.equal(summary.platforms["web-mobile"], 1);
    assert.equal(summary.accounts.activeNow, 1);
    assert.equal(summary.accounts.onlineNow, 1);
    assert.equal(summary.accounts.allTime, 1);
    assert.equal(summary.accounts.signupsToday, 1);
    assert.equal(summary.accounts.sessionsPerAccount, 1);
    assert.equal(summary.accounts.returning, 0);
    assert.equal(summary.accounts.retention.day1.eligible, 0);
    assert.equal(summary.playback.opened, 1);
    assert.equal(summary.playback.started, 1);
    assert.equal(summary.playback.failed, 1);
    assert.equal(summary.playback.closed, 1);
    assert.equal(summary.playback.sessionsWithPlayback, 1);
    assert.equal(summary.playback.successRate, 100);
    assert.equal(summary.playback.averageDurationMinutes, 31);
    assert.equal(summary.playback.durationBuckets.thirtyPlus, 1);
    assert.equal(summary.playback.byPlatform["android-tv"].started, 1);
    assert.equal(summary.playback.byRelease["0.3.6"].durationSamples, 1);
    assert.equal(summary.definitions.version, 3);
    assert.equal(summary.definitions.timezone, "UTC");
    assert.match(summary.definitions.retention, /on or after UTC day N/);
    assert.match(summary.definitions.returning, /two UTC calendar dates/);
    assert.match(
      summary.definitions.device,
      /Clearing storage or reinstalling/,
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    const stored = await readFile(process.env.ANALYTICS_PATH, "utf8");
    assert.ok(!stored.includes(rawVisitor));
    assert.ok(!stored.includes(rawSession));
    assert.ok(!stored.includes(rawPlayback));
    assert.ok(!stored.includes("regular-user"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous.admin === undefined)
      delete process.env.ANALYTICS_ADMIN_USER_ID;
    else process.env.ANALYTICS_ADMIN_USER_ID = previous.admin;
    if (previous.path === undefined) delete process.env.ANALYTICS_PATH;
    else process.env.ANALYTICS_PATH = previous.path;
    await rm(directory, { recursive: true, force: true });
  }
});

test("signed-in users can send private feedback and only the owner can review it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiktak-feedback-"));
  const previous = {
    admin: process.env.FEEDBACK_ADMIN_USER_ID,
    path: process.env.FEEDBACK_PATH,
  };
  process.env.FEEDBACK_ADMIN_USER_ID = "site-owner";
  process.env.FEEDBACK_PATH = join(directory, "feedback.json");
  const server = createService({
    token: "f".repeat(40),
    origins: ["https://site.example"],
    authorizeAccount: async (bearer) =>
      ["site-owner", "reporter-account"].includes(bearer) ? bearer : false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, bearer) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Origin: "https://site.example",
        "Content-Type": "application/json",
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(body),
    });
  try {
    const submitted = await post(
      "/feedback/submit",
      {
        type: "bug",
        title: "Player does not open",
        details: "The player stays closed after selecting a result.",
        page: "https://site.example/#youtube",
        client: "android-tv",
        attachments: [
          {
            name: "screen.png",
            type: "image/png",
            data: "data:image/png;base64,aGVsbG8=",
          },
        ],
      },
      "reporter-account",
    );
    assert.equal(submitted.status, 200);
    assert.equal(
      (await post("/feedback/admin", { action: "list" }, "reporter-account"))
        .status,
      403,
    );
    const listed = await post(
      "/feedback/admin",
      { action: "list" },
      "site-owner",
    );
    assert.equal(listed.status, 200);
    const inbox = await listed.json();
    assert.equal(inbox.entries.length, 1);
    assert.equal(inbox.entries[0].title, "Player does not open");
    assert.equal(inbox.entries[0].attachments.length, 1);
    assert.notEqual(inbox.entries[0].account, "reporter-account");
    const updated = await post(
      "/feedback/admin",
      {
        action: "update",
        id: inbox.entries[0].id,
        status: "planned",
      },
      "site-owner",
    );
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).entries[0].status, "planned");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const stored = await readFile(process.env.FEEDBACK_PATH, "utf8");
    assert.ok(!stored.includes("reporter-account"));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous.admin === undefined) delete process.env.FEEDBACK_ADMIN_USER_ID;
    else process.env.FEEDBACK_ADMIN_USER_ID = previous.admin;
    if (previous.path === undefined) delete process.env.FEEDBACK_PATH;
    else process.env.FEEDBACK_PATH = previous.path;
    await rm(directory, { recursive: true, force: true });
  }
});

test("account-owned friend codes stay isolated and can be revoked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tiktak-friends-"));
  const previous = {
    key: process.env.FRIEND_VAULT_KEY,
    vault: process.env.FRIEND_VAULT_PATH,
    vaults: process.env.FRIEND_VAULTS_PATH,
  };
  process.env.FRIEND_VAULT_KEY = Buffer.alloc(32, 7).toString("base64");
  process.env.FRIEND_VAULT_PATH = join(directory, "legacy.json");
  process.env.FRIEND_VAULTS_PATH = join(directory, "users.json");
  const token = "a".repeat(40);
  const server = createService({
    token,
    origins: ["https://site.example"],
    authorizeAccount: async (bearer) =>
      ["owner-one", "owner-two", "guest"].includes(bearer) ? bearer : false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (user, path, body = {}) =>
    fetch(base + path, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${user}`,
        Origin: "https://site.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const template = {
    addons: [
      {
        base: "https://addon.example/configured-secret",
        manifest: {
          id: "stream.one",
          name: "Stream one",
          resources: ["stream"],
        },
      },
    ],
    collections: [],
    homeCatalogs: [],
    autoplay: true,
  };
  try {
    const published = await request("owner-one", "/friend/setup", {
      code: "123456",
      torboxKey: "owner-one-torbox",
      realDebridKey: "owner-one-rd",
      template,
    });
    assert.equal(published.status, 200);
    const ownerAccess = await published.json();
    assert.match(ownerAccess.torboxKey, /^friend:/);
    assert.match(ownerAccess.realDebridKey, /^friend-rd:/);

    const collision = await request("owner-two", "/friend/setup", {
      code: "123456",
      torboxKey: "owner-two-torbox",
      template,
    });
    assert.equal(collision.status, 409);

    const redeemed = await request("guest", "/friend/redeem", {
      code: "123456",
    });
    assert.equal(redeemed.status, 200);
    const shared = await redeemed.json();
    assert.match(shared.torboxKey, /^friend:/);
    assert.match(shared.realDebridKey, /^friend-rd:/);
    assert.equal(
      shared.template.addons[0].base,
      "https://addon.example/configured-secret",
    );
    assert.ok(!JSON.stringify(shared).includes("owner-one-torbox"));
    assert.ok(
      !(await readFile(join(directory, "users.json"), "utf8")).includes(
        "owner-one-torbox",
      ),
    );

    const guestGrant = shared.torboxKey.slice("friend:".length);
    const repaired = await request("guest", "/friend/restore-addons", {
      urls: [
        `https://friend.tiktaktv.invalid/${guestGrant}/0/manifest.json`,
      ],
    });
    assert.equal(repaired.status, 200);
    assert.deepEqual(await repaired.json(), {
      addons: [
        {
          url: `https://friend.tiktaktv.invalid/${guestGrant}/0/manifest.json`,
          base: "https://addon.example/configured-secret",
        },
      ],
    });

    assert.equal((await request("owner-one", "/friend/revoke")).status, 200);
    assert.equal(
      (await request("guest", "/friend/redeem", { code: "123456" })).status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous.key === undefined) delete process.env.FRIEND_VAULT_KEY;
    else process.env.FRIEND_VAULT_KEY = previous.key;
    if (previous.vault === undefined) delete process.env.FRIEND_VAULT_PATH;
    else process.env.FRIEND_VAULT_PATH = previous.vault;
    if (previous.vaults === undefined) delete process.env.FRIEND_VAULTS_PATH;
    else process.env.FRIEND_VAULTS_PATH = previous.vaults;
    await rm(directory, { recursive: true, force: true });
  }
});
test("blocks loopback, RFC1918, metadata and mapped IPv6 destinations", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
  ])
    assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("1.1.1.1"), true);
  await assert.rejects(resolveTarget("http://127.0.0.1/private"));
  await assert.rejects(resolveTarget("file:///etc/passwd"));
});
test("rewrites master playlists, segments, keys and maps through opaque tickets", () => {
  const urls = [];
  const result = rewritePlaylist(
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXT-X-MAP:URI="init.mp4"\n../chunk.ts\nhttps://cdn.example/live.m3u8',
    "https://source.example/live/master.m3u8",
    (u) => {
      urls.push(u);
      return "/media/ticket" + urls.length + "/stream";
    },
  );
  assert.deepEqual(urls, [
    "https://source.example/live/key",
    "https://source.example/live/init.mp4",
    "https://source.example/chunk.ts",
    "https://cdn.example/live.m3u8",
  ]);
  assert.ok(!result.includes("source.example"));
  assert.match(result, /URI="\/media\/ticket1\/stream"/);
});
test("rejects arbitrary injected headers", () => {
  assert.throws(() => sourceHeaders({ Host: "127.0.0.1" }));
  assert.throws(() =>
    sourceHeaders({ Referer: "https://a.example\r\nInjected: true" }),
  );
  assert.deepEqual(sourceHeaders({ "User-Agent": "Player" }), {
    "User-Agent": "Player",
  });
});
test("sanitizes download filenames and always emits MP4", () => {
  assert.equal(
    safeDownloadName("../Rebel Ridge: Director's Cut?.mkv"),
    "Rebel Ridge Director's Cut .mkv.mp4",
  );
  assert.equal(safeDownloadName("movie.mp4"), "movie.mp4");
  assert.equal(safeDownloadName("\r\n"), "TikTak TV download.mp4");
});
test("does not report a successful download before the converter emits bytes", async () => {
  const previous = process.env.FFMPEG_PATH;
  process.env.FFMPEG_PATH = process.execPath;
  const token = "d".repeat(40);
  const server = createService({ token, origins: ["https://site.example"] });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const prepared = await fetch(base + "/download", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://example.com/video.mp4",
        filename: "video.mp4",
      }),
    });
    assert.equal(prepared.status, 200);
    const { path } = await prepared.json();
    const transfer = await fetch(base + path);
    assert.equal(transfer.status, 502);
    assert.match((await transfer.json()).error, /converted|source/i);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    if (previous === undefined) delete process.env.FFMPEG_PATH;
    else process.env.FFMPEG_PATH = previous;
  }
});
test("auth and origin gates, bounded paths and SSRF prevention apply to API and media preparation", async () => {
  const token = "a".repeat(40);
  const server = createService({ token, origins: ["https://site.example"] });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(base + "/health")).status, 401);
    assert.equal(
      (
        await fetch(base + "/health", {
          headers: {
            Authorization: "Bearer " + token,
            Origin: "https://evil.example",
          },
        })
      ).status,
      403,
    );
    const health = await fetch(base + "/health", {
      headers: {
        Authorization: "Bearer " + token,
        Origin: "https://site.example",
      },
    });
    assert.equal(health.status, 200);
    const healthBody = await health.json();
    assert.equal(healthBody.version, 2);
    assert.equal(healthBody.features.watchTogether, true);
    assert.equal(
      health.headers.get("access-control-allow-origin"),
      "https://site.example",
    );
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
    const statusResponse = await fetch(base + "/status", {
      method: "POST",
      headers,
      body: "{}",
    });
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.features.participantNames, true);
    assert.equal(status.features.hostEndedRoom, true);
    assert.equal(status.features.youtube, true);
    assert.equal(status.features.sponsorBlock, true);
    assert.equal(status.capacity.partyMembers, 12);
    assert.equal(
      (
        await fetch(base + "/prepare", {
          method: "POST",
          headers,
          body: JSON.stringify({ url: "http://127.0.0.1:80/" }),
        })
      ).status,
      502,
    );
    assert.equal(
      (
        await fetch(base + "/download", {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: "http://127.0.0.1/private.mp4",
            filename: "private.mp4",
          }),
        })
      ).status,
      502,
    );
    assert.equal(
      (
        await fetch(base + "/request", {
          method: "POST",
          headers,
          body: JSON.stringify({
            url: "https://example.com/admin",
            method: "POST",
          }),
        })
      ).status,
      400,
    );
    assert.equal((await fetch(base + "/media/unknown/stream")).status, 410);
    const invalidSponsor = await fetch(base + "/sponsorblock", {
      method: "POST",
      headers,
      body: JSON.stringify({ videoId: "invalid" }),
    });
    assert.equal(invalidSponsor.status, 400);
    const missingYouTubeKey = await fetch(base + "/youtube/search", {
      method: "POST",
      headers,
      body: JSON.stringify({ query: "Nuvio", kind: "video" }),
    });
    if (!process.env.YOUTUBE_API_KEY)
      assert.equal(missingYouTubeKey.status, 503);
    const youtubeAccount = await fetch(base + "/youtube/account", {
      method: "POST",
      headers,
      body: JSON.stringify({ summary: true }),
    });
    assert.equal(youtubeAccount.status, 200);
    assert.equal((await youtubeAccount.json()).connected, false);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});

test("watch parties share one prepared source and keep guests on the host timeline", async () => {
  const token = "a".repeat(40);
  const server = createService({
    token,
    origins: ["https://site.example"],
    authorizeAccount: async (bearer) =>
      bearer === "host-token"
        ? "host-user"
        : bearer === "guest-token"
          ? "guest-user"
          : false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (bearer, body) =>
    fetch(base + "/party", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Origin: "https://site.example",
      },
      body: JSON.stringify(body),
    });
  try {
    const createdResponse = await request("host-token", {
      action: "create",
      position: 42,
      paused: false,
      playback: {
        item: {
          id: "tt123",
          name: "Test Movie",
          type: "movie",
          source: "addon",
        },
        url: "https://media.example/movie/master.m3u8",
        hls: true,
        prepared: true,
        requestHeaders: { Authorization: "must-not-leak" },
      },
      member: { name: "Host profile", avatar: "https://img.example/host.png" },
    });
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json();
    assert.equal(created.host, true);
    assert.equal(
      created.playback.url,
      "https://media.example/movie/master.m3u8",
    );
    assert.equal(created.playback.requestHeaders, undefined);
    assert.equal(created.state.position, 42);
    assert.equal(created.members[0].name, "Host profile");
    assert.equal(created.members[0].avatar, "https://img.example/host.png");
    assert.equal(created.members[0].host, true);
    assert.equal(created.members[0].self, true);
    assert.match(created.members[0].key, /^[A-Za-z0-9_-]{16}$/);

    const joinedResponse = await request("guest-token", {
      action: "join",
      id: created.id,
      member: { name: "Guest profile", avatar: "javascript:alert(1)" },
    });
    assert.equal(joinedResponse.status, 200);
    const joined = await joinedResponse.json();
    assert.equal(joined.host, false);
    assert.equal(joined.participants, 2);
    assert.equal(joined.playback.url, created.playback.url);
    assert.equal(joined.members[1].name, "Guest profile");
    assert.equal(joined.members[1].avatar, "");

    const updatedResponse = await request("host-token", {
      action: "state",
      id: created.id,
      update: { position: 75.5, paused: true },
    });
    const updated = await updatedResponse.json();
    assert.equal(updated.state.position, 75.5);
    assert.equal(updated.state.paused, true);

    const stateResponse = await request("guest-token", {
      action: "state",
      id: created.id,
    });
    const state = await stateResponse.json();
    assert.equal(state.state.position, 75.5);
    assert.equal(state.state.paused, true);

    const guestEnd = await request("guest-token", {
      action: "end",
      id: created.id,
    });
    assert.equal(guestEnd.status, 403);
    const hostEnd = await request("host-token", {
      action: "end",
      id: created.id,
    });
    assert.equal(hostEnd.status, 200);
    const afterEnd = await request("guest-token", {
      action: "state",
      id: created.id,
    });
    assert.equal(afterEnd.status, 410);
    assert.match((await afterEnd.json()).error, /host ended/i);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
