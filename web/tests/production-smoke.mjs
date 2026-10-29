import assert from "node:assert/strict";

const site = (process.env.SITE_URL || "https://www.tiktaktv.me").replace(/\/$/, "");
const endpointRecord =
  "https://api.github.com/repos/zachgus33/Tik-TakTV-Endpoint/contents/endpoint.json?ref=main";
const timeout = (milliseconds = 20_000) => AbortSignal.timeout(milliseconds);
const checkedFetch = async (url, options = {}) => {
  const response = await fetch(url, { redirect: "follow", signal: timeout(), ...options });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return response;
};

const home = await (await checkedFetch(`${site}/?smoke=${Date.now()}#home`)).text();
assert.match(home, /<div id="root"><\/div>/, "Production app root is missing");
assert.match(home, /TikTak TV/i, "Production page title is missing");
for (const path of ["/manifest.webmanifest", "/sw.js", "/icon.svg"])
  await checkedFetch(`${site}${path}`);

const assets = [...home.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((match) => match[1]);
assert.ok(assets.length >= 2, "Production HTML did not reference built assets");
await Promise.all(assets.slice(0, 6).map((asset) => checkedFetch(new URL(asset, `${site}/`).href)));

const record = await (await checkedFetch(`${endpointRecord}&t=${Date.now()}`, {
  headers: { Accept: "application/vnd.github.raw+json" },
})).json();
assert.match(record.url, /^https:\/\//, "Endpoint record has no HTTPS URL");
assert.match(record.signature, /^[a-f0-9]{64}$/i, "Endpoint record signature is invalid");
assert.ok(Number.isFinite(record.updated), "Endpoint record timestamp is invalid");
const health = await (await checkedFetch(`${record.url}/healthz`)).json();
assert.deepEqual(health, { ok: true, version: 2 });

const email = process.env.NUVIO_SMOKE_EMAIL;
const password = process.env.NUVIO_SMOKE_PASSWORD;
if (email && password) {
  const anon =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";
  const login = await checkedFetch("https://api.nuvio.tv/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const session = await login.json();
  assert.match(session.access_token, /^eyJ/, "Smoke account did not receive a session");
  const status = await checkedFetch(`${record.url}/friend/status`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  const friend = await status.json();
  assert.equal(typeof friend.available, "boolean");
  const code = process.env.NUVIO_SMOKE_FRIEND_CODE;
  if (code) {
    const redeemed = await checkedFetch(`${record.url}/friend/redeem`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    });
    const setup = await redeemed.json();
    assert.ok(Array.isArray(setup.template?.addons), "Friend setup has no add-ons");
  }
  console.log("Authenticated account and friend-service checks passed.");
} else {
  console.log("Account smoke secrets are not configured; public checks passed.");
}
console.log(`Production smoke passed for ${site} and ${record.url}`);

