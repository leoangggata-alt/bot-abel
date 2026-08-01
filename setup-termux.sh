#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

echo
echo "========================================"
echo " Setup Bot Abel 24/7 di Termux"
echo "========================================"
echo

echo "[1/6] Memperbarui paket Termux..."
pkg update -y
pkg install -y nodejs git curl

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "$SCRIPT_DIR/package.json" ]; then
  BOT_DIR="$SCRIPT_DIR"
elif [ -f "$PWD/package.json" ]; then
  BOT_DIR="$PWD"
else
  echo "package.json tidak ditemukan."
  echo "Salin proyek ke Termux, masuk ke foldernya, lalu jalankan skrip ini."
  exit 1
fi

cd "$BOT_DIR"
mkdir -p data assets logs session session-arka

echo "[2/6] Memasang dependency bot..."
if [ -f package-lock.json ]; then
  npm ci --omit=dev --omit=optional --omit=peer
else
  npm install --omit=dev --omit=optional --omit=peer
fi

echo "[3/6] Memasang PM2..."
npm install -g pm2

if [ ! -f ".env" ]; then
  echo
  echo "[4/6] Membuat konfigurasi bot..."
  read -r -p "Nomor WhatsApp bot untuk pairing code opsional (628xxx): " PAIRING_NUMBER_VALUE
  read -r -p "Nomor owner (628xxx): " OWNER_NUMBER_VALUE
  read -r -p "Nama bisnis [Bot Abel]: " BUSINESS_NAME_VALUE
  read -r -p "GROQ API key (boleh dikosongkan): " GROQ_KEY_VALUE
  read -r -p "Gemini API key (boleh dikosongkan): " GEMINI_KEY_VALUE
  read -r -p "Username panel admin [admin]: " ADMIN_USER_VALUE
  read -r -s -p "Password panel admin (Enter = buat otomatis): " ADMIN_PASSWORD_VALUE
  echo

  BUSINESS_NAME_VALUE="${BUSINESS_NAME_VALUE:-Bot Abel}"
  ADMIN_USER_VALUE="${ADMIN_USER_VALUE:-admin}"
  if [ -z "$ADMIN_PASSWORD_VALUE" ]; then
    ADMIN_PASSWORD_VALUE="$(
      node -e "console.log(require('crypto').randomBytes(12).toString('base64url'))"
    )"
  fi

  cat > .env <<EOF
GROQ_API_KEY=${GROQ_KEY_VALUE}
GEMINI_API_KEY=${GEMINI_KEY_VALUE}
BUSINESS_NAME=${BUSINESS_NAME_VALUE}
OWNER_NAME=Admin
OWNER_NUMBER=${OWNER_NUMBER_VALUE}
PAIRING_NUMBER=${PAIRING_NUMBER_VALUE}
BOT_PREFIX=!
BOT_HOST_NAME=HP Termux
BOT_HOST_ROLE=primary
AUTO_READ=true
AUTO_TYPING=true
ANTI_SPAM=true
WELCOME_MESSAGE=true
AI_IN_GROUP=true
ADMIN_HOST=0.0.0.0
ADMIN_PORT=8080
ADMIN_USER=${ADMIN_USER_VALUE}
ADMIN_PASSWORD=${ADMIN_PASSWORD_VALUE}
ENABLE_TUNNEL=false
EOF
  chmod 600 .env
  echo "Konfigurasi tersimpan di .env"
  echo "Login panel admin: ${ADMIN_USER_VALUE} / ${ADMIN_PASSWORD_VALUE}"
else
  echo "[4/6] .env sudah ada; konfigurasi lama dipertahankan."

  ensure_env_key() {
    local key="$1"
    local value="$2"
    if ! grep -q "^${key}=" .env; then
      printf '%s=%s\n' "$key" "$value" >> .env
    fi
  }

  ensure_env_key "PAIRING_NUMBER" ""
  ensure_env_key "BOT_PREFIX" "!"
  ensure_env_key "BOT_HOST_NAME" "HP Termux"
  ensure_env_key "BOT_HOST_ROLE" "primary"
  ensure_env_key "ADMIN_HOST" "0.0.0.0"
  ensure_env_key "ADMIN_PORT" "8080"
  ensure_env_key "ADMIN_USER" "admin"
  ensure_env_key "ADMIN_PASSWORD" ""
  ensure_env_key "ENABLE_TUNNEL" "false"
  chmod 600 .env
fi

[ -f data/products.json ] || printf '[]\n' > data/products.json
[ -f data/orders.json ] || printf '[]\n' > data/orders.json

echo "[5/6] Menyiapkan autostart saat HP reboot..."
bash install-boot.sh

echo "[6/6] Memeriksa opsi tunnel..."
ENABLE_TUNNEL_VALUE="$(
  sed -n 's/^ENABLE_TUNNEL=//p' .env | tail -n 1 | tr -d '\r'
)"
if [ "${ENABLE_TUNNEL_VALUE,,}" = "true" ]; then
  pkg install -y cloudflared
else
  echo "Tunnel publik nonaktif. Panel admin hanya tersedia lokal."
fi

echo
echo "Setup selesai."
echo "Jalankan bot: bash start-all.sh"
echo "Lihat status: bash status-all.sh"
echo "Panel di HP: http://127.0.0.1:8080"
echo "Panel ringan: http://127.0.0.1:8080/m"
echo
echo "Agar benar-benar 24/7:"
echo "1. Install Termux:Boot dari F-Droid dan buka aplikasinya satu kali."
echo "2. Nonaktifkan optimasi baterai untuk Termux dan Termux:Boot."
echo "3. Jalankan: termux-wake-lock"
