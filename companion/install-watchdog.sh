#!/bin/sh
set -eu

directory="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
user="$(id -un)"

sudo tee /etc/systemd/system/tiktaktv-watchdog.service >/dev/null <<EOF
[Unit]
Description=Tik-TakTV playback service health check
After=docker.service network-online.target
Wants=docker.service network-online.target

[Service]
Type=oneshot
User=$user
WorkingDirectory=$directory
ExecStart=/bin/sh $directory/watchdog.sh
EOF

sudo tee /etc/systemd/system/tiktaktv-watchdog.timer >/dev/null <<'EOF'
[Unit]
Description=Check Tik-TakTV playback service every minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now tiktaktv-watchdog.timer
sudo systemctl start tiktaktv-watchdog.service
sudo systemctl --no-pager status tiktaktv-watchdog.timer
