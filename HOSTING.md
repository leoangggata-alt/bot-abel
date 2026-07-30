# Hosting Bot Abel

Untuk bot WhatsApp Baileys, gunakan mesin yang menjalankan Node.js terus
menerus dan memiliki penyimpanan permanen.

## Rekomendasi

Gunakan Oracle Cloud Always Free VM dengan Ubuntu dan PM2:

```text
GitHub -> Oracle Cloud VM -> PM2 -> Bot + Panel Admin
```

Panduan lengkap tersedia di [ORACLE-DEPLOY.md](ORACLE-DEPLOY.md).

## Mengapa bukan hosting web gratis yang tidur?

Bot Baileys menjaga koneksi WebSocket keluar ke WhatsApp dan menyimpan sesi di
folder `session/`. Hosting yang tidur saat tidak menerima HTTP atau memiliki
filesystem sementara dapat memutus bot dan menghilangkan sesi.

## Cloudflare Tunnel

Cloudflare Tunnel hanya mempublikasikan panel dari mesin yang sudah menyala.
Tunnel bukan pengganti VM. Pada Oracle VM, panel lebih aman diakses melalui SSH
port forwarding seperti dijelaskan dalam panduan deploy.
