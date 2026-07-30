#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_MAJOR="${NODE_MAJOR:-22}"

if ! command -v apt-get >/dev/null 2>&1; then
  echo "Installer ini khusus Ubuntu/Debian."
  exit 1
fi

echo "[1/6] Memasang paket dasar..."
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg git

need_node=true
if command -v node >/dev/null 2>&1; then
  installed_major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "$installed_major" -ge 20 ]; then
    need_node=false
  fi
fi

if [ "$need_node" = true ]; then
  echo "[2/6] Memasang Node.js ${NODE_MAJOR}.x..."
  sudo install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
    | sudo gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" \
    | sudo tee /etc/apt/sources.list.d/nodesource.list >/dev/null
  sudo apt-get update
  sudo apt-get install -y nodejs
else
  echo "[2/6] Node.js $(node --version) sudah memenuhi syarat."
fi

echo "[3/6] Memasang PM2..."
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install --global pm2
fi

echo "[4/6] Memasang dependensi bot..."
cd "$APP_DIR"
npm ci --omit=dev
mkdir -p data logs session
chmod 700 data session

if [ ! -f data/products.json ]; then
  cp data/products.example.json data/products.json
fi

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
  echo
  echo "File .env baru dibuat."
  echo "Edit dahulu dengan: nano $APP_DIR/.env"
  echo "Setelah selesai, jalankan ulang: bash $APP_DIR/deploy/setup-oracle.sh"
  exit 2
fi
chmod 600 .env

echo "[5/6] Menjalankan bot dan panel dengan PM2..."
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save --force

echo "[6/6] Mengaktifkan PM2 saat VM reboot..."
sudo env "PATH=$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save --force

echo
pm2 status
echo
echo "Instalasi selesai."
echo "Pantau pairing/login WhatsApp: pm2 logs abel-bot --lines 100"
echo "Panel tetap privat di 127.0.0.1:8080."
