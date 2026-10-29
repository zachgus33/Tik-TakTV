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
token_file="$base/.cloudflared-token"
printf '%s\n' "$token" > "$token_file"
chmod 600 "$token_file"
cat > "$base/.env.tunnel" <<EOF
TUNNEL_TOKEN_FILE=$token_file
PUBLIC_PLAYBACK_URL=$public_url
EOF
chmod 600 "$base/.env.tunnel"
systemctl --user restart tiktaktv-tunnel.service
ready=0
attempt=0
while [ "$attempt" -lt 12 ]; do
  if curl -fsS --max-time 5 "$public_url/healthz" >/dev/null 2>&1; then
    ready=1
    break
  fi
  attempt=$((attempt + 1))
  sleep 5
done
if [ "$ready" -eq 1 ]; then
  systemctl --user start tiktaktv-watchdog.service
  echo "Named tunnel is healthy and published at $public_url"
else
  echo "Connector started, but $public_url is not routed yet. Add the public hostname in Cloudflare; the watchdog will publish it after it becomes healthy."
fi

