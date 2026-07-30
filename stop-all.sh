#!/data/data/com.termux/files/usr/bin/bash
# Stop semua proses bot
echo "⏹️  Menghentikan semua layanan..."
pkill -f "node index.js" && echo "   ✅ Bot WhatsApp dihentikan"
pkill -f "node admin-server.js" && echo "   ✅ Admin Panel dihentikan"
pkill -f "cloudflared" && echo "   ✅ Tunnel dihentikan"
echo ""
echo "✅ Semua layanan berhasil dihentikan!"
