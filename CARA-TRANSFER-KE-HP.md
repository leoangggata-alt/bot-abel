# Cara Memasang Bot di HP dari GitHub

Di Termux jalankan:

```bash
pkg update -y
pkg install git -y
cd ~
git clone https://github.com/leoangggata-alt/bot-abel.git whatsapp-bot-baileys
cd whatsapp-bot-baileys
bash setup-termux.sh
bash start-all.sh
```

Panel HP dapat dibuka di `http://127.0.0.1:8080`. Login menggunakan akun admin
yang dibuat oleh setup. Dashboard juga menampilkan URL Wi-Fi agar panel Termux
dapat dibuka dari PC pada jaringan yang sama.

Sebelum menautkan akun WhatsApp pada Termux, jadikan panel PC **STANDBY**.
Setelah itu jadikan Termux **PRIMARY** dan pindai QR pada halaman Duo Bot.

File rahasia seperti `.env`, API key, sesi WhatsApp, order, dan pengaturan lokal
tidak dikirim melalui GitHub. Isikan kembali melalui setup/panel HP.

Panduan lengkap, auto-start, dan cara failover tersedia di `TERMUX-GUIDE.md`.
