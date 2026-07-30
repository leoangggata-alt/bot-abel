// ============================================================
//  src/handler.js - Router semua pesan masuk
// ============================================================
import dotenv from "dotenv";
import fs from "fs";
dotenv.config();

import { chatAI, resetAI, isNeedAI } from "./ai.js";
import { kirimGambar } from "./image.js";
import { prosesOrder, cekOrder, pesanBantuanOrder, kirimQRIS, konfirmasiPembayaran } from "./order.js";
import {
  menuUtama, infoToko, infoProduk, infoHarga, infoPromo,
  caraPesan, faq, statusOrder, BANNER_FILE
} from "./menu.js";
import {
  welcomeMessage, goodbyeMessage, rulesGrup,
  buatTagAll, cekSpam, resetSpam
} from "./group.js";

const PREFIX =
  process.env.BOT_PREFIX ||
  (process.env.PREFIX?.length <= 3 ? process.env.PREFIX : "!");
const OWNER = process.env.OWNER_NUMBER;
const AUTO_READ = process.env.AUTO_READ !== "false";
const AUTO_TYPING = process.env.AUTO_TYPING !== "false";
const ANTI_SPAM = process.env.ANTI_SPAM !== "false";
const AI_IN_GROUP = process.env.AI_IN_GROUP !== "false";

// ── Handler Utama ────────────────────────────────────────────
export async function handleMessage(sock, msg) {
  try {
    const { key, message } = msg;
    if (!message) return;

    const from = key.remoteJid;
    const isGrup = from.endsWith("@g.us");

    // Fix: WhatsApp baru pakai @lid, bukan hanya @s.whatsapp.net
    const senderId = isGrup
      ? (key.participant || "")
      : from;

    const senderNum = senderId
      .replace("@s.whatsapp.net", "")
      .replace("@lid", "")
      .split(":")[0] || "";

    const isOwner = senderNum === OWNER;
    const isBotMsg = key.fromMe;

    // Abaikan pesan dari bot sendiri
    if (isBotMsg) return;

    // Ambil teks pesan (cover semua format termasuk grup & ephemeral)
    const teks =
      message.conversation ||
      message.extendedTextMessage?.text ||
      message.ephemeralMessage?.message?.extendedTextMessage?.text ||
      message.ephemeralMessage?.message?.conversation ||
      message.viewOnceMessage?.message?.extendedTextMessage?.text ||
      message.imageMessage?.caption ||
      message.videoMessage?.caption ||
      "";

    if (!teks) {
      console.log(`[SKIP] Pesan non-teks dari ${from}`);
      return;
    }

    console.log(`[MSG] ${isGrup ? "Grup" : "Personal"} | ${senderNum} | "${teks.slice(0, 60)}"`);

    // Fitur tambahan tidak boleh menggagalkan command utama saat koneksi goyah.
    if (AUTO_READ) {
      sock.readMessages([key]).catch((err) => {
        console.warn(`[AUTO_READ] dilewati: ${err?.message || err}`);
      });
    }

    // Anti-spam (hanya di grup)
    if (isGrup && ANTI_SPAM) {
      const spam = cekSpam(senderId);
      if (spam) {
        await kirim(sock, from, `⚠️ @${senderNum} kamu terlalu cepat mengirim pesan! Tunggu sebentar ya.`, [senderId]);
        return;
      }
    }

    if (AUTO_TYPING) {
      sock.sendPresenceUpdate("composing", from).catch((err) => {
        console.warn(`[AUTO_TYPING] dilewati: ${err?.message || err}`);
      });
    }

    const trimTeks = teks.trim();
    const lowerTeks = trimTeks.toLowerCase();

    // ── Cek apakah ada command dengan prefix ──────────────────
    if (trimTeks.startsWith(PREFIX)) {
      await handleCommand(sock, from, senderId, senderNum, isGrup, isOwner, trimTeks);
      return;
    }

    // ── Keyword khusus ────────────────────────────────────────
    if (["menu", "help", "bantuan"].includes(lowerTeks)) {
      if (!isGrup) { // keyword hanya di personal
        await kirim(sock, from, menuUtama(isGrup));
        return;
      }
    }

    // ── PERSONAL CHAT: semua pesan langsung ke AI (seperti ChatGPT) ──
    if (!isGrup) {
      const balasan = await chatAI(senderId, trimTeks);
      await kirim(sock, from, balasan);
      return;
    }

    // ── GRUP: hanya aktif jika dipanggil ─────────────────────
    // Cara aktifkan bot di grup:
    //   1. Pakai prefix !  → contoh: !ai siapa kamu
    //   2. Sebut "abel"    → contoh: abel siapa presiden?
    //   3. Tag/mention bot → contoh: @628xxx halo
    if (isGrup && AI_IN_GROUP) {
      const botNum = sock.user?.id?.split(":")[0];
      const diMention =
        teks.includes(`@${botNum}`) ||      // di-tag langsung
        lowerTeks.startsWith("abel ") ||    // mulai dengan "abel"
        lowerTeks === "abel";               // hanya kata "abel"

      if (diMention) {
        const pesanBersih = teks
          .replace(/@\d+/g, "")
          .replace(/^abel\s*/i, "")
          .trim();
        const balasan = await chatAI(senderId, pesanBersih || "halo");
        await kirim(sock, from, `@${senderNum} ${balasan}`, [senderId]);
        return;
      }
    }
  } catch (err) {
    console.error("[Handler Error]", err?.stack || err);
  }
}


