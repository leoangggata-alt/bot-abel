#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

BOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$BOT_DIR"
mkdir -p logs data session session-arka

if [ ! -f ".env" ]; then
  echo "File .env belum ada. Jalankan: bash setup-termux.sh"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js belum terpasang. Jalankan: bash setup-termux.sh"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "PM2 belum terpasang; memasang sekarang..."
  npm install -g pm2
fi

termux-wake-lock 2>/dev/null || true

# Muat nilai sederhana dari .env tanpa mengeksekusi isi file.
env_value() {
  local key="$1"
  sed -n "s/^${key}=//p" .env | tail -n 1 | tr -d '\r'
}

ENABLE_TUNNEL_VALUE="$(env_value ENABLE_TUNNEL)"
ADMIN_PASSWORD_VALUE="$(env_value ADMIN_PASSWORD)"
ADMIN_PORT_VALUE="$(env_value ADMIN_PORT)"
ADMIN_PORT_VALUE="${ADMIN_PORT_VALUE:-8080}"
BOT_HOST_ROLE_VALUE="$(env_value BOT_HOST_ROLE)"
BOT_HOST_ROLE_VALUE="${BOT_HOST_ROLE_VALUE:-primary}"

if [ "${ENABLE_TUNNEL_VALUE,,}" = "true" ]; then
  if [ -z "$ADMIN_PASSWORD_VALUE" ]; then
    echo "ENABLE_TUNNEL=true tetapi ADMIN_PASSWORD kosong."
    echo "Isi sandi admin di .env sebelum membuka panel ke internet."
    exit 1
  fi
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "cloudflared belum terpasang. Jalankan: bash setup-termux.sh"
    exit 1
  fi
else
  pm2 delete abel-tunnel >/dev/null 2>&1 || true
  rm -f logs/admin-url.txt
fi

echo "Menjalankan layanan Bot Abel dengan PM2..."
echo "Mode awal host: ${BOT_HOST_ROLE_VALUE^^}"
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save --force >/dev/null

sleep 3
pm2 status

echo
echo "Bot berjalan di background dan akan di-restart otomatis bila crash."
echo "Status : bash status-all.sh"
echo "Log    : pm2 logs abel-bot --lines 100"
echo "Stop   : bash stop-all.sh"

if [ "${ENABLE_TUNNEL_VALUE,,}" = "true" ]; then
  echo
  echo "Menunggu URL admin publik..."
  for _ in $(seq 1 20); do
    if [ -s logs/admin-url.txt ]; then
      echo "Admin  : $(cat logs/admin-url.txt)"
      echo "Login  : $(env_value ADMIN_USER)"
      break
    fi
    sleep 1
  done
  if [ ! -s logs/admin-url.txt ]; then
    echo "URL belum tersedia. Cek: pm2 logs abel-tunnel --lines 100"
  fi
else
  echo "Admin  : http://127.0.0.1:${ADMIN_PORT_VALUE}"
  echo "Mobile : http://127.0.0.1:${ADMIN_PORT_VALUE}/m"
  echo "PC Wi-Fi: lihat alamat LAN pada Dashboard panel"
  echo "Tunnel : nonaktif (ubah ENABLE_TUNNEL=true bila perlu akses dari luar Wi-Fi)"
fi

if [ "${1:-}" = "--logs" ]; then
  pm2 logs abel-bot --lines 100
fi
