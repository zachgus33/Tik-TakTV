#!/bin/sh
set -eu

base="${TIKTAKTV_HOME:-/opt/tiktaktv}"
user="${TIKTAKTV_USER:-tiktaktv}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this installer as root." >&2
  exit 1
fi

install -d -o "$user" -g "$user" -m 700 "$base/runtime" "$base/cache/guides"
chown -R "$user:$user" "$base"
chmod 600 "$base/.env.native" "$base/.env.tunnel" "$base/.cloudflared-token"

cat > /etc/systemd/system/tiktaktv-companion.service <<EOF
[Unit]
Description=TikTak TV companion service
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$base
EnvironmentFile=$base/.env.native
ExecStart=/usr/local/bin/node $base/server.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$base/runtime $base/cache
MemoryMax=3G
CPUQuota=200%
TasksMax=256
LimitNOFILE=16384
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/tiktaktv-tunnel.service <<EOF
[Unit]
Description=TikTak TV Cloudflare tunnel
After=tiktaktv-companion.service network-online.target
Wants=tiktaktv-companion.service network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$base
ExecStart=/usr/bin/cloudflared tunnel --no-autoupdate run --token-file $base/.cloudflared-token
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
MemoryMax=256M
TasksMax=64
UMask=0077

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/tiktaktv-watchdog.service <<EOF
[Unit]
Description=Verify TikTak TV companion and tunnel
After=tiktaktv-companion.service tiktaktv-tunnel.service

[Service]
Type=oneshot
Environment=TIKTAKTV_HOME=$base
ExecStart=/bin/sh $base/vps-watchdog.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$base/runtime $base/cache
UMask=0077
EOF

cat > /etc/systemd/system/tiktaktv-watchdog.timer <<'EOF'
[Unit]
Description=Check TikTak TV companion every minute

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable tiktaktv-companion.service tiktaktv-tunnel.service tiktaktv-watchdog.timer
systemctl restart tiktaktv-companion.service
