#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  start-all.sh - Jalankan Bot Abel + Admin Panel + Public Link
#  Cara pakai: bash start-all.sh
# ============================================================

clear
echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🤖 Bot Abel - Starting All...       ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Matikan proses lama ───────────────────────────────────────
pkill -f "node index.js" 2>/dev/null
pkill -f "node admin-server.js" 2>/dev/null
pkill -f "cloudflared" 2>/dev/null
sleep 1

# ── Jalankan Bot WhatsApp di background ──────────────────────
echo "🤖 Memulai Bot WhatsApp..."
nohup node index.js > logs/bot.log 2>&1 &
BOT_PID=$!
echo "   ✅ Bot PID: $BOT_PID"
sleep 2

# ── Jalankan Admin Panel di background ───────────────────────
echo "🛠️  Memulai Admin Panel (port 8080)..."
nohup node admin-server.js > logs/admin.log 2>&1 &
ADMIN_PID=$!
echo "   ✅ Admin PID: $ADMIN_PID"
sleep 2

# ── Jalankan Cloudflare Tunnel untuk Admin Panel ─────────────
echo "🌐 Membuat link publik Admin Panel..."
mkdir -p logs
nohup cloudflared tunnel --url http://localhost:8080 > logs/tunnel.log 2>&1 &
CF_PID=$!

# ── Tunggu URL tunnel muncul ─────────────────────────────────
echo "   ⏳ Menunggu URL tunnel..."
sleep 5

TUNNEL_URL=""
for i in {1..15}; do
  TUNNEL_URL=$(grep -o 'https://[a-z0-9\-]*\.trycloudflare\.com' logs/tunnel.log 2>/dev/null | head -1)
  if [ -n "$TUNNEL_URL" ]; then
    break
  fi
  sleep 2
done

# ── Simpan URL ke file ───────────────────────────────────────
if [ -n "$TUNNEL_URL" ]; then
  echo "$TUNNEL_URL" > logs/admin-url.txt
fi

# ── Tampilkan info ───────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅ SEMUA LAYANAN AKTIF!              ║"
echo "╠══════════════════════════════════════╣"
echo "║  🤖 Bot WhatsApp   : AKTIF           ║"
echo "║  🛠️  Admin Panel    : AKTIF           ║"
if [ -n "$TUNNEL_URL" ]; then
echo "╠══════════════════════════════════════╣"
echo "║  🌐 LINK ADMIN PANEL:                ║"
echo "║  $TUNNEL_URL"
echo "╚══════════════════════════════════════╝"
else
echo "╠══════════════════════════════════════╣"
echo "║  ⚠️  Tunnel belum dapat URL           ║"
echo "║  Cek: cat logs/tunnel.log            ║"
echo "╚══════════════════════════════════════╝"
fi

echo ""
echo "📋 Perintah berguna:"
echo "   Lihat log bot   : tail -f logs/bot.log"
echo "   Lihat log admin : tail -f logs/admin.log"
echo "   Lihat URL tunnel: cat logs/admin-url.txt"
echo "   Stop semua      : bash stop-all.sh"
echo ""

# ── Tampilkan log bot secara live ────────────────────────────
echo "📡 Live Log Bot (Ctrl+C untuk berhenti menonton):"
echo "─────────────────────────────────────────────────"
sleep 1
tail -f logs/bot.log
