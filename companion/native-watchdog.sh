#!/bin/sh
set -eu
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
set -a
. "$base/.env.native"
if [ -f "$base/.env.tunnel" ]; then . "$base/.env.tunnel"; fi
set +a

if ! curl -fsS --max-time 12 \
  -H "Authorization: Bearer $PLAYBACK_TOKEN" \
  http://127.0.0.1:3101/health >/dev/null; then
  systemctl --user restart tiktaktv-playback.service
fi
if ! systemctl --user is-active --quiet tiktaktv-tunnel.service; then
  systemctl --user restart tiktaktv-tunnel.service
fi
if [ -n "${PUBLIC_PLAYBACK_URL:-}" ] &&
   ! curl -fsS --max-time 12 "$PUBLIC_PLAYBACK_URL/healthz" >/dev/null; then
  # Keep the last known-good discovery record until the named hostname is live.
  exit 0
fi
# Quick-tunnel discovery needs this file, but it must not grow forever.
if [ -f "$base/runtime/tunnel.log" ] &&
   [ "$(wc -c < "$base/runtime/tunnel.log")" -gt 5242880 ]; then
  tail -c 1048576 "$base/runtime/tunnel.log" > "$base/runtime/tunnel.log.tmp"
  mv "$base/runtime/tunnel.log.tmp" "$base/runtime/tunnel.log"
fi
if [ -f "$base/runtime/ffmpeg-last.log" ] &&
   [ "$(wc -c < "$base/runtime/ffmpeg-last.log")" -gt 1048576 ]; then
  : > "$base/runtime/ffmpeg-last.log"
fi
"$base/publish-endpoint.sh"
