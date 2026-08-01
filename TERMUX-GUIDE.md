# Bot Abel: Termux PRIMARY + PC STANDBY

Arsitektur yang dipakai:

- **HP Termux = PRIMARY**: bot WhatsApp dan panel berjalan 24 jam.
- **PC = STANDBY**: panel lokal tetap dapat hidup, tetapi socket WhatsApp dimatikan.
- Hanya satu perangkat boleh menjadi PRIMARY agar pesan tidak dijawab dua kali.

## 1. Pasang aplikasi Android

Pasang **Termux** dan **Termux:Boot** dari sumber yang sama (F-Droid atau rilis
GitHub resmi). Jangan mencampur aplikasi Termux dari sumber berbeda. Setelah
Termux:Boot terpasang, buka aplikasinya satu kali.

Di pengaturan Android, ubah penggunaan baterai Termux dan Termux:Boot menjadi
**Tidak dibatasi**, lalu izinkan aktivitas latar belakang/autostart.

## 2. Ambil proyek dari GitHub

Di Termux:

```bash
pkg update -y
pkg install git -y
cd ~
git clone https://github.com/leoangggata-alt/bot-abel.git whatsapp-bot-baileys
cd whatsapp-bot-baileys
bash setup-termux.sh
```

Setup memasang Node.js, dependency, PM2, membuat `.env`, dan memasang skrip
Termux:Boot. API key dapat diisi saat setup atau setelah panel aktif.

## 3. Jalankan panel dan bot

Sebelum menautkan WhatsApp di HP, buka panel PC dan pilih
**Jadikan STANDBY**. Lalu di Termux:

```bash
bash start-all.sh
```

Buka panel pada HP:

```text
http://127.0.0.1:8080
```

Login memakai `ADMIN_USER` dan `ADMIN_PASSWORD` yang dibuat saat setup. Pada
Dashboard pastikan mode HP adalah **PRIMARY**. Buka menu **Duo Bot**, pilih
metode QR, lalu pindai QR Abel dan Arka dari akun WhatsApp masing-masing.

## 4. Buka panel Termux dari PC

HP dan PC harus memakai Wi-Fi yang sama. Dashboard panel HP menampilkan alamat
LAN, misalnya:

```text
http://192.168.1.10:8080
```

Buka alamat itu dari browser PC. Jangan membuka port router. Untuk akses dari
luar jaringan, isi password admin yang kuat dan aktifkan Cloudflare Tunnel:

```dotenv
ENABLE_TUNNEL=true
```

Kemudian:

```bash
pkg install cloudflared -y
bash start-all.sh
cat logs/admin-url.txt
```

URL Quick Tunnel dapat berubah setelah proses restart.

## 5. Auto-start dan 24 jam

Setup membuat `~/.termux/boot/abel-bot.sh`. Pastikan:

1. Termux:Boot sudah dibuka satu kali.
2. Optimasi baterai Termux dan Termux:Boot dinonaktifkan.
3. HP memiliki koneksi stabil dan sebaiknya tersambung pengisi daya yang aman.
4. Jalankan `termux-wake-lock` bila indikator wake lock belum aktif.

Android masih dapat menghentikan proses karena kebijakan baterai/memori, jadi
Termux adalah solusi best-effort, bukan SLA server. PM2 memulai ulang aplikasi
yang crash dan Termux:Boot memulainya lagi setelah HP reboot.

## 6. Beralih host

### Termux ke PC

1. Dashboard Termux → **Jadikan STANDBY**.
2. Nyalakan panel PC → **Jadikan PRIMARY**.

### PC ke Termux

1. Dashboard PC → **Jadikan STANDBY**.
2. Dashboard Termux → **Jadikan PRIMARY**.

Data, API key, dan sesi WhatsApp tersimpan lokal pada masing-masing perangkat.
Perubahan produk pada satu host tidak otomatis disalin ke host lain.

## Perintah harian

| Perintah | Fungsi |
|---|---|
| `bash start-all.sh` | Menjalankan bot dan panel melalui PM2 |
| `bash status-all.sh` | Melihat status dan log terakhir |
| `pm2 logs abel-bot --lines 100` | Melihat log bot |
| `bash stop-all.sh` | Menghentikan seluruh layanan |
| `git pull && bash start-all.sh` | Mengambil pembaruan dari GitHub |

Jika sesi rusak, arsipkan dahulu agar dapat dipulihkan:

```bash
bash stop-all.sh
mv session "session-loggedout-$(date +%Y%m%d-%H%M%S)"
mv session-arka "session-loggedout-arka-$(date +%Y%m%d-%H%M%S)"
bash start-all.sh
```
