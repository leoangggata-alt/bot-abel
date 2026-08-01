// ============================================================
//  src/order.js - Sistem Pemesanan Bot Abel
//  Format: !order [KODE] [JUMLAH]
//  Konfirmasi: !konfirmasi [NO_ORDER]
// ============================================================
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_FILE = path.join(__dirname, "../data/products.json");
const ORDERS_FILE   = path.join(__dirname, "../data/orders.json");
const QRIS_FILE     = path.join(__dirname, "../assets/qris.png");

// ── Helper baca/tulis ─────────────────────────────────────────
function bacaProduk() {
  try {
    if (!fs.existsSync(PRODUCTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, "utf-8"));
  } catch { return []; }
}
function bacaOrders() {
  try {
    if (!fs.existsSync(ORDERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8"));
  } catch { return []; }
}
function simpanOrders(data) {
  fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}
function formatRp(n) {
  return "Rp " + parseInt(n || 0).toLocaleString("id-ID");
}
function generateNoOrder() {
  const now = new Date();
  const tgl = now.toISOString().slice(0,10).replace(/-/g,"");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `ORD-${tgl}-${rand}`;
}

// ── Cari produk by kode ───────────────────────────────────────
function cariProduk(kode) {
  const list = bacaProduk();
  return list.find(p =>
    p.kode?.toLowerCase() === kode.toLowerCase() && p.aktif !== false
  ) || null;
}

// ── Kirim QRIS + instruksi konfirmasi ─────────────────────────
export async function kirimQRIS(sock, to, noOrder, total, mentions = []) {
  try {
    if (!fs.existsSync(QRIS_FILE)) {
      // Fallback teks jika file tidak ada
      await sock.sendMessage(to, {
        text:
          `💳 *Pembayaran QRIS*\n\n` +
          `💰 Total: *${formatRp(total)}*\n\n` +
          `Scan QRIS di aplikasi dompet digital kamu\n` +
          `(GoPay, OVO, Dana, ShopeePay, dll)\n\n` +
          `✅ Setelah transfer, ketik:\n*!konfirmasi ${noOrder}*`,
        mentions
      });
      return false;
    }

    const qrisBuffer = fs.readFileSync(QRIS_FILE);

    // Kirim gambar QRIS dengan caption
    await sock.sendMessage(to, {
      image: qrisBuffer,
      caption:
        `💳 *QRIS - ABEL-LAB*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `🔖 Order  : *${noOrder}*\n` +
        `💰 Total  : *${formatRp(total)}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n\n` +
        `📱 *Cara Bayar:*\n` +
        `1️⃣ Buka aplikasi dompet digital kamu\n` +
        `   (GoPay, OVO, Dana, ShopeePay, dll)\n` +
        `2️⃣ Pilih menu *Scan QR / QRIS*\n` +
        `3️⃣ Scan QR di atas\n` +
        `4️⃣ Masukkan nominal: *${formatRp(total)}*\n` +
        `5️⃣ Selesaikan pembayaran\n\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `✅ *Sudah transfer? Tekan tombol konfirmasi:*\n` +
        `Ketik: *!konfirmasi ${noOrder}*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `_⏰ Batas pembayaran: 24 jam_`,
      mentions
    });

    console.log(`[ORDER] QRIS terkirim untuk order ${noOrder}`);
    return true;
  } catch (err) {
    console.error("[ORDER] Gagal kirim QRIS:", err.message);
    return false;
  }
}

// Ambil pesanan terakhir milik pembeli yang masih membutuhkan pembayaran.
export function ambilOrderPembayaranTerakhir(senderNum) {
  const target = String(senderNum || "")
    .replace(/@(?:s\.whatsapp\.net|lid)$/i, "")
    .split(":")[0];
  return [...bacaOrders()].reverse().find(order =>
    String(order.senderNum || "") === target &&
    order.status === "Menunggu Pembayaran" &&
    order.konfirmasi !== true
  ) || null;
}

export async function kirimQRISOrderTerakhir(sock, to, senderNum, mentions = []) {
  const order = ambilOrderPembayaranTerakhir(senderNum);
  if (!order) {
    return {
      ok: false,
      pesan: "❌ Tidak ada pesananmu yang sedang menunggu pembayaran.\n\nBuat pesanan dulu dengan *!order [KODE] [JUMLAH]*.",
    };
  }

  const sent = await kirimQRIS(sock, to, order.noOrder, order.total, mentions);
  return {
    ok: sent,
    order,
    pesan: sent
      ? `✅ QRIS untuk order *${order.noOrder}* sudah dikirim.`
      : "❌ QRIS belum berhasil dikirim. Silakan hubungi admin dengan *!cs*.",
  };
}

// ── Proses order baru ─────────────────────────────────────────
export function prosesOrder(senderNum, teks) {
  const parts   = teks.trim().split(/\s+/);
  const kode    = parts[0]?.toUpperCase();
  const jumlah  = parseInt(parts[1]) || 1;

  if (!kode) return { ok: false, pesan: pesanBantuanOrder() };

  const produk = cariProduk(kode);
  if (!produk) {
    return {
      ok: false,
      pesan: `❌ Produk kode *${kode}* tidak ditemukan.\n\nKetik *!produk* untuk lihat daftar & kode produk.`
    };
  }

  if (jumlah < 1 || jumlah > 100) {
    return {
      ok: false,
      pesan: `❌ Jumlah tidak valid (1–100).\n\nContoh: *!order ${kode} 2*`
    };
  }

  if (produk.stok !== undefined && produk.stok < jumlah) {
    return {
      ok: false,
      pesan: `⚠️ Stok *${produk.nama}* tidak cukup!\n\nStok tersedia: *${produk.stok} pcs*\nPesanan kamu: ${jumlah} pcs`
    };
  }

  const noOrder  = generateNoOrder();
  const subtotal = produk.harga * jumlah;
  const ongkir   = subtotal >= 200000 ? 0 : 15000;
  const total    = subtotal + ongkir;
  const waktu    = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  const orderBaru = {
    noOrder, senderNum,
    produkKode: produk.kode, produkNama: produk.nama,
    jumlah, hargaSatuan: produk.harga,
    subtotal, ongkir, total,
    status: "Menunggu Pembayaran",
    konfirmasi: false,
    waktu,
  };

  const orders = bacaOrders();
  orders.push(orderBaru);
  simpanOrders(orders);

  // Kurangi stok
  const produkList = bacaProduk();
  const idx = produkList.findIndex(p => p.kode === produk.kode);
  if (idx !== -1 && produkList[idx].stok !== undefined) {
    produkList[idx].stok -= jumlah;
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(produkList, null, 2));
  }

  const ongkirTeks = ongkir === 0 ? "Gratis ✅" : formatRp(ongkir);

  return {
    ok: true,
    noOrder,
    total,
    pesan:
`✅ *PESANAN BERHASIL DIBUAT!*

╔══════════════════════════╗
║  📋 Detail Pesanan
╚══════════════════════════╝

🔖 No. Order : *${noOrder}*
📦 Produk    : ${produk.nama}
🏷️ Kode      : ${produk.kode}
🔢 Jumlah    : ${jumlah} pcs
💰 Harga/pcs : ${formatRp(produk.harga)}
──────────────────────────
💵 Subtotal  : ${formatRp(subtotal)}
🚚 Ongkir    : ${ongkirTeks}
💳 *TOTAL    : ${formatRp(total)}*

📊 Status: _Menunggu Pembayaran_
🕐 Waktu  : ${waktu}

──────────────────────────
⬇️ *Lanjut ke pembayaran QRIS di bawah ini* ⬇️`
  };
}

// ── Konfirmasi pembayaran oleh user ──────────────────────────
export function konfirmasiPembayaran(senderNum, noOrder) {
  const orders = bacaOrders();
  const idx = orders.findIndex(o =>
    o.noOrder?.toLowerCase() === noOrder.toLowerCase()
  );

  if (idx === -1) {
    return {
      ok: false,
      pesan: `❌ Order *${noOrder}* tidak ditemukan.\n\nPastikan nomor order benar.\nContoh: *!konfirmasi ORD-20250730-1234*`
    };
  }

  const order = orders[idx];

  if (order.senderNum !== senderNum) {
    return {
      ok: false,
      pesan: `❌ Order *${noOrder}* bukan milikmu.`
    };
  }

  if (order.konfirmasi) {
    return {
      ok: false,
      pesan: `ℹ️ Order *${noOrder}* sudah dikonfirmasi sebelumnya.\n\nStatus: *${order.status}*\n\nTunggu verifikasi dari admin ya! 🙏`
    };
  }

  if (order.status === "Selesai" || order.status === "Dibatalkan") {
    return {
      ok: false,
      pesan: `ℹ️ Order *${noOrder}* sudah berstatus *${order.status}*.`
    };
  }

  // Update status
  orders[idx].konfirmasi    = true;
  orders[idx].waktuKonfirmasi = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
  orders[idx].status        = "Menunggu Verifikasi";
  simpanOrders(orders);

  console.log(`[ORDER] ✅ Konfirmasi pembayaran: ${noOrder} dari ${senderNum}`);

  return {
    ok: true,
    pesan:
`🎉 *KONFIRMASI DITERIMA!*

✅ Pembayaran kamu sedang diverifikasi oleh admin.

🔖 No. Order : *${noOrder}*
📦 Produk    : ${order.produkNama}
💳 Total     : ${formatRp(order.total)}
📊 Status    : *Menunggu Verifikasi*

──────────────────────────
⏳ Admin akan memverifikasi dalam *1–15 menit*

Setelah terverifikasi, pesanan akan segera diproses! 🚀

_Hubungi CS jika ada kendala: !cs_`
  };
}

// ── Cek status order ──────────────────────────────────────────
export function cekOrder(noOrder) {
  const orders = bacaOrders();
  const order  = orders.find(o =>
    o.noOrder?.toLowerCase() === noOrder.toLowerCase()
  );

  if (!order) {
    return `❌ Order *${noOrder}* tidak ditemukan.\n\nPastikan nomor order benar.\nContoh: *!cek ORD-20250730-1234*`;
  }

  const statusEmoji = {
    "Menunggu Pembayaran"  : "⏳",
    "Menunggu Verifikasi"  : "🔍",
    "Dikonfirmasi"         : "✅",
    "Diproses"             : "🔧",
    "Dikirim"              : "🚚",
    "Selesai"              : "🎉",
    "Dibatalkan"           : "❌",
  }[order.status] || "📋";

  return `📋 *Status Order*

🔖 No. Order : *${order.noOrder}*
📦 Produk    : ${order.produkNama} (${order.jumlah} pcs)
💳 Total     : ${formatRp(order.total)}
📊 Status    : ${statusEmoji} *${order.status}*
${order.konfirmasi ? `✅ Konfirmasi : ${order.waktuKonfirmasi}\n` : ""}${order.resi ? `📬 No. Resi   : *${order.resi}*\n` : ""}🕐 Dipesan   : ${order.waktu}

${!order.konfirmasi && order.status === "Menunggu Pembayaran"
  ? `⚠️ Belum konfirmasi!\nKetik: *!konfirmasi ${order.noOrder}*`
  : "_Butuh bantuan? Ketik !cs_"}`;
}

// ── Pesan bantuan order ───────────────────────────────────────
export function pesanBantuanOrder() {
  const produkList = bacaProduk().filter(p => p.aktif !== false);
  let teks = `🛒 *Cara Memesan*\n\n`;
  teks += `Ketik: *!order [KODE] [JUMLAH]*\n\n`;
  teks += `*Contoh:*\n`;
  teks += `├ !order P001 1 → pesan 1 pcs\n`;
  teks += `└ !order P002 3 → pesan 3 pcs\n\n`;
  if (produkList.length > 0) {
    teks += `*📦 Kode Produk Tersedia:*\n`;
    produkList.forEach((p, i) => {
      const last = i === produkList.length - 1;
      const formatRpLocal = n => "Rp " + parseInt(n||0).toLocaleString("id-ID");
      teks += `${last?"└":"├"} *${p.kode||"—"}* → ${p.nama} (${formatRpLocal(p.harga)})\n`;
    });
  }
  teks += `\n_Ketik !produk untuk detail lengkap_`;
  return teks;
}
