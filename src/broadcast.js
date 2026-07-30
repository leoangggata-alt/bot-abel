// ============================================================
//  src/broadcast.js - Kirim pesan ke banyak kontak / grup
// ============================================================
import dotenv from "dotenv";
dotenv.config();

const BISNIS = process.env.BUSINESS_NAME || "Toko Kami";

// ── Broadcast teks ke daftar nomor ──────────────────────────
// numbers: array format "628xxx" (tanpa +, tanpa @)
export async function broadcastPesan(sock, numbers, pesan) {
  const results = [];
  const pesanLengkap = `📢 *Pesan dari ${BISNIS}*\n\n${pesan}\n\n_Balas STOP untuk berhenti menerima pesan_`;

  console.log(`[Broadcast] Mulai ke ${numbers.length} kontak...`);

  for (const num of numbers) {
    const jid = `${num}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text: pesanLengkap });
      results.push({ number: num, status: "✅ berhasil" });
      console.log(`[Broadcast] ✅ ${num}`);
      // Delay 1 detik antar pesan (hindari ban)
      await delay(1000);
    } catch (err) {
      results.push({ number: num, status: "❌ gagal", error: err.message });
      console.log(`[Broadcast] ❌ ${num}: ${err.message}`);
    }
  }

  const sukses = results.filter(r => r.status.includes("✅")).length;
  const gagal = results.filter(r => r.status.includes("❌")).length;

  return {
    total: numbers.length,
    sukses,
    gagal,
    detail: results,
    ringkasan: `📊 *Hasil Broadcast*\n✅ Berhasil: ${sukses}\n❌ Gagal: ${gagal}\n📤 Total: ${numbers.length}`
  };
}

// ── Broadcast ke semua grup ──────────────────────────────────
export async function broadcastKeGrup(sock, pesan) {
  const results = [];
  const chats = await sock.groupFetchAllParticipating();
  const grupIds = Object.keys(chats);

  console.log(`[Broadcast Grup] Mulai ke ${grupIds.length} grup...`);

  for (const gid of grupIds) {
    try {
      await sock.sendMessage(gid, { text: `📢 *${BISNIS}*\n\n${pesan}` });
      results.push({ grup: chats[gid].subject, status: "✅ berhasil" });
      await delay(1500);
    } catch (err) {
      results.push({ grup: gid, status: "❌ gagal" });
    }
  }

  return results;
}

// ── Notifikasi status order ──────────────────────────────────
export async function notifOrder(sock, phoneNumber, orderData) {
  const jid = `${phoneNumber}@s.whatsapp.net`;
  const pesan =
    `✅ *Konfirmasi Pesanan*\n\n` +
    `Halo ${orderData.nama}!\n\n` +
    `📋 No. Order: *${orderData.orderId}*\n` +
    `🛍️ Produk: ${orderData.produk}\n` +
    `💰 Total: Rp ${Number(orderData.total).toLocaleString("id-ID")}\n` +
    `📦 Status: ${orderData.status}\n\n` +
    `Cek status: *!order ${orderData.orderId}*\n` +
    `Terima kasih telah berbelanja! 🙏`;

  await sock.sendMessage(jid, { text: pesan });
}

// ── Helper delay ─────────────────────────────────────────────
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export { delay };
