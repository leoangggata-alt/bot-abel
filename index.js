// ============================================================
//  index.js - Entry point Bot WhatsApp Baileys
// ============================================================

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { handleMessage, handleGroupUpdate } from "./src/handler.js";
import { getApiKeyCandidates } from "./src/api-key-store.js";
import {
  processNextBroadcastJob,
  syncParticipatingGroups,
} from "./src/broadcast.js";
import { markGroupDirectoryDisconnected } from "./src/broadcast-store.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const QR_IMAGE_PATH = join(__dirname, "qrcode.png");
const botPrefix =
  process.env.BOT_PREFIX ||
  (process.env.PREFIX?.length <= 3 ? process.env.PREFIX : "!");

// Logger minimal
const logger = pino({ level: "silent" });
const pairingNumber = (process.env.PAIRING_NUMBER || "").replace(/\D/g, "");

let activeSocket = null;
let reconnectTimer = null;
let reconnectAttempt = 0;
let lastPairingRequestAt = 0;
let shuttingDown = false;
let broadcastPollTimer = null;
let groupSyncTimer = null;
let broadcastWorkerBusy = false;
const recentMessageIds = new Set();
const recentMessageOrder = [];

function isDuplicateMessage(id) {
  if (!id) return false;
  if (recentMessageIds.has(id)) return true;

  recentMessageIds.add(id);
  recentMessageOrder.push(id);
  if (recentMessageOrder.length > 1000) {
    recentMessageIds.delete(recentMessageOrder.shift());
  }
  return false;
}

function scheduleReconnect() {
  if (shuttingDown || reconnectTimer) return;
  const delay = Math.min(30000, 2000 * 2 ** reconnectAttempt);
  reconnectAttempt += 1;
  console.log(`🔄 Menghubungkan ulang dalam ${Math.ceil(delay / 1000)} detik...`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectToWhatsApp().catch((err) => {
      console.error("❌ Gagal reconnect:", err.message);
      scheduleReconnect();
    });
  }, delay);
}

function stopBroadcastServices() {
  if (broadcastPollTimer) clearInterval(broadcastPollTimer);
  if (groupSyncTimer) clearInterval(groupSyncTimer);
  broadcastPollTimer = null;
  groupSyncTimer = null;
}

async function runBroadcastWorker(sock) {
  if (broadcastWorkerBusy || activeSocket !== sock || shuttingDown) return;
  broadcastWorkerBusy = true;
  try {
    await processNextBroadcastJob(sock);
  } catch (error) {
    console.error(`[Broadcast Grup] Pekerja gagal: ${error.message}`);
  } finally {
    broadcastWorkerBusy = false;
  }
}

function startBroadcastServices(sock) {
  stopBroadcastServices();
  syncParticipatingGroups(sock)
    .then(directory => console.log(`[Broadcast Grup] ${directory.groups.length} grup tersedia di panel`))
    .catch(error => console.error(`[Broadcast Grup] Gagal memuat grup: ${error.message}`));

  broadcastPollTimer = setInterval(() => runBroadcastWorker(sock), 2000);
  groupSyncTimer = setInterval(() => {
    if (activeSocket !== sock || shuttingDown) return;
    syncParticipatingGroups(sock).catch(error => {
      console.error(`[Broadcast Grup] Gagal memperbarui grup: ${error.message}`);
    });
  }, 60000);
  broadcastPollTimer.unref?.();
  groupSyncTimer.unref?.();
}