// ── Handler Command (!perintah) ──────────────────────────────
async function handleCommand(sock, from, senderId, senderNum, isGrup, isOwner, teks) {
  const args = teks.slice(PREFIX.length).trim().split(/\s+/);
  const cmd = args[0].toLowerCase();
  const sisa = args.slice(1).join(" ");

  console.log(`[CMD] ${senderNum} → ${cmd} ${sisa}`);

  switch (cmd) {
    // ── Info & Produk ──
    case "menu":
    case "help":
      await kirim(sock, from, menuUtama(isGrup));
      break;

    case "info":
    case "toko":
      await kirim(sock, from, infoToko());
      break;

    case "produk":
    case "katalog": {
      // Kirim banner image + teks katalog
      const txtProduk = infoProduk();
      try {
        if (fs.existsSync(BANNER_FILE)) {
          await sock.sendMessage(from, {
            image: fs.readFileSync(BANNER_FILE),
            caption: txtProduk
          });
        } else {
          await kirim(sock, from, txtProduk);
        }
      } catch { await kirim(sock, from, txtProduk); }
      break;
    }

    case "harga": {
      // Kirim banner image + price list premium
      const txtHarga = infoHarga();
      try {
        if (fs.existsSync(BANNER_FILE)) {
          await sock.sendMessage(from, {
            image: fs.readFileSync(BANNER_FILE),
            caption: txtHarga
          });
        } else {
          await kirim(sock, from, txtHarga);
        }
      } catch { await kirim(sock, from, txtHarga); }
      break;
    }

    case "promo":
    case "diskon":
      await kirim(sock, from, infoPromo());
      break;

    // ── Order: !order [KODE] [JUMLAH] ─────────────────────────
    case "order": {
      if (!sisa) {
        await kirim(sock, from, pesanBantuanOrder());
      } else {
        const result = prosesOrder(senderNum, sisa);
        if (isGrup) {
          // Di grup: beri tahu sebentar
          await kirim(sock, from,
            `@${senderNum} ✅ Pesanan diterima! Detail & QRIS dikirim ke DM kamu ya 📱`,
            [senderId]
          );
          // Kirim struk ke DM pribadi user
          const dmJid = senderNum.includes("@") ? senderNum : `${senderNum}@s.whatsapp.net`;
          await kirim(sock, dmJid, result.pesan);
          if (result.ok) {
            await kirimQRIS(sock, dmJid, result.noOrder, result.total);
          }
        } else {
          // Personal: kirim langsung di chat
          await kirim(sock, from, result.pesan);
          if (result.ok) {
            await kirimQRIS(sock, from, result.noOrder, result.total);
          }
        }
      }
      break;
    }

    // ── Konfirmasi pembayaran: !konfirmasi [NO_ORDER] ──────────────
    case "konfirmasi":
    case "confirm":
    {
      if (!sisa) {
        await kirim(sock, from,
          `✅ *Konfirmasi Pembayaran*\n\n` +
          `Ketik: *!konfirmasi [NOMOR ORDER]*\n` +
          `Contoh: *!konfirmasi ORD-20250730-1234*\n\n` +
          `_Nomor order ada di struk pesanan kamu_`
        );
      } else {
        const result = konfirmasiPembayaran(senderNum, sisa.toUpperCase());
        await kirim(sock, from,
          isGrup ? `@${senderNum} ${result.pesan}` : result.pesan,
          isGrup ? [senderId] : []
        );
      }
      break;
    }

    // Cek status order
    case "cek":
    case "status": {
      if (!sisa) {
        await kirim(sock, from, `🔍 *Cek Status Order*\n\nFormat: *!cek [NOMOR ORDER]*\nContoh: *!cek ORD-20250730-1234*`);
      } else {
        await kirim(sock, from, cekOrder(sisa.toUpperCase()));
      }
      break;
    }

    case "bayar":
    case "pembayaran":
      await kirim(sock, from, infoToko());
      break;

    // ── CS & FAQ ──
    case "cs":
    case "admin":
      await kirim(sock, from,
        `👤 *Customer Service*\n\nUntuk bantuan lebih lanjut, hubungi admin kami:\n` +
        `📞 wa.me/${OWNER}\n\n_Jam operasional: Senin–Sabtu 08.00–17.00 WIB_`
      );
      break;

    case "faq":
      await kirim(sock, from, faq());
      break;

    // ── AI ──
    case "ai":
    case "tanya":
    case "chat":
      if (!sisa) {
        await kirim(sock, from, `🤖 Langsung ketik pertanyaan atau kebutuhanmu!\n\nContoh tanpa prefix:\n_buatkan prompt gambar sunset_\n_jelaskan apa itu AI_\n_buat caption instagram_\n\nAtau pakai: *${PREFIX}ai [pertanyaan]*`);
      } else {
        const balasan = await chatAI(senderId, sisa);
        await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
      }
      break;

    // Prompt generator (teks saja)
    case "prompt":
    case "buat":
    case "buatkan":
    case "generate": {
      const topik = sisa || "gambar kreatif";
      const promptReq = `Buatkan prompt lengkap untuk: ${topik}. Sertakan detail visual, style, lighting, dan quality tags.`;
      const balasan = await chatAI(senderId, promptReq);
      await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
      break;
    }

    // Generate gambar langsung
    case "gambar":
    case "image":
    case "img":
    case "foto": {
      if (!sisa) {
        await kirim(sock, from,
          `🎨 *Generate Gambar AI*\n\n` +
          `Cara pakai:\n*!gambar [deskripsi gambar]*\n\n` +
          `Contoh:\n` +
          `• !gambar wanita cantik memegang bunga\n` +
          `• !gambar mobil sport merah di jalan kota\n` +
          `• !gambar pemandangan pantai bali saat sunset\n` +
          `• !gambar kucing lucu memakai topi\n\n` +
          `_⏳ Proses 10-30 detik_`
        );
      } else {
        await kirimGambar(sock, from, sisa, isGrup ? `@${senderNum} 🎨 Ini gambarnya!` : "");
      }
      break;
    }

    case "reset":
      resetAI(senderId);
      resetSpam(senderId);
      await kirim(sock, from, `✅ Memori percakapan AI kamu berhasil direset!`);
      break;

    // ── Fitur Grup ──
    case "rules":
    case "peraturan":
      if (isGrup) {
        const meta = await sock.groupMetadata(from);
        await kirim(sock, from, rulesGrup(meta.subject));
      } else {
        await kirim(sock, from, `⚠️ Perintah ini hanya bisa digunakan di grup.`);
      }
      break;

    case "tagall":
    case "all":
      if (!isGrup) {
        await kirim(sock, from, `⚠️ Perintah ini hanya bisa digunakan di grup.`);
        break;
      }
      if (!isOwner) {
        await kirim(sock, from, `❌ Hanya owner yang bisa menggunakan perintah ini.`);
        break;
      }
      const meta = await sock.groupMetadata(from);
      const { teks: tagTeks, mentions } = buatTagAll(meta.participants, sisa);
      await sock.sendMessage(from, { text: tagTeks, mentions });
      break;

    case "link":
      if (isGrup) {
        try {
          const code = await sock.groupInviteCode(from);
          await kirim(sock, from, `🔗 *Link Grup:*\nhttps://chat.whatsapp.com/${code}`);
        } catch {
          await kirim(sock, from, `❌ Tidak bisa ambil link. Pastikan bot adalah admin grup.`);
        }
      } else {
        await kirim(sock, from, `⚠️ Perintah ini hanya bisa digunakan di grup.`);
      }
      break;

    case "ping":
      const start = Date.now();
      await kirim(sock, from, `🏓 Pong! _${Date.now() - start}ms_`);
      break;

    // Semua perintah tidak dikenal → langsung ke AI
    default: {
      // Gabungkan cmd + sisa jadi pertanyaan ke AI
      const pertanyaan = `${cmd} ${sisa}`.trim();
      console.log(`[AI-CMD] Routing ke AI: "${pertanyaan}"`);
      const balasan = await chatAI(senderId, pertanyaan);
      await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
    }
  }
}

