// ============================================================
//  src/menu.js - Menu teks untuk personal & grup
//  Produk dibaca langsung dari data/products.json (Admin Panel)
// ============================================================
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "../data/products.json");
export const BANNER_FILE = path.join(__dirname, "../assets/banner.png");
const PREFIX =
  process.env.BOT_PREFIX ||
  (process.env.PREFIX?.length <= 3 ? process.env.PREFIX : "!");
const BISNIS = process.env.BUSINESS_NAME || "Abel-Lab";
const STORE_NAME = process.env.STORE_NAME || "ABEL-LAB";

// ── Baca produk dari file JSON ────────────────────────────────
function bacaProduk() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
    return data.filter(p => p.aktif !== false); // hanya yang aktif
  } catch (e) {
    console.error("[MENU] Error baca produk:", e.message);
    return [];
  }
}

// ── Format harga Rupiah ───────────────────────────────────────
function formatRp(angka) {
  return "Rp " + parseInt(angka || 0).toLocaleString("id-ID");
}

// ── Menu Utama ──────────────────────────────────────────────
export function menuUtama(isGrup = false) {
  return `╔══════════════════════════╗
║  🤖 *BOT ${BISNIS.toUpperCase()}*  
╚══════════════════════════╝

Halo! Saya siap membantu kamu 😊
Berikut daftar perintah yang tersedia:

*📦 INFO & PRODUK*
├ ${PREFIX}menu - Tampilkan menu ini
├ ${PREFIX}info - Info bisnis kami
├ ${PREFIX}produk - Daftar produk
├ ${PREFIX}harga - Daftar harga
└ ${PREFIX}promo - Promo aktif

*🛒 PESANAN*
├ ${PREFIX}order [no] - Cek status order
├ ${PREFIX}cara - Cara memesan
└ ${PREFIX}bayar - Info pembayaran

*💬 BANTUAN*
├ ${PREFIX}cs - Hubungi customer service
├ ${PREFIX}faq - Pertanyaan umum
├ ${PREFIX}ai [pesan] - Tanya AI kami
├ ${PREFIX}gambar [deskripsi] - Buat gambar GPT
└ ${PREFIX}reset - Reset percakapan AI

${isGrup ? `*👥 FITUR GRUP*\n├ ${PREFIX}tagall - Tag semua anggota\n├ ${PREFIX}rules - Peraturan grup\n└ ${PREFIX}link - Info link grup\n\n` : ""}*Contoh:* ${PREFIX}ai Berapa harga produk A?

_Ditenagai oleh Google Gemini AI_ ✨`;
}

// ── Info Bisnis ──────────────────────────────────────────────
export function infoToko() {
  return `🏪 *Info ${BISNIS}*

👤 Owner: ${process.env.OWNER_NAME || "Admin"}
📞 Kontak: wa.me/${process.env.OWNER_NUMBER || ""}
🕐 Jam Buka: Senin–Sabtu, 08.00–17.00 WIB
📍 Lokasi: *(isi lokasi kamu)*

💳 *Pembayaran:*
├ Transfer BCA: *1234567890* (a.n. ${BISNIS})
├ GoPay/OVO/Dana: *08xxx*
└ QRIS: tersedia

🚚 *Pengiriman:*
├ JNE, J&T, SiCepat
├ Estimasi: 2–5 hari kerja
└ Gratis ongkir min. Rp200.000

_Terima kasih sudah menghubungi kami!_ 🙏`;
}

// ── Produk + READY STOCK banner ───────────────────────────────
export function infoProduk() {
  const produkList = bacaProduk();
  if (produkList.length === 0) {
    return `📦 *Katalog ${BISNIS}*\n\n_Belum ada produk tersedia._\nHubungi kami: ${PREFIX}cs`;
  }
  const byKat = {};
  for (const p of produkList) {
    const kat = p.kategori || "Lainnya";
    if (!byKat[kat]) byKat[kat] = [];
    byKat[kat].push(p);
  }
  let teks = `╔══════════════════════════════╗\n`;
  teks     += `║  🏆 *${BISNIS.toUpperCase()}*  \n`;
  teks     += `║  💎 PREMIUM DIGITAL STORE  \n`;
  teks     += `╚══════════════════════════════╝\n\n`;

  for (const [kat, items] of Object.entries(byKat)) {
    teks += `✦ *${kat.toUpperCase()}* ✦\n`;
    teks += `${'─'.repeat(30)}\n`;
    items.forEach(p => {
      const stok    = p.stok ?? 999;
      const badge   = stok <= 0  ? '❌ *HABIS*'
                    : stok <= 5  ? '⚠️ *STOK TERBATAS*'
                    : '✅ *READY STOCK*';
      const kode    = p.kode ? `[${p.kode}]` : '';
      teks += `\n📦 *${p.nama}* ${kode}\n`;
      teks += `💰 ${formatRp(p.harga)}\n`;
      teks += `${badge}\n`;
      if (p.deskripsi) teks += `_${p.deskripsi.slice(0,60)}_\n`;
    });
    teks += `${'─'.repeat(30)}\n`;
  }
  teks += `\n🛒 *Cara Order:*\n`;
  teks += `*${PREFIX}order [KODE] [JUMLAH]*\n`;
  teks += `_Contoh: ${PREFIX}order P001 1_\n\n`;
  teks += `⚡ INSTANT DELIVERY • 🛡️ 100% TRUSTED • 🎧 24/7 SUPPORT`;
  return teks;
}

