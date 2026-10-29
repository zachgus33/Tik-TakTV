#!/bin/sh
set -eu

base="${TIKTAKTV_HOME:-$HOME/tiktaktv}"
remote="${TIKTAKTV_REPLICA_REMOTE:-tiktaktv-sync@74.208.200.94:}"
key="${TIKTAKTV_REPLICA_KEY:-$HOME/.ssh/tiktaktv_replica}"
staging="$(mktemp -d "$base/runtime/replica-sync.XXXXXX")"
trap 'rm -rf "$staging"' EXIT HUP INT TERM

rsync -a \
  -e "ssh -F /dev/null -i $key -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  --include='friend-vault*.json' \
  --exclude='*' \
  "$remote" "$staging/"

for source in "$staging"/friend-vault*.json; do
  [ -f "$source" ] || continue
  target="$base/runtime/$(basename "$source")"
  chmod 600 "$source"
  mv "$source" "$target"
done