// ── Handler Event Grup (join/leave) ─────────────────────────
export async function handleGroupUpdate(sock, updates) {
  if (process.env.WELCOME_MESSAGE === "false") return;

  for (const update of updates) {
    const { id, participants, action } = update;
    const meta = await sock.groupMetadata(id).catch(() => null);
    if (!meta) continue;

    for (const participant of participants) {
      const nama = participant.split("@")[0];

      if (action === "add") {
        const pesan = welcomeMessage(nama, meta.subject);
        await sock.sendMessage(id, { text: pesan, mentions: [participant] });
      } else if (action === "remove") {
        const pesan = goodbyeMessage(nama, meta.subject);
        await kirim(sock, id, pesan);
      }
    }
  }
}

// ── Helper kirim pesan ──────────────────────────────────────
async function kirim(sock, to, teks, mentions = []) {
  let lastError;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await sock.sendMessage(to, { text: teks, mentions });
      console.log(
        `[KIRIM ✅] ke ${to} | percobaan=${attempt} | "${teks.slice(0, 50)}..."`,
      );
      return true;
    } catch (err) {
      lastError = err;
      console.warn(
        `[KIRIM] percobaan=${attempt} gagal ke ${to}: ${err?.message || err}`,
      );
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
    }
  }

  console.error(`[KIRIM ❌] ke ${to} | Error: ${lastError?.stack || lastError}`);
  return false;
}