// ── Daftar Harga Premium ──────────────────────────────────────
export function infoHarga() {
  const produkList = bacaProduk();
  if (produkList.length === 0) {
    return `💎 *PRICE LIST ${STORE_NAME}*\n\n_Belum ada produk tersedia._`;
  }

  const byKat = {};
  for (const p of produkList) {
    const kat = p.kategori || "Lainnya";
    if (!byKat[kat]) byKat[kat] = [];
    byKat[kat].push(p);
  }

  let teks = `✦━━━━━━━━━━━━━━━━━━━━✦\n`;
  teks     += `       💎 *${STORE_NAME}*\n`;
  teks     += `      *PREMIUM PRICE LIST*\n`;
  teks     += `✦━━━━━━━━━━━━━━━━━━━━✦\n\n`;

  for (const [kat, items] of Object.entries(byKat)) {
    teks += `╭── ✦ *${kat.toUpperCase()}* ✦ ──╮\n`;
    items.forEach((p, index) => {
      const stok  = p.stok ?? 999;
      const status = stok <= 0 ? "❌ HABIS"
                   : stok <= 5 ? "⚠️ TERBATAS"
                   : "✅ READY";

      teks += `│ ${status}  *${p.nama}*\n`;
      teks += `│ Kode *${p.kode || "-"}*  •  *${formatRp(p.harga)}*\n`;
      if (index < items.length - 1) teks += `│ ──────────────────\n`;
    });
    teks += `╰────────────────────╯\n\n`;
  }

  teks += `🛒 *CARA MEMBELI*\n`;
  teks += `Ketik: *${PREFIX}order [KODE] [JUMLAH]*\n`;
  teks += `Contoh: *${PREFIX}order P001 1*\n\n`;
  teks += `🔐 _QRIS hanya muncul setelah pesanan berhasil dibuat._\n`;
  teks += `⚡ *AKTIVASI CEPAT • AMAN • TERPERCAYA*`;

  return teks;
}

// ── Promo ──────────────────────────────────────────────────
export function infoPromo() {
  return `🎉 *PROMO SPESIAL BULAN INI!*

🔥 *Diskon 20%* untuk pembelian pertama
🚚 *Gratis ongkir* min. pembelian Rp200.000  
🎁 *Beli 2 Gratis 1* untuk Produk A1
⚡ *Flash Sale* setiap Jumat jam 12.00 WIB

_Berlaku sampai akhir bulan ini_
_Jangan sampai ketinggalan!_ ⏰

Info lebih lanjut: ${PREFIX}cs`;
}

// ── Cara Order ──────────────────────────────────────────────
export function caraPesan() {
  return `🛒 *Cara Memesan*

*Langkah mudah belanja di ${BISNIS}:*

1️⃣ Pilih produk dari katalog (${PREFIX}produk)
2️⃣ Beritahu kami:
   • Nama lengkap
   • Alamat pengiriman
   • Produk & jumlah yang dipesan

3️⃣ Kami kirim invoice & nominal
4️⃣ Lakukan pembayaran
5️⃣ Kirim bukti transfer
6️⃣ Pesanan diproses & dikirim ✅

_Estimasi respon: 5–15 menit_
_Jam kerja: Senin–Sabtu 08.00–17.00 WIB_ 🕐`;
}

// ── FAQ ──────────────────────────────────────────────────────
export function faq() {
  return `❓ *FAQ - Pertanyaan Umum*

*Q: Berapa lama pengiriman?*
A: 2–5 hari kerja tergantung lokasi 📦

*Q: Apakah ada garansi?*
A: Ya, garansi 1 tahun untuk kerusakan pabrik 🛡️

*Q: Bisa COD?*
A: COD tersedia untuk area Jabodetabek 🏙️

*Q: Cara cek status order?*
A: Ketik ${PREFIX}order [nomor order]
   Contoh: ${PREFIX}order 12345 🔍

*Q: Produk tidak sesuai / rusak?*
A: Hubungi CS kami maksimal 3 hari setelah terima barang

_Pertanyaan lain? Ketik ${PREFIX}ai [pertanyaan kamu]_ 🤖`;
}

// ── Cek Order ──────────────────────────────────────────────
export function statusOrder(noOrder) {
  // Simulasi database — ganti dengan DB nyata
  const orders = {
    "12345": { status: "🚚 Dalam Pengiriman", resi: "JNE123456789", estimasi: "31 Juli 2025" },
    "67890": { status: "🔧 Sedang Diproses", resi: "-", estimasi: "1–2 hari kerja" },
  };

  const order = orders[noOrder];
  if (!order) {
    return `❌ Order *#${noOrder}* tidak ditemukan.\n\nPastikan nomor order sudah benar, atau hubungi CS: ${PREFIX}cs`;
  }

  return `📋 *Status Order #${noOrder}*

📊 Status: ${order.status}
📦 No. Resi: *${order.resi}*
⏱️ Estimasi tiba: ${order.estimasi}

_Untuk bantuan lebih lanjut ketik ${PREFIX}cs_`;
}
