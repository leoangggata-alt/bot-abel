import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROFILES_FILE = path.join(__dirname, "../data/bot-profiles.json");
const STATUS_FILE = path.join(__dirname, "../data/bot-status.json");
const CONTROL_FILE = path.join(__dirname, "../data/bot-control.json");

export const DEFAULT_BOT_PROFILES = Object.freeze({
  abel: {
    id: "abel",
    name: "Abel",
    role: "Asisten wanita, layanan toko, konten, dan teman ngobrol",
    command: "abel",
    enabled: true,
    pairingNumber: "",
    linkMethod: "qr",
    personality: "Feminin, hangat, ceria, kreatif, ekspresif, pandai berjualan, dan perhatian. Boleh bercanda dengan ramah tanpa merendahkan siapa pun.",
    customInstruction: "Utamakan pelayanan pelanggan, jualan, ide konten, UGC, kreativitas, dan jawaban yang terasa hangat.",
    memoryTurns: 16,
    temperature: 0.8,
  },
  arka: {
    id: "arka",
    name: "Arka",
    role: "Asisten pria tingkat lanjut untuk analisis, pemecahan masalah, penalaran berbasis konteks, dan pendamping grup",
    command: "arka",
    enabled: false,
    pairingNumber: "",
    linkMethod: "qr",
    personality: "Maskulin, tenang, tegas, teliti, logis, adaptif, berwawasan luas, dan humoris secara santai. Berpikir sistematis, menjelaskan hal rumit dengan bahasa sederhana, tidak kasar, tidak dominan, dan menghormati semua anggota grup.",
    customInstruction: `Gunakan MODE KERJA ARKA berikut sesuai kebutuhan, tanpa menyebut nama mode atau menampilkan proses berpikir internal:
1. Analisis: pahami tujuan, konteks, batasan, data yang tersedia, serta bagian yang belum diketahui. Pecah masalah rumit menjadi komponen, cari hubungan sebab-akibat, bandingkan bukti, bedakan fakta, pendapat, dan dugaan, lalu periksa konsistensi sebelum menjawab.
2. Pemecahan masalah: susun diagnosis singkat, beberapa opsi bila relevan, rekomendasi terbaik beserta alasan yang dapat diperiksa, langkah pelaksanaan berurutan, cara menguji hasil, risiko penting, dan rencana cadangan. Jangan berhenti pada teori jika solusi praktis dapat diberikan.
3. Bahasa: pahami bahasa Indonesia formal, santai, singkatan, konteks lokal, dan salah ketik. Sesuaikan pilihan kata dengan pengguna; jelaskan istilah teknis, gunakan struktur yang mudah dibaca, dan pertahankan makna saat merangkum atau menerjemahkan.
4. Memori: gunakan pelajaran admin dan chat grup lama yang relevan. Hubungkan informasi lintas percakapan secara hati-hati, tetapi jangan mengubah rumor atau candaan menjadi fakta. Jika memori bertentangan, sebutkan perbedaannya dan prioritaskan informasi terbaru yang jelas.
5. Adaptasi: sesuaikan nada, panjang, format, dan kedalaman dengan tujuan serta kemampuan pengguna. Jawab langsung untuk pertanyaan sederhana; untuk tugas kompleks berikan hasil lengkap, contoh, langkah, dan bagian siap pakai. Belajar dari koreksi pengguna yang tersimpan tanpa mengorbankan aturan keselamatan dan identitas ABEL-LAB.
Utamakan akurasi daripada percaya diri. Jangan mengarang data. Ajukan paling banyak satu pertanyaan klarifikasi hanya jika informasi yang hilang benar-benar mengubah hasil. Abel adalah pasangan dan rekan AI-mu, bukan pengguna yang harus kamu balas otomatis.`,
    memoryTurns: 16,
    temperature: 0.55,
  },
});

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

export function normalizePhoneNumber(value = "") {
  let digits = String(value).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `62${digits.slice(1)}`;
  else if (digits.startsWith("8")) digits = `62${digits}`;
  return digits;
}

function normalizeProfile(id, input = {}) {
  const defaults = DEFAULT_BOT_PROFILES[id];
  if (!defaults) throw new Error(`Profil bot ${id} tidak dikenal`);
  const number = normalizePhoneNumber(input.pairingNumber ?? defaults.pairingNumber);
  const linkMethod = input.linkMethod === "code" ? "code" : "qr";
  return {
    ...defaults,
    ...input,
    id,
    name: String(input.name || defaults.name).trim().slice(0, 40),
    command: defaults.command,
    role: String(input.role || defaults.role).trim().slice(0, 220),
    enabled: input.enabled === undefined ? defaults.enabled : Boolean(input.enabled),
    pairingNumber: number,
    linkMethod,
    personality: String(input.personality || defaults.personality).trim().slice(0, 2000),
    customInstruction: String(input.customInstruction || defaults.customInstruction).trim().slice(0, 3000),
    memoryTurns: Math.min(50, Math.max(0, Number(input.memoryTurns ?? defaults.memoryTurns) || 0)),
    temperature: Math.min(2, Math.max(0, Number(input.temperature ?? defaults.temperature) || 0)),
  };
}

export function getBotProfiles() {
  const stored = readJson(PROFILES_FILE, {});
  return Object.fromEntries(
    Object.keys(DEFAULT_BOT_PROFILES).map(id => [id, normalizeProfile(id, stored[id])]),
  );
}

export function getBotProfile(id) {
  return getBotProfiles()[id] || null;
}

export function updateBotProfile(id, updates) {
  if (!DEFAULT_BOT_PROFILES[id]) {
    const error = new Error("Profil bot tidak ditemukan");
    error.status = 404;
    throw error;
  }
  const profiles = getBotProfiles();
  const next = normalizeProfile(id, { ...profiles[id], ...updates });
  if (next.enabled && next.linkMethod === "code" && (next.pairingNumber.length < 10 || next.pairingNumber.length > 15)) {
    const error = new Error(`Nomor WhatsApp ${next.name} belum valid untuk metode kode`);
    error.status = 400;
    throw error;
  }
  profiles[id] = next;
  writeJson(PROFILES_FILE, profiles);
  return next;
}

export function getBotStatuses() {
  const stored = readJson(STATUS_FILE, {});
  return Object.fromEntries(Object.keys(DEFAULT_BOT_PROFILES).map(id => [id, {
    id,
    state: stored[id]?.state || "offline",
    connected: Boolean(stored[id]?.connected),
    number: stored[id]?.number || "",
    pairingCode: stored[id]?.pairingCode || "",
    qrAvailable: Boolean(stored[id]?.qrAvailable),
    message: stored[id]?.message || "Belum dijalankan",
    updatedAt: stored[id]?.updatedAt || null,
  }]));
}

export function updateBotStatus(id, updates) {
  const statuses = getBotStatuses();
  statuses[id] = {
    ...statuses[id],
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  };
  writeJson(STATUS_FILE, statuses);
  return statuses[id];
}

export function requestBotRestart(id) {
  if (!DEFAULT_BOT_PROFILES[id]) throw new Error("Profil bot tidak ditemukan");
  const requests = readJson(CONTROL_FILE, []);
  requests.push({ id, action: "restart", requestedAt: new Date().toISOString() });
  writeJson(CONTROL_FILE, requests.slice(-20));
}

export function consumeBotControlRequests() {
  const requests = readJson(CONTROL_FILE, []);
  if (requests.length) writeJson(CONTROL_FILE, []);
  return Array.isArray(requests) ? requests : [];
}
