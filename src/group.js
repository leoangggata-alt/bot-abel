// ============================================================
//  src/group.js - Fitur khusus grup WhatsApp
// ============================================================
import dotenv from "dotenv";
dotenv.config();

const BISNIS = process.env.BUSINESS_NAME || "Toko Kami";

// ── Pesan Welcome Member Baru ─────────────────────────────
export function welcomeMessage(nama, grupNama) {
  return `👋 Selamat datang di *${grupNama}*!

Halo @${nama}, senang kamu bergabung! 🎉

📌 *Hal penting yang perlu kamu tahu:*
1. Baca peraturan grup: *!rules*
2. Lihat menu bot: *!menu*
3. Tanya AI kami: *!ai [pertanyaan]*

Jangan ragu untuk bertanya ya! 😊
_— Tim ${BISNIS}_`;
}

// ── Pesan Goodbye Member ────────────────────────────────────
export function goodbyeMessage(nama, grupNama) {
  return `👋 *${nama}* telah meninggalkan grup *${grupNama}*.\n\nSemoga bisa bertemu lagi! 🙏`;
}

// ── Peraturan Grup ──────────────────────────────────────────
export function rulesGrup(grupNama) {
  return `📜 *Peraturan ${grupNama}*

1️⃣ Hormati sesama anggota
2️⃣ Dilarang spam atau flood pesan
3️⃣ Dilarang konten SARA & pornografi
4️⃣ Dilarang promosi tanpa izin admin
5️⃣ Gunakan bahasa yang sopan
6️⃣ Dilarang share hoaks / berita palsu
7️⃣ Dilarang kirim virus / phishing link

⚠️ *Pelanggaran = kick dari grup*

_Admin berhak menindak tanpa peringatan untuk pelanggaran berat_`;
}

// ── Tag Semua Member ────────────────────────────────────────
export function buatTagAll(members, pesan = "") {
  const tags = members
    .filter(m => !m.id.includes("@lid")) // filter ghost members
    .map(m => `@${m.id.split("@")[0]}`)
    .join(" ");

  const teks = pesan
    ? `📢 *Perhatian semua anggota!*\n\n${pesan}\n\n${tags}`
    : `📢 *Halo semua!* 👋\n\n${tags}`;

  const mentions = members
    .filter(m => !m.id.includes("@lid"))
    .map(m => m.id);

  return { teks, mentions };
}

// ── Anti Spam: lacak frekuensi pesan ────────────────────────
const spamTracker = {};
export function cekSpam(userId) {
  const sekarang = Date.now();
  if (!spamTracker[userId]) {
    spamTracker[userId] = { count: 1, firstMsg: sekarang };
    return false;
  }

  const selisihWaktu = sekarang - spamTracker[userId].firstMsg;

  if (selisihWaktu < 5000) {
    // Dalam 5 detik
    spamTracker[userId].count++;
    if (spamTracker[userId].count >= 5) {
      return true; // Spam terdeteksi!
    }
  } else {
    // Reset timer
    spamTracker[userId] = { count: 1, firstMsg: sekarang };
  }
  return false;
}

// Reset spam tracker user
export function resetSpam(userId) {
  delete spamTracker[userId];
}
