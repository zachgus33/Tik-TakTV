#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v docker >/dev/null 2>&1; then
  echo 'Install Docker first using the instructions in README.md.'
  exit 1
fi
if [ ! -f .env ]; then
  umask 077
  printf 'PLAYBACK_TOKEN=%s\nALLOWED_ORIGINS=https://zachgus33.github.io\nTUNNEL_TOKEN=\n' "$(openssl rand -hex 32)" > .env
fi
sudo docker compose up -d --build playback
sh install-watchdog.sh
printf '\nPlayback service and automatic recovery installed. Your private key is in .env. Next start the testing tunnel as described in README.md.\n'
