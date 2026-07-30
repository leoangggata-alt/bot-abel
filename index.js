// ============================================================
//  index.js - Entry point Bot WhatsApp Baileys
// ============================================================

import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
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

// Logger minimal
const logger = pino({ level: "silent" });

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
        console.log("🔄 Reconnecting...");
        connectToWhatsApp();
      } else {
        console.log("🚪 Logged out. Hapus folder 'session' lalu restart.");
        process.exit(0);
      }
    }

    if (connection === "open") {
      const num = sock.user?.id?.split(":")[0];
      console.log("\n╔══════════════════════════════════════╗");
      console.log("║  ✅ BOT BERHASIL TERHUBUNG! 💖        ║");
      console.log(`║  📞 Nomor: ${(num || "").padEnd(26)}║`);
      console.log(`║  💅 Nama : ${(process.env.BUSINESS_NAME || "Abel").padEnd(26)}║`);
      console.log("╚══════════════════════════════════════╝");
      console.log("\n🟢 Abel siap menerima pesan!");
      console.log(`📌 Prefix: ${process.env.PREFIX || "!"}`);
      console.log(`🤖 Gemini AI: ${process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY.includes("your_") ? "✅ Aktif" : "❌ Belum diset"}`);
      console.log("⏹️  Ctrl+C untuk stop\n");
    }
  });

  // ── Simpan credentials ────────────────────────────────────
  sock.ev.on("creds.update", saveCreds);

  // ── Terima pesan masuk ────────────────────────────────────
  sock.ev.on("messages.upsert", async (upsert) => {
    try {
      const { messages, type } = upsert;

      // Hanya proses pesan baru (notify), bukan history
      if (type !== "notify") return;

      for (const msg of messages) {
        // Skip status broadcast
        if (msg.key.remoteJid === "status@broadcast") continue;

        // Log pesan masuk untuk debugging
        const from = msg.key.remoteJid;
        const isGrup = from?.endsWith("@g.us");
        const teks =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          "(non-text)";

        console.log(`[MSG] ${isGrup ? "Grup" : "Personal"} | ${from} | "${teks}"`);

        await handleMessage(sock, msg);
      }
    } catch (err) {
      console.error("[Pesan Error]", err.message);
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
connectToWhatsApp().catch((err) => {
  console.error("❌ Fatal Error:", err.message);
  process.exit(1);
});
