#!/bin/sh
set -eu

base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
repo="$base/runtime/endpoint-site"
key="$HOME/.ssh/tiktaktv_endpoint"
export GIT_SSH_COMMAND="ssh -i $key -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
set -a
. "$base/.env.native"
set +a

if [ ! -d "$repo/.git" ]; then
  rm -rf "$repo"
  git clone git@github.com:zachgus33/Tik-TakTV-Endpoint.git "$repo"
else
  git -C "$repo" pull --rebase --autostash
fi

"$HOME/.local/node/bin/node" "$base/publish-endpoint.mjs" \
  "$base/runtime/tunnel.log" "$repo/endpoint.json"
if git -C "$repo" diff --quiet -- endpoint.json; then exit 0; fi
git -C "$repo" config user.name "Tik-TakTV Pi"
git -C "$repo" config user.email "tiktaktv-pi@users.noreply.github.com"
git -C "$repo" add endpoint.json
git -C "$repo" commit -m "Update playback endpoint"
git -C "$repo" push origin main
