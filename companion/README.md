# Tik-TakTV playback service on Raspberry Pi 5

The website stays on GitHub Pages. This service runs on your Pi and supplies authenticated API forwarding, HLS relaying, and FFmpeg compatibility modes. Use Raspberry Pi OS **64-bit**, a suitable power supply and cooling. The Pi needs to stay on during playback.

## Install

Enable SSH in Raspberry Pi Imager. Sign in from your computer (`ssh YOUR_USER@YOUR_PI_IP`) and run:

```sh
sudo apt update
sudo apt install -y git curl openssl
curl -fsSL https://get.docker.com -o /tmp/tiktak-install-docker.sh
sudo sh /tmp/tiktak-install-docker.sh
git clone --branch web-enhanced-pages --single-branch https://github.com/zachgus33/Tik-TakTV.git
cd Tik-TakTV/companion
sh setup-pi.sh
```

The installer generates a private service key in `.env` (ignored by Git). It does not send it anywhere. It builds the ARM64-compatible Node/FFmpeg image and starts the playback service with a restart policy. Do not commit `.env` or paste its contents into chat.

It also installs a systemd watchdog that runs after boot and every minute. Docker restarts crashed containers immediately; the watchdog additionally checks the authenticated health endpoint and restarts an unresponsive service or stopped tunnel.

## First test, before buying a domain

```sh
sudo docker compose --profile quick up -d quick-tunnel
sudo docker compose logs quick-tunnel
```

Find the `https://...trycloudflare.com` URL. This is a temporary testing address, not a permanent hosting address. It can change when the tunnel restarts. Cloudflare Quick Tunnels have concurrency and availability limits.

The native watchdog signs the current Quick Tunnel address with the private playback key and publishes it to `zachgus33/Tik-TakTV-Endpoint`. The website verifies that signature before replacing a privately configured address. This allows automatic recovery when Cloudflare assigns a different temporary hostname. A named tunnel remains the preferred option after a domain is available.

For the native Raspberry Pi installation, `install-native-services.sh` creates persistent user services for playback, Cloudflare, endpoint publishing, and the one-minute health check. They start at boot and use systemd restart policies. The endpoint repository uses a dedicated write-enabled deploy key stored only on the Pi.

Signed-in Nuvio users may also authenticate with their short-lived Nuvio session instead of receiving the private playback key. The service validates the session against Nuvio before accepting a request. This lets another person sign into the website with their own Nuvio account and load their own profiles and add-ons without exposing the owner’s service key.

In the website's **Settings > Playback service**, paste that URL and the `PLAYBACK_TOKEN` value from the Pi's `.env`. Read it privately with `nano .env`. Click **Connect playback service**. Then connect TorBox, refresh installed manifests and test a live channel.

The default mode relays original media. If a file has unsupported audio or a container Safari cannot play, choose **Remux to HLS with compatible audio**. This copies video and converts audio to AAC. Use **Convert to 720p H.264** only as a fallback: it consumes CPU, and Pi 5 throughput depends on input resolution/codec/cooling. Conversion exposes a rolling HLS window, not full random-access VOD seeking. It supports at most two conversion sessions.

For a temporary test without Docker, install Node 24 and `cloudflared` in the user account, then run `sh run-native.sh`. This writes logs and process IDs under `runtime/` and keeps the private token in `.env.native`. Docker remains the recommended permanent setup because it restarts the service after a reboot.

## Permanent domain

For the native Pi services, create a named tunnel in Cloudflare Zero Trust,
route `api.tiktaktv.me` to `http://localhost:3101`, and copy its connector
token. Keep the domain registered at IONOS, but use the Cloudflare nameservers
shown when adding the domain to Cloudflare so the tunnel hostname receives a
valid certificate. Then run on the Pi:

```sh
cd /home/zach/tiktaktv
sh configure-named-tunnel.sh 'PASTE_CONNECTOR_TOKEN_HERE' https://api.tiktaktv.me
sh install-native-services.sh
```

The token is written to `.env.tunnel` with owner-only permissions and is never
printed or committed. Until it is configured, `run-tunnel.sh` intentionally
falls back to the signed Quick Tunnel discovery flow, so current playback keeps
working.

Create a named Cloudflare Tunnel in your own Cloudflare account after adding the domain's DNS to Cloudflare. Set its public hostname (for example `playback.example.com`) to service `http://playback:3101`. Put its tunnel token in `.env` as `TUNNEL_TOKEN`. Then:

```sh
sudo docker compose --profile quick stop quick-tunnel
sudo docker compose --profile tunnel up -d tunnel
```

Set the permanent HTTPS address in the website. When the website itself moves to a custom domain, add its exact origin to `ALLOWED_ORIGINS` in `.env`, comma-separated, then recreate the playback container:

```sh
sudo docker compose up -d playback
```

Use the tunnel rather than exposing port 3101 on your router. The Compose port binding only listens on the Pi's loopback address. HTTPS terminates at the tunnel; private-key authentication is enforced by the service. No playback URL, IPTV password, TorBox key or request header is logged by the service.

## Updates and checks

```sh
git pull --ff-only
sudo docker compose up -d --build playback
sudo docker compose ps
sudo docker compose logs --tail 30 playback
```

The `/health` endpoint requires the service key; an unauthenticated 401 is expected. The web connection test verifies it using the key. `/healthz` is a public liveness check that returns only `{ "ok": true, "version": 2 }` for uptime monitoring.

The `Production uptime and account smoke` GitHub Actions workflow runs every 30
minutes. It checks the deployed app shell and assets, PWA files, signed endpoint
record, and the Pi liveness endpoint. Add repository secrets
`NUVIO_SMOKE_EMAIL`, `NUVIO_SMOKE_PASSWORD`, and optionally
`NUVIO_SMOKE_FRIEND_CODE` to extend each run through real Nuvio authentication
and friend-service redemption without changing the test account's profile.

The service rejects private/link-local destinations and pins DNS resolution per request, including redirects. It rewrites HLS variants, segments, maps and key URLs into short-lived opaque tickets. It does not implement DRM or a torrent engine. TorBox additions remain cached-only. Account sync talks directly to Nuvio's existing backend.

## What the Pi is responsible for

The public website and browser-compatible direct streams keep working without the Pi. The Pi is the private compatibility layer for sources that a browser cannot use directly. It relays protected requests without exposing credentials, remuxes or transcodes incompatible media for Safari and other browsers, prepares MP4 downloads, relays XMLTV, stores encrypted friend setup data, and coordinates Watch Together rooms.

The authenticated `/status` response reports only safe operational data: protocol version, uptime, enabled capabilities, active media jobs, active rooms, and capacity. It never returns source URLs, add-on URLs, API keys, IPTV credentials, account identifiers, or viewing history. Media conversions are limited to two active FFmpeg sessions, Watch Together rooms hold at most twelve active members, and abandoned rooms expire after six hours.

Native systemd units apply memory, CPU, task and file-descriptor limits. The watchdog checks the service and tunnel every minute, republishes a changed tunnel address, and bounds local tunnel and FFmpeg logs. Re-run `sh install-native-services.sh` after updating these unit definitions, then verify with `systemctl --user status tiktaktv-playback tiktaktv-tunnel tiktaktv-watchdog.timer`.

## Validation limits

Automated tests cover authentication, origin restrictions, SSRF checks, header validation and playlist rewriting. A public sample HLS playlist was fetched and rewritten through the actual relay on Windows. ARM64 image startup, real provider media, and FFmpeg throughput must be checked on your Pi before calling the setup complete.

References: [Docker Debian installation](https://docs.docker.com/engine/install/debian/), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
