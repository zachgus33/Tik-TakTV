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
  safeDownloadName,
  sourceHeaders,
} from "./server.mjs";

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
        manifest: { id: "stream.one", name: "Stream one", resources: ["stream"] },
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
    assert.match(shared.template.addons[0].base, /^https:\/\/friend\.tiktaktv\.invalid\//);
    assert.ok(!JSON.stringify(shared).includes("owner-one-torbox"));
    assert.ok(!JSON.stringify(shared).includes("configured-secret"));
    assert.ok(!(await readFile(join(directory, "users.json"), "utf8")).includes("owner-one-torbox"));

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
