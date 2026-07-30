# Menjalankan Bot Abel 24/7 di Termux

## 1. Pasang aplikasi Android

Pasang dari F-Droid, bukan Play Store:

- Termux
- Termux:Boot

Buka Termux:Boot satu kali setelah terpasang agar Android memberi izin autostart.

## 2. Salin dan ekstrak proyek

Salin `whatsapp-bot-baileys-termux.zip` ke penyimpanan internal HP. Di Termux:

```bash
termux-setup-storage
pkg install unzip -y
cd ~
unzip ~/storage/shared/Download/whatsapp-bot-baileys-termux.zip
cd whatsapp-bot-baileys
```

Jika nama/lokasi ZIP berbeda, sesuaikan path pada perintah `unzip`.

## 3. Setup dan mulai

```bash
bash setup-termux.sh
bash start-all.sh
```

Saat setup, isi `PAIRING_NUMBER` dengan nomor akun WhatsApp bot dalam format
`628...`. Lihat pairing code:

```bash
pm2 logs abel-bot --lines 100
```

Di WhatsApp buka **Perangkat tertaut → Tautkan perangkat → Tautkan dengan
nomor telepon**, lalu masukkan kode dari log.

## 4. Pastikan tetap aktif

```bash
termux-wake-lock
bash status-all.sh
```

Di pengaturan Android:

1. Baterai → Termux → **Tidak dibatasi**.
2. Baterai → Termux:Boot → **Tidak dibatasi**.
3. Izinkan Termux dan Termux:Boot berjalan di latar belakang/autostart.
4. Gunakan koneksi stabil dan charger untuk operasi terus-menerus.

Skrip setup membuat `~/.termux/boot/abel-bot.sh`. Setelah HP reboot,
Termux:Boot menjalankan bot kembali; PM2 me-restart proses bila crash.

## Perintah harian

| Perintah | Fungsi |
|---|---|
| `bash start-all.sh` | Mulai/reload semua layanan |
| `bash status-all.sh` | Status dan log terakhir |
| `pm2 logs abel-bot --lines 100` | Pantau log bot |
| `bash stop-all.sh` | Hentikan semua layanan |
| `pm2 save --force` | Simpan daftar proses PM2 |

## Panel admin

Default aman: panel hanya lokal di `http://127.0.0.1:8080`.

Untuk URL publik, edit `.env`:

```dotenv
ADMIN_USER=admin
ADMIN_PASSWORD=password-panjang-dan-unik
ENABLE_TUNNEL=true
```

Lalu:

```bash
pkg install cloudflared -y
bash start-all.sh
cat logs/admin-url.txt
```

URL `trycloudflare.com` dapat berubah saat tunnel restart. Login memakai
`ADMIN_USER` dan `ADMIN_PASSWORD`.

## Pemecahan masalah

Bot tidak terhubung:

```bash
pm2 logs abel-bot --lines 150
```

Jika sesi benar-benar logout, hentikan bot lalu hapus sesi dan pairing ulang:

```bash
bash stop-all.sh
rm -rf session
bash start-all.sh
```

Admin tidak merespons:

```bash
curl http://127.0.0.1:8080/api/health
pm2 logs abel-admin --lines 100
```

Autostart tidak berjalan setelah reboot:

```bash
ls -l ~/.termux/boot/abel-bot.sh
cat logs/boot.log
```

Pastikan Termux:Boot sudah pernah dibuka dan optimasi baterainya dimatikan.
