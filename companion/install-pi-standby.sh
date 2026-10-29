#!/bin/sh
set -eu

base="${TIKTAKTV_HOME:-$HOME/tiktaktv}"
units="$HOME/.config/systemd/user"
mkdir -p "$units" "$base/runtime"

cat > "$units/tiktaktv-replica-sync.service" <<EOF
[Unit]
Description=Sync TikTak TV encrypted vault from the VPS primary
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$base
ExecStart=/bin/sh $base/pi-replica-sync.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=$base/runtime $HOME/.ssh
UMask=0077
EOF

cat > "$units/tiktaktv-replica-sync.timer" <<'EOF'
[Unit]
Description=Keep the TikTak TV Pi standby current

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > "$base/activate-standby.sh" <<'EOF'
#!/bin/sh
set -eu
systemctl --user start tiktaktv-replica-sync.service
systemctl --user disable --now tiktaktv-replica-sync.timer
systemctl --user restart tiktaktv-playback.service
systemctl --user enable --now tiktaktv-tunnel.service tiktaktv-watchdog.timer
EOF

cat > "$base/deactivate-standby.sh" <<'EOF'
#!/bin/sh
set -eu
systemctl --user disable --now tiktaktv-watchdog.timer tiktaktv-tunnel.service
systemctl --user enable --now tiktaktv-replica-sync.timer
EOF

chmod 700 "$base/pi-replica-sync.sh" "$base/activate-standby.sh" "$base/deactivate-standby.sh"
systemctl --user daemon-reload
systemctl --user disable --now tiktaktv-watchdog.timer tiktaktv-tunnel.service
systemctl --user enable --now tiktaktv-replica-sync.timer
systemctl --user start tiktaktv-replica-sync.service
