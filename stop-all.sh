#!/data/data/com.termux/files/usr/bin/bash
set -u

BOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$BOT_DIR"

echo "Menghentikan layanan Bot Abel..."

if command -v pm2 >/dev/null 2>&1; then
  pm2 delete abel-bot abel-admin abel-tunnel 2>/dev/null || true
  pm2 save --force >/dev/null 2>&1 || true
else
  echo "PM2 tidak ditemukan; mencoba menghentikan proses lama."
  pkill -f "node index.js" 2>/dev/null || true
  pkill -f "node admin-server.js" 2>/dev/null || true
  pkill -f "cloudflared tunnel" 2>/dev/null || true
fi

rm -f logs/admin-url.txt
termux-wake-unlock 2>/dev/null || true
echo "Semua layanan Bot Abel sudah dihentikan."
