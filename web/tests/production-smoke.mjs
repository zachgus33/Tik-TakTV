import assert from "node:assert/strict";

const site = (process.env.SITE_URL || "https://www.tiktaktv.me").replace(
  /\/$/,
  "",
);
const endpointRecord =
  "https://api.github.com/repos/zachgus33/Tik-TakTV-Endpoint/contents/endpoint.json?ref=main";
const rawEndpointRecord =
  "https://raw.githubusercontent.com/zachgus33/Tik-TakTV-Endpoint/main/endpoint.json";
const timeout = (milliseconds = 20_000) => AbortSignal.timeout(milliseconds);
const checkedFetch = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: "follow",
    signal: timeout(),
    ...options,
  });
  assert.ok(response.ok, `${url} returned HTTP ${response.status}`);
  return response;
};

const home = await (
  await checkedFetch(`${site}/?smoke=${Date.now()}#home`)
).text();
assert.match(home, /<div id="root"><\/div>/, "Production app root is missing");
assert.match(home, /TikTak TV/i, "Production page title is missing");
for (const path of ["/manifest.webmanifest", "/sw.js", "/icon.svg"])
  await checkedFetch(`${site}${path}`);

const assets = [...home.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map(
  (match) => match[1],
);
assert.ok(assets.length >= 2, "Production HTML did not reference built assets");
await Promise.all(
  assets
    .slice(0, 6)
    .map((asset) => checkedFetch(new URL(asset, `${site}/`).href)),
);

const endpointHeaders = { Accept: "application/vnd.github.raw+json" };
if (process.env.ENDPOINT_GITHUB_TOKEN)
  endpointHeaders.Authorization = `Bearer ${process.env.ENDPOINT_GITHUB_TOKEN}`;
let recordResponse = await fetch(`${endpointRecord}&t=${Date.now()}`, {
  headers: endpointHeaders,
  cache: "no-store",
  signal: timeout(),
});
if (!recordResponse.ok)
  recordResponse = await checkedFetch(`${rawEndpointRecord}?t=${Date.now()}`);
const record = await recordResponse.json();
assert.equal(
  record.url,
  "https://api.tiktaktv.me",
  "Endpoint record is not using the permanent companion address",
);
assert.match(
  record.signature,
  /^[a-f0-9]{64}$/i,
  "Endpoint record signature is invalid",
);
assert.ok(
  Number.isFinite(record.updated),
  "Endpoint record timestamp is invalid",
);
const siteOrigin = new URL(site).origin;
const healthResponse = await checkedFetch(`${record.url}/healthz`, {
  headers: { Origin: siteOrigin },
});
assert.equal(
  healthResponse.headers.get("access-control-allow-origin"),
  siteOrigin,
  "Companion CORS does not allow the production website",
);
const health = await healthResponse.json();
assert.deepEqual(health, { ok: true, version: 2 });

const preflight = await checkedFetch(`${record.url}/prepare`, {
  method: "OPTIONS",
  headers: {
    Origin: siteOrigin,
    "Access-Control-Request-Method": "POST",
    "Access-Control-Request-Headers": "authorization,content-type",
  },
});
assert.equal(
  preflight.headers.get("access-control-allow-origin"),
  siteOrigin,
  "Companion preflight rejected the production website",
);

const email = process.env.NUVIO_SMOKE_EMAIL;
const password = process.env.NUVIO_SMOKE_PASSWORD;
if (email && password) {
  const anon =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgxNTIxMzQ2LCJleHAiOjE5MzkyMDEzNDZ9.tmQaj682pwzehpqlgCDMnySOqiUvpgRbrE43T4VJpDI";
  const login = await checkedFetch(
    "https://api.nuvio.tv/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { apikey: anon, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  const session = await login.json();
  assert.match(
    session.access_token,
    /^eyJ/,
    "Smoke account did not receive a session",
  );
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
    assert.ok(
      Array.isArray(setup.template?.addons),
      "Friend setup has no add-ons",
    );

    const contentId = process.env.NUVIO_SMOKE_CONTENT_ID || "tt0111161";
    let discovered = 0;
    for (let index = 0; index < setup.template.addons.length; index += 1) {
      const addon = setup.template.addons[index];
      if (!addon?.manifest?.resources?.includes?.("stream")) continue;
      const shared = new URL(addon.base);
      const response = await fetch(
        `${record.url}/friend/addon${shared.pathname}/stream/movie/${contentId}.json`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          signal: timeout(),
        },
      );
      if (!response.ok) continue;
      const result = await response.json();
      discovered += Array.isArray(result.streams) ? result.streams.length : 0;
      if (discovered) break;
    }
    assert.ok(discovered > 0, "Friend setup discovered no playable sources");
  }

  const prepared = await checkedFetch(`${record.url}/prepare`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Origin: siteOrigin,
    },
    body: JSON.stringify({
      url: "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      mode: "direct",
    }),
  });
  const preparedBody = await prepared.json();
  assert.match(
    preparedBody.path,
    /^\/media\//,
    "Safe test stream was not prepared",
  );
  console.log("Authenticated account and friend-service checks passed.");
} else {
  console.log(
    "Account smoke secrets are not configured; public checks passed.",
  );
}
console.log(`Production smoke passed for ${site} and ${record.url}`);
