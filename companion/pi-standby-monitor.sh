#!/bin/sh
set -eu

base="${TIKTAKTV_HOME:-$HOME/tiktaktv}"
state="$base/runtime/standby-health-failures"

if curl -fsS --max-time 8 https://api.tiktaktv.me/healthz >/dev/null; then
  rm -f "$state"
  exit 0
fi

failures=0
if [ -f "$state" ]; then failures="$(cat "$state" 2>/dev/null || echo 0)"; fi
case "$failures" in (*[!0-9]*|'') failures=0 ;; esac
failures=$((failures + 1))
printf '%s\n' "$failures" > "$state.tmp"
mv "$state.tmp" "$state"

if [ "$failures" -ge 3 ]; then
  rm -f "$state"
  exec "$base/activate-standby.sh"
fi
