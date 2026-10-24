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

## First test, before buying a domain

```sh
sudo docker compose --profile quick up -d quick-tunnel
sudo docker compose logs quick-tunnel
```

Find the `https://...trycloudflare.com` URL. This is a temporary testing address, not a permanent hosting address. It can change when the tunnel restarts. Cloudflare Quick Tunnels have concurrency and availability limits.

In the website's **Settings > Playback service**, paste that URL and the `PLAYBACK_TOKEN` value from the Pi's `.env`. Read it privately with `nano .env`. Click **Connect playback service**. Then connect TorBox, refresh installed manifests and test a live channel.

The default mode relays original media. If a file has unsupported audio or a container Safari cannot play, choose **Remux to HLS with compatible audio**. This copies video and converts audio to AAC. Use **Convert to 720p H.264** only as a fallback: it consumes CPU, and Pi 5 throughput depends on input resolution/codec/cooling. Conversion exposes a rolling HLS window, not full random-access VOD seeking. It supports at most two conversion sessions.

For a temporary test without Docker, install Node 24 and `cloudflared` in the user account, then run `sh run-native.sh`. This writes logs and process IDs under `runtime/` and keeps the private token in `.env.native`. Docker remains the recommended permanent setup because it restarts the service after a reboot.

## Permanent domain

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

The `/health` endpoint requires the service key; an unauthenticated 401 is expected. The web connection test verifies it using the key.

The service rejects private/link-local destinations and pins DNS resolution per request, including redirects. It rewrites HLS variants, segments, maps and key URLs into short-lived opaque tickets. It does not implement DRM or a torrent engine. TorBox additions remain cached-only. Account sync talks directly to Nuvio's existing backend.

## Validation limits

Automated tests cover authentication, origin restrictions, SSRF checks, header validation and playlist rewriting. A public sample HLS playlist was fetched and rewritten through the actual relay on Windows. ARM64 image startup, real provider media, and FFmpeg throughput must be checked on your Pi before calling the setup complete.

References: [Docker Debian installation](https://docs.docker.com/engine/install/debian/), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/).
