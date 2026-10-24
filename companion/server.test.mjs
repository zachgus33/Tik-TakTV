import test from "node:test";
import assert from "node:assert/strict";
import {
  createService,
  publicAddress,
  resolveTarget,
  rewritePlaylist,
  sourceHeaders,
} from "./server.mjs";
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
    assert.equal(
      health.headers.get("access-control-allow-origin"),
      "https://site.example",
    );
    const headers = {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    };
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
