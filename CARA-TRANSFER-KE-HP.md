# Cara Transfer Bot ke HP

Paket siap transfer bernama `whatsapp-bot-baileys-termux.zip`.

## Melalui kabel USB

1. Sambungkan HP dan pilih mode **File Transfer**.
2. Salin ZIP ke folder **Download** di penyimpanan internal HP.
3. Buka Termux dan jalankan:

```bash
termux-setup-storage
pkg install unzip -y
cd ~
unzip ~/storage/shared/Download/whatsapp-bot-baileys-termux.zip
cd whatsapp-bot-baileys
bash setup-termux.sh
bash start-all.sh
```

## Melalui penyimpanan cloud

Unggah ZIP ke Google Drive atau layanan penyimpanan lain, unduh ke folder
Download HP, lalu gunakan perintah Termux yang sama di atas.

Paket tidak menyertakan `.env`, `session`, `node_modules`, log, atau data order.
Konfigurasi rahasia dibuat langsung di HP oleh `setup-termux.sh`, dan akun
WhatsApp ditautkan menggunakan pairing code.

Panduan lengkap 24/7 ada di `TERMUX-GUIDE.md`.
