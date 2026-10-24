#!/bin/sh
set -eu

cd "$(dirname "$0")"
mkdir -p runtime
chmod 700 runtime

if [ ! -f .env.native ]; then
  umask 077
  printf 'PLAYBACK_TOKEN=%s\nALLOWED_ORIGINS=https://zachgus33.github.io,http://127.0.0.1:5173,http://localhost:5173\n' "$(openssl rand -hex 32)" > .env.native
fi

set -a
. ./.env.native
set +a

if [ -f runtime/playback.pid ] && kill -0 "$(cat runtime/playback.pid)" 2>/dev/null; then
  kill "$(cat runtime/playback.pid)"
fi
if [ -f runtime/tunnel.pid ] && kill -0 "$(cat runtime/tunnel.pid)" 2>/dev/null; then
  kill "$(cat runtime/tunnel.pid)"
fi

nohup "$HOME/.local/node/bin/node" server.mjs > runtime/playback.log 2>&1 &
echo $! > runtime/playback.pid

i=0
until curl -fsS -H "Authorization: Bearer $PLAYBACK_TOKEN" http://127.0.0.1:3101/health >/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo 'Playback service did not become healthy.' >&2
    tail -30 runtime/playback.log >&2
    exit 1
  fi
  sleep 1
done

nohup "$HOME/.local/bin/cloudflared" tunnel --no-autoupdate --url http://127.0.0.1:3101 > runtime/tunnel.log 2>&1 &
echo $! > runtime/tunnel.pid

echo 'Playback service is healthy. Waiting for the temporary HTTPS address.'
i=0
while :; do
  address="$(grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' runtime/tunnel.log | head -1 || true)"
  if [ -n "$address" ]; then
    echo "$address"
    break
  fi
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo 'Tunnel did not publish an address.' >&2
    tail -30 runtime/tunnel.log >&2
    exit 1
  fi
  sleep 1
done
