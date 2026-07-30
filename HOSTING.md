# 🚀 Panduan Hosting Bot Abel — GRATIS 24/7

## ✅ Rekomendasi: Railway.app (Paling Mudah)

### Langkah-langkah:

**1. Push code ke GitHub dulu**
```bash
git init
git add .
git commit -m "Bot Abel v1.0"
```
Buat repo baru di github.com, lalu:
```bash
git remote add origin https://github.com/USERNAME/bot-abel.git
git push -u origin main
```

**2. Daftar Railway**
- Buka: https://railway.app
- Login dengan GitHub
- Klik **New Project** → **Deploy from GitHub Repo**
- Pilih repo bot kamu

**3. Tambah Environment Variables di Railway**
```
GROQ_API_KEY=gsk_...
OWNER=628xxx
PREFIX=!
BUSINESS_NAME=Abel-Lab
```

**4. Set Start Command**
```
node index.js
```

**5. Simpan session WhatsApp**
- Scan QR sekali di local
- Upload folder `session/` ke GitHub (atau pakai Railway Volume)

---

## ✅ Alternatif: Render.com (Juga Gratis)

1. Buka https://render.com
2. New → Web Service → Connect GitHub
3. Build Command: `npm install`
4. Start Command: `node index.js`
5. Add Environment Variables sama seperti Railway

---

## ✅ Alternatif: Oracle Cloud (GRATIS SELAMANYA)

Paling recommended untuk jangka panjang:
1. Daftar di https://www.oracle.com/cloud/free/
2. Buat VM instance (Ubuntu, 1GB RAM — GRATIS FOREVER)
3. Upload kode via SSH/SFTP
4. Install Node.js: `sudo apt install nodejs npm`
5. Install PM2: `npm install -g pm2`
6. Jalankan: `pm2 start index.js --name bot-abel`
7. Auto-start: `pm2 startup && pm2 save`

---

## ✅ Alternatif Termux (HP Android) — Paling Mudah Tanpa VPS

Kalau punya HP Android nganggur:
1. Install **Termux** dari F-Droid
2. ```bash
   pkg update && pkg install nodejs git
   git clone URL_REPO_KAMU
   cd bot-abel
   npm install
   node index.js
   ```
3. Biarkan HP menyala + charge 24/7

---

## ⚠️ Catatan Penting untuk Hosting

### Masalah Session WhatsApp
Session WhatsApp tersimpan di folder `session/`. Saat deploy:
- Upload folder `session/` ke server ATAU
- Scan QR baru di server via terminal

### Tambahkan `.gitignore`
```
node_modules/
session/
.env
data/orders.json
```

### File `.env` di server
Jangan push `.env` ke GitHub! Set via Environment Variables di dashboard Railway/Render.

---

## 🔧 File yang Perlu Diupload ke Server

```
├── index.js
├── package.json
├── src/
│   ├── handler.js
│   ├── ai.js
│   ├── menu.js
│   ├── order.js
│   └── image.js
├── assets/
│   ├── banner.png
│   └── qris.png
└── data/
    └── products.json
```
