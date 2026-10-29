#!/bin/sh
set -eu

base="${TIKTAKTV_HOME:-/opt/tiktaktv}"
set -a
. "$base/.env.native"
set +a

if ! curl -fsS --max-time 12 \
  -H "Authorization: Bearer $PLAYBACK_TOKEN" \
  http://127.0.0.1:3101/health >/dev/null; then
  systemctl restart tiktaktv-companion.service
fi

if ! systemctl is-active --quiet tiktaktv-tunnel.service; then
  systemctl restart tiktaktv-tunnel.service
fi

if ! curl -fsS --max-time 15 https://api.tiktaktv.me/healthz >/dev/null; then
  systemctl restart tiktaktv-tunnel.service
fi
