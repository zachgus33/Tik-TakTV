#!/bin/sh
set -eu

cd "$(dirname "$0")"
set -a
. ./.env
set +a

running="$(sudo docker compose ps --status running --services 2>/dev/null || true)"
if ! printf '%s\n' "$running" | grep -qx playback; then
  sudo docker compose up -d playback
fi

if ! curl -fsS --max-time 12 \
  -H "Authorization: Bearer $PLAYBACK_TOKEN" \
  http://127.0.0.1:3101/health >/dev/null; then
  sudo docker compose restart playback
fi

created="$(sudo docker compose ps -a --services 2>/dev/null || true)"
running="$(sudo docker compose ps --status running --services 2>/dev/null || true)"
for service in tunnel quick-tunnel; do
  if printf '%s\n' "$created" | grep -qx "$service" && \
     ! printf '%s\n' "$running" | grep -qx "$service"; then
    sudo docker compose up -d "$service"
  fi
done