// ── Fungsi utama ─────────────────────────────────────────────
async function connectToWhatsApp() {
  markGroupDirectoryDisconnected();
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const { version } = await fetchLatestBaileysVersion();

  console.log("╔══════════════════════════════════════╗");
  console.log("║   🤖 Bot Abel Asisten Tercantik       ║");
  console.log(`║   Nama: ${(process.env.BUSINESS_NAME || "Abel").padEnd(28)}║`);
  console.log("╚══════════════════════════════════════╝");
  console.log(`\n📦 Versi Baileys: ${version.join(".")}`);
  console.log("⏳ Menghubungkan ke WhatsApp...\n");

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
    getMessage: async () => ({ conversation: "" }), // ← fix pesan lama
    browser: ["Abel Bot", "Chrome", "120.0.0"],
  });
  activeSocket = sock;

  // Pairing code memudahkan login bila WhatsApp dan Termux ada di HP yang sama.
  if (
    !state.creds.registered &&
    pairingNumber &&
    Date.now() - lastPairingRequestAt > 60000
  ) {
    lastPairingRequestAt = Date.now();
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode(pairingNumber);
        const readableCode = code?.match(/.{1,4}/g)?.join("-") || code;
        console.log("\n========================================");
        console.log(`KODE PAIRING WHATSAPP: ${readableCode}`);
        console.log("WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon");
        console.log("========================================\n");
      } catch (error) {
        console.error("Gagal meminta pairing code:", error.message);
      }
    }, 2000);
  }

  // ── QR Code ──────────────────────────────────────────────
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n📱 SCAN QR CODE DENGAN WHATSAPP KAMU:\n");
      qrcode.generate(qr, { small: true });

      try {
        await QRCode.toFile(QR_IMAGE_PATH, qr, {
          color: { dark: "#000000", light: "#FFFFFF" },
          width: 400,
          margin: 2,
        });
        console.log(`\n✅ QR Code disimpan: ${QR_IMAGE_PATH}\n`);
      } catch (e) {
        console.error("Gagal simpan QR:", e.message);
      }
    }

    if (connection === "close") {
      const statusCode =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : "unknown";
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.warn(`[KONEKSI] tertutup | status=${statusCode}`);

      if (shouldReconnect) {
        if (activeSocket === sock) {
          activeSocket = null;
          stopBroadcastServices();
          markGroupDirectoryDisconnected();
        }
        scheduleReconnect();
      } else {
        console.log("🚪 Logged out. Hapus folder 'session' lalu restart.");
        process.exit(10);
      }
    }

    if (connection === "open") {
      reconnectAttempt = 0;
      const num = sock.user?.id?.split(":")[0];
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║  ✅ BOT BERHASIL TERHUBUNG! 💖        ║");
      console.log(`║  📞 Nomor: ${(num || "").padEnd(26)}║`);
      console.log(`║  💅 Nama : ${(process.env.BUSINESS_NAME || "Abel").padEnd(26)}║`);
      console.log("╚══════════════════════════════════════╝");
      console.log("\n🟢 Abel siap menerima pesan!");
      console.log(`📌 Prefix: ${botPrefix}`);
      const openaiKeys = getApiKeyCandidates("openai").length;
      const groqKeys = getApiKeyCandidates("groq").length;
      const geminiKeys = getApiKeyCandidates("gemini").length;
      startBroadcastServices(sock);
      console.log(`🤖 AI utama (OpenAI): ${openaiKeys ? `✅ ${openaiKeys} key aktif` : "❌ Belum diset"}`);
      console.log(`🧠 AI cadangan (Groq): ${groqKeys ? `✅ ${groqKeys} key aktif` : "❌ Belum diset"}`);
      console.log(`💠 AI cadangan (Gemini): ${geminiKeys ? `✅ ${geminiKeys} key aktif` : "❌ Belum diset"}`);
      console.log("⏹️  Ctrl+C untuk stop\n");
    }
  });

  // ── Simpan credentials ────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ── Terima pesan masuk ────────────────────────────────────
  sock.ev.on("messages.upsert", async (upsert) => {
    try {
      const { messages, type } = upsert;

      // Beberapa versi WhatsApp mengirim pesan live sebagai "append".
      // Pesan append lama tetap dilewati agar history tidak dibalas ulang.
      if (type !== "notify" && type !== "append") return;
      console.log(`[UPSERT] type=${type} | jumlah=${messages.length}`);

      for (const msg of messages) {
        const messageTimeMs = Number(msg.messageTimestamp || 0) * 1000;
        if (
          type === "append" &&
          messageTimeMs > 0 &&
          Date.now() - messageTimeMs > 2 * 60 * 1000
        ) {
          continue;
        }
        if (isDuplicateMessage(msg.key.id)) {
          console.log(`[SKIP] Pesan duplikat: ${msg.key.id}`);
          continue;
        }

        // Skip status broadcast
        if (msg.key.remoteJid === "status@broadcast") continue;

        const normalizedContent = normalizeMessageContent(msg.message);
        const normalizedMsg = normalizedContent
          ? { ...msg, message: normalizedContent }
          : msg;

        // Log pesan masuk untuk debugging
        const from = normalizedMsg.key.remoteJid;
        const isGrup = from?.endsWith("@g.us");
        const teks =
          normalizedMsg.message?.conversation ||
          normalizedMsg.message?.extendedTextMessage?.text ||
          normalizedMsg.message?.imageMessage?.caption ||
          "(non-text)";

        console.log(`[MSG] ${isGrup ? "Grup" : "Personal"} | ${from} | "${teks}"`);

        await handleMessage(sock, normalizedMsg);
      }
    } catch (err) {
      console.error("[Pesan Error]", err?.stack || err);
    }
  });

  // ── Update anggota grup ───────────────────────────────────
  sock.ev.on("group-participants.update", async (update) => {
    try {
      await handleGroupUpdate(sock, [update]);
    } catch (err) {
      console.error("[Group Error]", err.message);
    }
  });

  return sock;
}

// ── Start ─────────────────────────────────────────────────────
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  stopBroadcastServices();
  markGroupDirectoryDisconnected();
  console.log(`\nMenerima ${signal}; menutup koneksi WhatsApp...`);
  try {
    activeSocket?.end(new Error(`Shutdown ${signal}`));
  } catch {
    // Socket mungkin sudah tertutup.
  }
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

connectToWhatsApp().catch((err) => {
  console.error("❌ Fatal Error:", err.message);
  scheduleReconnect();
});
