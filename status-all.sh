#!/data/data/com.termux/files/usr/bin/bash
set -u

BOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$BOT_DIR"

ADMIN_PORT_VALUE="$(
  sed -n 's/^ADMIN_PORT=//p' .env 2>/dev/null | tail -n 1 | tr -d '\r'
)"
ADMIN_PORT_VALUE="${ADMIN_PORT_VALUE:-8080}"

echo "=== Status Bot Abel ==="
pm2 status

echo
if curl -fsS "http://127.0.0.1:${ADMIN_PORT_VALUE}/api/health" >/dev/null 2>&1; then
  echo "Admin health : OK"
else
  echo "Admin health : TIDAK MERESPONS"
fi

if [ -f "logs/admin-url.txt" ]; then
  echo "Admin publik: $(cat logs/admin-url.txt)"
else
  echo "Admin publik: nonaktif/belum tersedia"
fi

echo
echo "Log bot terakhir:"
tail -n 15 logs/bot.log 2>/dev/null || true
