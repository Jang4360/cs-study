#!/usr/bin/env bash
# OCI-1 → OCI-2 배포: 런타임 파일만 복사하고 systemd --user 서비스로 Tailscale IP에만 띄운다.
# 사용: deploy/deploy-oci2.sh   (환경변수 OCI2_HOST, OCI2_USER, OCI2_KEY, APP_DIR로 덮어쓰기 가능)
set -euo pipefail

OCI2_HOST="${OCI2_HOST:-100.125.214.91}"
OCI2_USER="${OCI2_USER:-developer}"
OCI2_KEY="${OCI2_KEY:-$HOME/.ssh/id_ed25519_oci2}"
APP_DIR="${APP_DIR:-/home/$OCI2_USER/apps/cs-study}"
PORT="${PORT:-8790}"
SSH=(ssh -i "$OCI2_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$OCI2_USER@$OCI2_HOST")
SRC="$(cd "$(dirname "$0")/.." && pwd)"

"${SSH[@]}" "command -v node >/dev/null || { echo 'node가 OCI-2에 없습니다' >&2; exit 1; }; mkdir -p '$APP_DIR'"

# 런타임에 필요한 것만 보낸다 (tests, docs, node_modules 제외)
tar -C "$SRC" -czf - server public content package.json \
  | "${SSH[@]}" "tar -C '$APP_DIR' -xzf -"

"${SSH[@]}" bash -s -- "$APP_DIR" "$PORT" <<'REMOTE'
set -euo pipefail
APP_DIR="$1"; PORT="$2"
TS_IP="$(tailscale ip -4 | head -n1)"
[ -n "$TS_IP" ] || { echo 'Tailscale IP를 찾지 못했습니다' >&2; exit 1; }
UNIT_DIR="$HOME/.config/systemd/user"; mkdir -p "$UNIT_DIR"
cat > "$UNIT_DIR/cs-quest.service" <<UNIT
[Unit]
Description=Incident Lab (cs-study) static web prototype
After=network-online.target

[Service]
Type=simple
WorkingDirectory=$APP_DIR
Environment=HOST=$TS_IP
Environment=PORT=$PORT
ExecStart=$(command -v node) server/server.mjs
Restart=on-failure
RestartSec=3

[Install]
WantedBy=default.target
UNIT
systemctl --user daemon-reload
systemctl --user enable cs-quest.service >/dev/null
systemctl --user restart cs-quest.service
sleep 1
systemctl --user --no-pager --lines=3 status cs-quest.service | head -5
curl -s -o /dev/null -w "health: %{http_code}\n" "http://$TS_IP:$PORT/"
echo "linger: $(loginctl show-user "$USER" -p Linger --value 2>/dev/null || echo unknown) (no면 로그아웃 시 서비스가 멈출 수 있음: sudo loginctl enable-linger $USER)"
echo "URL: http://$TS_IP:$PORT/"
REMOTE
