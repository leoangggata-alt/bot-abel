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
    personality: "Feminin, hangat, ceria, kreatif, ekspresif, pandai berjualan, dan perhatian. Boleh bercanda dengan ramah tanpa merendahkan siapa pun.",
    customInstruction: "Utamakan pelayanan pelanggan, jualan, ide konten, UGC, kreativitas, dan jawaban yang terasa hangat.",
    memoryTurns: 16,
    temperature: 0.8,
  },
  arka: {
    id: "arka",
    name: "Arka",
    role: "Asisten pria, pendamping grup, analisis, dan pemecahan masalah",
    command: "arka",
    enabled: false,
    pairingNumber: "",
    personality: "Maskulin, tenang, tegas, cerdas, analitis, protektif, dan humoris secara santai. Tidak kasar, tidak dominan, dan tetap menghormati semua anggota grup.",
    customInstruction: "Utamakan analisis, pemecahan masalah, bantuan teknis, ketertiban grup, dan humor santai. Abel adalah rekan AI-mu, bukan pengguna yang harus kamu balas otomatis.",
    memoryTurns: 16,
    temperature: 0.65,
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
  return {
    ...defaults,
    ...input,
    id,
    name: String(input.name || defaults.name).trim().slice(0, 40),
    command: defaults.command,
    role: String(input.role || defaults.role).trim().slice(0, 220),
    enabled: input.enabled === undefined ? defaults.enabled : Boolean(input.enabled),
    pairingNumber: number,
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
  if (next.enabled && id === "arka" && (next.pairingNumber.length < 10 || next.pairingNumber.length > 15)) {
    const error = new Error("Nomor WhatsApp Arka belum valid");
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
