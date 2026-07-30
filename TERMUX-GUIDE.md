# 📱 Panduan Lengkap: Bot Abel di Termux (HP Android)

## Persiapan
- HP Android (minimal 2GB RAM)
- Koneksi internet stabil
- Charger selalu tancap

---

## Langkah 1: Install Termux

> ⚠️ **Jangan install dari Play Store** — versi sudah kadaluarsa!

1. Buka: **https://f-droid.org**
2. Cari dan download **Termux**
3. Install APK-nya

---

## Langkah 2: Upload kode bot ke HP

**Pilihan A — Via GitHub:**
```bash
# Di Termux, ketik:
pkg install git nodejs -y
git clone https://github.com/USERNAME/bot-abel.git
cd bot-abel
npm install
```

**Pilihan B — Via USB/Copy langsung:**
1. Copy folder bot ke HP (misal: `/sdcard/bot-abel/`)
2. Di Termux:
```bash
pkg install nodejs -y
cp -r /sdcard/bot-abel ~/bot-abel
cd ~/bot-abel
npm install
```

---

## Langkah 3: Setup bot

```bash
bash setup-termux.sh
```

Script akan otomatis install semua yang dibutuhkan.

---

## Langkah 4: Jalankan bot

```bash
bash start-all.sh
```

Output yang akan muncul:
```
✅ Bot WhatsApp    : AKTIF
✅ Admin Panel     : AKTIF
🌐 LINK ADMIN PANEL:
   https://xxx-xxx.trycloudflare.com
```

**Link itu bisa dibuka dari HP/PC manapun!** 🎉

---

## Perintah Penting

| Perintah | Fungsi |
|---|---|
| `bash start-all.sh` | Jalankan semua |
| `bash stop-all.sh` | Stop semua |
| `tail -f logs/bot.log` | Lihat log bot live |
| `cat logs/admin-url.txt` | Lihat link admin panel |

---

## Tips Agar HP Tidak Sleep

**Metode 1 — Termux Wake Lock:**
```bash
termux-wake-lock
```

**Metode 2 — Pengaturan HP:**
- Matikan *Battery Optimization* untuk Termux
- Aktifkan *Keep Screen On* (opsional)
- Pengaturan → Baterai → Termux → Tidak dibatasi

**Metode 3 — Termux:Boot (Otomatis Start saat HP nyala):**
1. Install **Termux:Boot** dari F-Droid
2. Buat file:
```bash
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-bot.sh << 'EOF'
#!/data/data/com.termux/files/usr/bin/bash
cd ~/bot-abel
bash start-all.sh
EOF
chmod +x ~/.termux/boot/start-bot.sh
```

---

## Akses Admin Panel dari Manapun

Setelah `bash start-all.sh`, kamu dapat URL seperti:
```
https://quiet-bird-1234.trycloudflare.com
```

Buka link itu dari **HP lain, laptop, atau PC** untuk kelola produk! ✅

> 💡 URL berubah setiap kali restart. Untuk URL tetap, gunakan **Cloudflare Tunnel** berbayar atau **ngrok** dengan akun gratis.

---

## Troubleshooting

**Bot tidak connect WhatsApp:**
```bash
# Hapus session dan scan ulang
rm -rf session/
node index.js
```

**Admin panel tidak bisa dibuka:**
```bash
# Cek apakah berjalan
curl http://localhost:8080/api/stats
```

**Tunnel tidak dapat URL:**
```bash
cat logs/tunnel.log | grep trycloudflare
```
