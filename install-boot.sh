#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

BOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BOOT_DIR="$HOME/.termux/boot"
BOOT_FILE="$BOOT_DIR/abel-bot.sh"

mkdir -p "$BOOT_DIR"

{
  printf '%s\n' '#!/data/data/com.termux/files/usr/bin/bash'
  printf '%s\n' 'termux-wake-lock 2>/dev/null || true'
  printf 'cd %q\n' "$BOT_DIR"
  printf '%s\n' 'bash start-all.sh --boot >> logs/boot.log 2>&1'
} > "$BOOT_FILE"

chmod +x "$BOOT_FILE"

echo "Autostart dibuat: $BOOT_FILE"
echo "Install dan buka Termux:Boot satu kali agar autostart diizinkan Android."
