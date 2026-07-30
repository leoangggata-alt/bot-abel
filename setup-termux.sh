#!/data/data/com.termux/files/usr/bin/bash
# ============================================================
#  setup-termux.sh - Setup Bot Abel di Termux (sekali jalan)
#  Cara pakai: bash setup-termux.sh
# ============================================================

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   🤖 Setup Bot Abel di Termux         ║"
echo "║   Harap sambungkan ke WiFi dulu!      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Update & install paket dasar ─────────────────────────────
echo "📦 Update paket Termux..."
pkg update -y && pkg upgrade -y

echo "📦 Install Node.js, Git, curl..."
pkg install -y nodejs git curl wget

# ── Install cloudflared untuk public link ─────────────────────
echo "🌐 Install Cloudflare Tunnel..."
pkg install -y cloudflared 2>/dev/null || {
  echo "⬇️ Download cloudflared manual..."
  wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 \
    -O $PREFIX/bin/cloudflared
  chmod +x $PREFIX/bin/cloudflared
}

# ── Clone / masuk ke folder bot ───────────────────────────────
if [ ! -d "whatsapp-bot-baileys" ]; then
  echo ""
  echo "📁 Masukkan link repo GitHub bot kamu:"
  read -p "https://github.com/... : " REPO_URL
  if [ -n "$REPO_URL" ]; then
    git clone "$REPO_URL" whatsapp-bot-baileys
  fi
fi

cd whatsapp-bot-baileys 2>/dev/null || {
  echo "❌ Folder bot tidak ditemukan!"
  echo "   Jalankan dari folder yang berisi bot"
  exit 1
}

# ── Install dependencies ──────────────────────────────────────
echo ""
echo "📦 Install npm dependencies..."
npm install

# ── Buat file .env jika belum ada ────────────────────────────
if [ ! -f ".env" ]; then
  echo ""
  echo "⚙️  Setup konfigurasi bot..."
  read -p "Masukkan GROQ API Key: " GROQ_KEY
  read -p "Nomor Owner (628xxx): " OWNER_NUM
  read -p "Nama Bisnis: " BIS_NAME

  cat > .env << EOF
GROQ_API_KEY=${GROQ_KEY}
GEMINI_API_KEY=
OWNER=${OWNER_NUM}
OWNER_NAME=Admin
OWNER_NUMBER=${OWNER_NUM}
BUSINESS_NAME=${BIS_NAME}
PREFIX=!
AI_IN_GROUP=true
AUTO_TYPING=true
WELCOME_MESSAGE=true
EOF
  echo "✅ File .env berhasil dibuat!"
fi

# ── Buat folder data & assets jika belum ada ─────────────────
mkdir -p data assets

if [ ! -f "data/products.json" ]; then
  echo "[]" > data/products.json
fi
if [ ! -f "data/orders.json" ]; then
  echo "[]" > data/orders.json
fi

# ── Install PM2 untuk keep-alive ─────────────────────────────
echo ""
echo "⚙️  Install PM2 (process manager)..."
npm install -g pm2 2>/dev/null || true

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✅ SETUP SELESAI!                    ║"
echo "║                                      ║"
echo "║  Jalankan bot dengan:                ║"
echo "║  bash start-all.sh                   ║"
echo "╚══════════════════════════════════════╝"
echo ""
