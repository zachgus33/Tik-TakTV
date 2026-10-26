#!/bin/sh
set -eu

base="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
units="$HOME/.config/systemd/user"
mkdir -p "$units" "$base/runtime"
chmod 700 "$base/runtime"

cat > "$units/tiktaktv-playback.service" <<EOF
[Unit]
Description=Tik-TakTV playback service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$base
EnvironmentFile=$base/.env.native
ExecStart=$HOME/.local/node/bin/node $base/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=default.target
EOF

cat > "$units/tiktaktv-tunnel.service" <<EOF
[Unit]
Description=Tik-TakTV Cloudflare tunnel
After=tiktaktv-playback.service network-online.target
Wants=tiktaktv-playback.service

[Service]
Type=simple
WorkingDirectory=$base
ExecStart=$HOME/.local/bin/cloudflared tunnel --no-autoupdate --logfile $base/runtime/tunnel.log --url http://127.0.0.1:3101
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

cat > "$units/tiktaktv-watchdog.service" <<EOF
[Unit]
Description=Verify Tik-TakTV and publish its current endpoint
After=tiktaktv-tunnel.service

[Service]
Type=oneshot
WorkingDirectory=$base
ExecStart=/bin/sh $base/native-watchdog.sh
EOF

cat > "$units/tiktaktv-watchdog.timer" <<'EOF'
[Unit]
Description=Check Tik-TakTV every minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
EOF

if [ -f "$base/runtime/playback.pid" ]; then kill "$(cat "$base/runtime/playback.pid")" 2>/dev/null || true; fi
if [ -f "$base/runtime/tunnel.pid" ]; then kill "$(cat "$base/runtime/tunnel.pid")" 2>/dev/null || true; fi
systemctl --user daemon-reload
systemctl --user enable --now tiktaktv-playback.service tiktaktv-tunnel.service tiktaktv-watchdog.timer
systemctl --user start tiktaktv-watchdog.service
systemctl --user --no-pager status tiktaktv-playback.service tiktaktv-tunnel.service tiktaktv-watchdog.timer
