# Deploy Bot Abel 24/7 di Oracle Cloud

Arsitektur:

```text
GitHub -> Oracle Cloud VM Ubuntu -> PM2 -> Bot Abel
```

Bot dan panel berjalan di VM. Komputer pribadi boleh dimatikan setelah proses
deploy dan login WhatsApp selesai.

## 1. Buat VM Always Free

Di Oracle Cloud Console:

1. Buat Compute Instance dengan Ubuntu.
2. Pilih shape yang berlabel Always Free.
3. Simpan private key SSH (`.key` atau `.pem`) dengan aman.
4. Catat Public IP VM.
5. Biarkan ingress hanya port `22` untuk SSH. Panel admin tidak perlu membuka
   port `8080` ke internet.

## 2. Masuk ke VM

Dari PowerShell Windows:

```powershell
ssh -i "C:\lokasi\private-key.pem" ubuntu@IP_VM
```

## 3. Clone dan pasang bot

Jalankan di VM:

```bash
git clone https://github.com/leoangggata-alt/bot-abel.git
cd bot-abel
bash deploy/setup-oracle.sh
```

Pada proses pertama installer membuat `.env`, lalu berhenti agar konfigurasi
dapat diisi:

```bash
nano .env
```

Minimal periksa `PAIRING_NUMBER`, `OWNER_NUMBER`, `ADMIN_USER`, dan
`ADMIN_PASSWORD`. API key dapat dimasukkan lewat `.env` atau panel admin.
Setelah menyimpan `.env`, jalankan kembali:

```bash
bash deploy/setup-oracle.sh
```

## 4. Hubungkan WhatsApp

Pantau log:

```bash
pm2 logs abel-bot --lines 100
```

Gunakan pairing code yang muncul:

```text
WhatsApp -> Perangkat tertaut -> Tautkan perangkat
          -> Tautkan dengan nomor telepon
```

Setelah tampil `BOT BERHASIL TERHUBUNG`, tekan `Ctrl+C`. Bot tidak berhenti
karena tetap dijaga oleh PM2.

## 5. Buka panel admin secara aman

Panel tetap mendengarkan di `127.0.0.1:8080` pada VM. Dari PowerShell komputer:

```powershell
ssh -i "C:\lokasi\private-key.pem" -L 8080:127.0.0.1:8080 ubuntu@IP_VM
```

Selama koneksi SSH tersebut terbuka, akses:

```text
http://127.0.0.1:8080/
```

Bot tetap berjalan walaupun koneksi SSH panel ditutup.

## 6. Perintah pengelolaan

```bash
pm2 status
pm2 logs abel-bot --lines 100
pm2 logs abel-admin --lines 100
pm2 restart abel-bot
bash deploy/update-oracle.sh
```

## Data rahasia

Jangan unggah file berikut ke GitHub:

- `.env`
- `session/`
- `data/api-keys.json`
- `data/.api-key-secret`
- `data/orders.json`
- `data/settings.json`
- `data/products.json`

Semua file tersebut sudah tercantum dalam `.gitignore`.
