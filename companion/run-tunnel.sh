#!/bin/sh
set -eu
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -f "$base/.env.tunnel" ]; then
  set -a
  . "$base/.env.tunnel"
  set +a
fi
binary="${CLOUDFLARED_BIN:-$HOME/.local/bin/cloudflared}"
if [ -n "${TUNNEL_TOKEN_FILE:-}" ] && [ -s "$TUNNEL_TOKEN_FILE" ]; then
  exec "$binary" tunnel --no-autoupdate run --token-file "$TUNNEL_TOKEN_FILE"
fi
if [ -n "${TUNNEL_TOKEN:-}" ]; then
  exec "$binary" tunnel --no-autoupdate run --token "$TUNNEL_TOKEN"
fi
exec "$binary" tunnel --no-autoupdate \
  --logfile "$base/runtime/tunnel.log" \
  --url http://127.0.0.1:3101

