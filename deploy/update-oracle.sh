#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "File .env belum ada. Jalankan deploy/setup-oracle.sh terlebih dahulu."
  exit 1
fi

git pull --ff-only
npm ci --omit=dev
pm2 startOrReload ecosystem.config.cjs --update-env
pm2 save --force
pm2 status
