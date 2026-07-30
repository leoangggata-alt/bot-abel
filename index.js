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

// ── Fungsi utama ─────────────────────────────────────────────
async function connectToWhatsApp() {
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
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut
          : true;

      if (shouldReconnect) {
        if (activeSocket === sock) activeSocket = null;
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
      console.log(`🤖 AI: ${process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY ? "✅ Aktif" : "❌ Belum diset"}`);
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
