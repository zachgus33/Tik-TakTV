#!/bin/sh
set -eu
base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
token="${1:-}"
public_url="${2:-https://api.tiktaktv.me}"
if [ -z "$token" ]; then
  echo "Usage: $0 TUNNEL_TOKEN [https://api.tiktaktv.me]" >&2
  exit 2
fi
case "$public_url" in
  https://*/*) echo "Use an HTTPS origin without a path." >&2; exit 2 ;;
  https://*) ;;
  *) echo "Use an HTTPS public URL." >&2; exit 2 ;;
esac
umask 077
cat > "$base/.env.tunnel" <<EOF
TUNNEL_TOKEN=$token
PUBLIC_PLAYBACK_URL=$public_url
EOF
chmod 600 "$base/.env.tunnel"
systemctl --user restart tiktaktv-tunnel.service
systemctl --user start tiktaktv-watchdog.service
echo "Named tunnel configured for $public_url"

