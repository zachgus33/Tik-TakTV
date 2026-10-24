#!/bin/sh
set -eu
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
set -a
. "$base/.env.native"
set +a

if ! curl -fsS --max-time 12 \
  -H "Authorization: Bearer $PLAYBACK_TOKEN" \
  http://127.0.0.1:3101/health >/dev/null; then
  systemctl --user restart tiktaktv-playback.service
fi
if ! systemctl --user is-active --quiet tiktaktv-tunnel.service; then
  systemctl --user restart tiktaktv-tunnel.service
fi
"$base/publish-endpoint.sh"
