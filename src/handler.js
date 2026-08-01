// ============================================================
//  src/handler.js - Router semua pesan masuk
// ============================================================
import dotenv from "dotenv";
import fs from "fs";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
dotenv.config();

import { chatAI, resetAI } from "./ai.js";
import { kirimGambar } from "./image.js";
import {
  prosesOrder,
  cekOrder,
  pesanBantuanOrder,
  kirimQRIS,
  kirimQRISOrderTerakhir,
  konfirmasiPembayaran,
} from "./order.js";
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
const GROUP_MEMBER_COMMANDS = process.env.GROUP_MEMBER_COMMANDS !== "false";

// Ambil deskripsi dari bahasa natural tanpa salah menangkap permintaan "prompt gambar".
export function ambilPromptGambar(teks = "") {
  const nilai = teks.trim();
  if (!nilai || /\bprompt\b/i.test(nilai)) return "";

  const pola = [
    /^(?:tolong\s+)?(?:buat(?:kan)?|bikin(?:kan)?|ciptakan|generate)\s+(?:saya\s+)?(?:sebuah\s+)?(?:gambar|image|foto)(?:\s+(?:tentang|berupa|dengan tema))?\s+(.+)$/i,
    /^(?:tolong\s+)?(?:gambar(?:kan)?|image|foto)\s+(.+)$/i,
  ];

  for (const regex of pola) {
    const cocok = nilai.match(regex);
    if (cocok?.[1]?.trim()) return cocok[1].trim();
  }
  return "";
}

export function isPermintaanPromptAffiliate(teks = "") {
  const nilai = String(teks).toLowerCase().trim();
  const menyebutAffiliate = /\b(?:affiliate|afiliasi|affiliator)\b/.test(nilai);
  const memintaKonten = /\b(?:prompt|konten|content|skrip|script|naskah|caption|hook|ide|jualan|promosi|iklan|ugc|video)\b/.test(nilai);
  return menyebutAffiliate && memintaKonten;
}

export function buildAffiliatePromptRequest(request = "") {
  const kebutuhan = String(request || "").trim().slice(0, 2500) || "produk yang ingin dipromosikan";
  return `Bertindak sebagai creative strategist dan copywriter affiliate Indonesia. Buat paket konten jualan yang detail, praktis, dan langsung dapat dipakai berdasarkan kebutuhan berikut:\n\n${kebutuhan}\n\nWajib berikan dengan struktur:\n1. Ringkasan produk, target audiens, masalah audiens, dan angle penjualan utama.\n2. Lima hook pembuka yang kuat tetapi tidak menipu.\n3. Skrip video affiliate 30-45 detik: hook, masalah, demo/manfaat, bukti yang boleh disebut, CTA.\n4. Shot list per adegan lengkap dengan visual, aksi talent, dialog/voice-over, teks layar, durasi, dan transisi.\n5. Caption versi soft selling dan hard selling.\n6. CTA serta 10 hashtag relevan.\n7. Prompt visual siap salin untuk Nano Banana Pro dalam format vertikal 9:16, fotorealistis, termasuk subjek, produk, lokasi, komposisi, kamera, pencahayaan, warna, mood, dan negative constraints.\n8. Tiga variasi angle konten untuk A/B test.\n\nGunakan bahasa Indonesia natural. Jangan membuat klaim medis, jaminan hasil, harga, diskon, testimoni, atau spesifikasi yang tidak diberikan pengguna. Jika data produk kurang, tandai bagian yang harus diisi dengan [ISI DATA]. Jangan beri pembukaan panjang.`;
}

export function isPermintaanQRIS(teks = "") {
  const nilai = String(teks).toLowerCase().trim();
  const menyebutQR = /\b(qris|qr|kode qr)\b/.test(nilai);
  const meminta = /\b(mana|kirim|kirimkan|tampil|tampilkan|lihat|bayar|pembayaran|pesanan|order)\b/.test(nilai);
  return menyebutQR && meminta;
}

function unwrapImageMessage(container = {}) {
  return container.imageMessage ||
    container.viewOnceMessage?.message?.imageMessage ||
    container.viewOnceMessageV2?.message?.imageMessage ||
    container.ephemeralMessage?.message?.imageMessage ||
    null;
}

export function ambilTeksPesan(message = {}) {
  const nested = message.ephemeralMessage?.message ||
    message.viewOnceMessage?.message ||
    message.viewOnceMessageV2?.message ||
    message.documentWithCaptionMessage?.message ||
    null;
  if (nested) return ambilTeksPesan(nested);

  const interactiveParams = message.interactiveResponseMessage
    ?.nativeFlowResponseMessage?.paramsJson;
  let interactiveText = "";
  if (interactiveParams) {
    try {
      const parsed = JSON.parse(interactiveParams);
      interactiveText = parsed.title || parsed.id || parsed.selected_id || "";
    } catch { /* abaikan payload tombol yang tidak valid */ }
  }

  return String(
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.title ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    message.templateButtonReplyMessage?.selectedDisplayText ||
    message.templateButtonReplyMessage?.selectedId ||
    interactiveText ||
    ""
  );
}

function getContextInfo(message = {}) {
  return message.extendedTextMessage?.contextInfo ||
    message.imageMessage?.contextInfo ||
    message.videoMessage?.contextInfo ||
    null;
}

export function ambilPesanGambar(message = {}) {
  const direct = unwrapImageMessage(message);
  if (direct) return { imageMessage: direct, source: "direct" };

  const quoted = getContextInfo(message)?.quotedMessage;
  const quotedImage = quoted ? unwrapImageMessage(quoted) : null;
  return quotedImage ? { imageMessage: quotedImage, source: "quoted" } : null;
}

export function ambilTeksKutipan(message = {}) {
  const quoted = getContextInfo(message)?.quotedMessage;
  if (!quoted) return "";
  const text = quoted.conversation ||
    quoted.extendedTextMessage?.text ||
    unwrapImageMessage(quoted)?.caption ||
    quoted.videoMessage?.caption ||
    "";
  return String(text).trim().slice(0, 1500);
}

export function gabungkanKonteksKutipan(text, quotedText = "") {
  const prompt = String(text || "").trim();
  if (!quotedText) return prompt;
  return `${prompt}\n\nKonteks pesan yang dibalas:\n${quotedText}`;
}

export function isPermintaanMemberGrup(text = "") {
  const value = String(text).toLowerCase().trim();
  if (!value) return false;
  if (value.includes("?")) return true;
  return /^(tolong|bantu|jawab|jelaskan|terangkan|analisis|analisa|cek|periksa|cari|carikan|buat|buatkan|bikin|bikinkan|hitung|terjemahkan|translate|ringkas|rangkum|ubah|tulis|bacakan|lihat|apa|siapa|kenapa|mengapa|bagaimana|gimana|berapa|kapan|dimana|apakah|bisakah)\b/.test(value);
}

export async function downloadGambarWhatsApp(imageMessage) {
  const stream = await downloadContentFromMessage(imageMessage, "image");
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > 20 * 1024 * 1024) throw new Error("Ukuran gambar melebihi batas 20 MB");
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length < 100) throw new Error("Gambar WhatsApp kosong atau rusak");
  return buffer;
}

function promptAnalisisGambar(text = "") {
  const cleaned = String(text)
    .replace(/^!?(?:analisis|analisa|analyze|vision|lihat|baca|ocr)(?:\s+gambar)?\s*/i, "")
    .trim();
  return cleaned || "Analisis gambar ini secara teliti. Jelaskan isi yang benar-benar terlihat dan bacakan teks yang terbaca. Jika ada bagian tidak jelas, katakan dengan jujur.";
}

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
    const imageInfo = ambilPesanGambar(message);
    const quotedText = ambilTeksKutipan(message);

    // Abaikan pesan dari bot sendiri
    if (isBotMsg) return;

    // Ambil teks pesan (cover semua format termasuk grup & ephemeral)
    const teks = ambilTeksPesan(message);

    if (!teks && !imageInfo) {
      console.log(`[SKIP] Pesan non-teks dari ${from}`);
      return;
    }

    console.log(`[MSG] ${isGrup ? "Grup" : "Personal"} | ${senderNum} | "${(teks || "[gambar]").slice(0, 60)}"`);

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

    // Gambar langsung selalu dianalisis. Gambar kutipan dianalisis saat anggota
    // bertanya/menyuruh melihat gambar tersebut.
    const quotedVisionRequest = imageInfo?.source === "quoted" &&
      (/\b(gambar|foto|image|ini|tersebut|lihat|baca|ocr|analisis|analisa)\b/i.test(trimTeks) || isPermintaanMemberGrup(trimTeks));
    if (imageInfo && (imageInfo.source === "direct" || quotedVisionRequest)) {
      try {
        const imageBuffer = await downloadGambarWhatsApp(imageInfo.imageMessage);
        const basePrompt = promptAnalisisGambar(trimTeks);
        const prompt = gabungkanKonteksKutipan(basePrompt, quotedText);
        const balasan = await chatAI(senderId, prompt, {
          image: {
            buffer: imageBuffer,
            mimeType: imageInfo.imageMessage.mimetype || "image/jpeg",
          },
        });
        await kirim(
          sock,
          from,
          isGrup ? `@${senderNum} ${balasan}` : balasan,
          isGrup ? [senderId] : []
        );
      } catch (error) {
        console.error("[VISION] Gagal membaca gambar:", error.message);
        await kirim(sock, from, isGrup
          ? `@${senderNum} maaf, gambar itu belum berhasil dibaca. Coba kirim ulang sebagai JPG/PNG.`
          : "Maaf, gambar belum berhasil dibaca. Coba kirim ulang sebagai JPG/PNG.", isGrup ? [senderId] : []);
      }
      return;
    }

    // ── Cek apakah ada command dengan prefix ──────────────────
    if (trimTeks.startsWith(PREFIX)) {
      await handleCommand(sock, from, senderId, senderNum, isGrup, isOwner, trimTeks, quotedText);
      return;
    }

    // ── Keyword khusus ────────────────────────────────────────
    if (["menu", "help", "bantuan"].includes(lowerTeks)) {
      if (!isGrup) { // keyword hanya di personal
        await kirim(sock, from, menuUtama(isGrup));
        return;
      }
    }

    // Permintaan ulang QRIS harus ditangani sistem order, bukan dijawab oleh AI.
    if (isPermintaanQRIS(trimTeks)) {
      const target = isGrup ? senderId : from;
      const result = await kirimQRISOrderTerakhir(sock, target, senderNum, isGrup ? [senderId] : []);
      if (!result.ok) {
        await kirim(sock, from, isGrup ? `@${senderNum} ${result.pesan}` : result.pesan, isGrup ? [senderId] : []);
      } else if (isGrup) {
        await kirim(sock, from, `@${senderNum} ✅ QRIS sudah dikirim ke chat pribadimu.`, [senderId]);
      }
      return;
    }

    // Kalimat natural seperti "buatkan gambar kucing" langsung ke generator gambar.
    if (!isGrup) {
      const promptGambar = ambilPromptGambar(trimTeks);
      if (promptGambar) {
        await kirimGambar(sock, from, promptGambar);
        return;
      }
    }

    if (!isGrup && isPermintaanPromptAffiliate(trimTeks)) {
      const balasan = await chatAI(senderId, buildAffiliatePromptRequest(trimTeks));
      await kirim(sock, from, balasan);
      return;
    }

    // ── PERSONAL CHAT: semua pesan langsung ke AI (seperti ChatGPT) ──
    if (!isGrup) {
      const balasan = await chatAI(senderId, gabungkanKonteksKutipan(trimTeks, quotedText));
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

      const perintahMember = GROUP_MEMBER_COMMANDS && isPermintaanMemberGrup(trimTeks);

      if (diMention || perintahMember) {
        const pesanBersih = teks
          .replace(/@\d+/g, "")
          .replace(/^abel\s*/i, "")
          .trim();

        const promptGambar = ambilPromptGambar(pesanBersih);
        if (promptGambar) {
          await kirimGambar(
            sock,
            from,
            promptGambar,
            `@${senderNum} 🎨 Ini gambarnya!`
          );
          return;
        }

        if (isPermintaanPromptAffiliate(pesanBersih)) {
          const balasan = await chatAI(
            senderId,
            gabungkanKonteksKutipan(buildAffiliatePromptRequest(pesanBersih), quotedText)
          );
          await kirim(sock, from, `@${senderNum} ${balasan}`, [senderId]);
          return;
        }

        const balasan = await chatAI(
          senderId,
          gabungkanKonteksKutipan(pesanBersih || trimTeks || "halo", quotedText)
        );
        await kirim(sock, from, `@${senderNum} ${balasan}`, [senderId]);
        return;
      }
    }
  } catch (err) {
    console.error("[Handler Error]", err?.stack || err);
  }
}


// ── Handler Command (!perintah) ──────────────────────────────
async function handleCommand(sock, from, senderId, senderNum, isGrup, isOwner, teks, quotedText = "") {
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
      // Satu pesan saja: banner + price list. QRIS hanya dikirim sesudah order.
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
        if (!result.ok) {
          await kirim(
            sock,
            from,
            isGrup ? `@${senderNum} ${result.pesan}` : result.pesan,
            isGrup ? [senderId] : []
          );
          break;
        }
        if (isGrup) {
          // Di grup: beri tahu sebentar
          await kirim(sock, from,
            `@${senderNum} ✅ Pesanan diterima! Detail & QRIS dikirim ke DM kamu ya 📱`,
            [senderId]
          );
          // Kirim struk ke DM pribadi user
          // WhatsApp baru dapat memberi JID @lid. Pakai identitas asli pengirim;
          // mengubahnya menjadi @s.whatsapp.net membuat QRIS salah tujuan.
          const dmJid = senderId;
          await kirim(sock, dmJid, result.pesan);
          const qrSent = await kirimQRIS(sock, dmJid, result.noOrder, result.total);
          if (!qrSent) {
            await kirim(sock, from, `@${senderNum} ⚠️ QRIS belum berhasil dikirim. Kirim pesan pribadi lalu ketik *!qris*.`, [senderId]);
          }
        } else {
          // Personal: kirim langsung di chat
          await kirim(sock, from, result.pesan);
          const qrSent = await kirimQRIS(sock, from, result.noOrder, result.total);
          if (!qrSent) {
            await kirim(sock, from, "⚠️ QRIS belum berhasil dikirim. Ketik *!qris* untuk mencoba lagi atau *!cs* untuk bantuan.");
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
    case "qris":
    case "qr": {
      const target = isGrup ? senderId : from;
      const result = await kirimQRISOrderTerakhir(
        sock,
        target,
        senderNum,
        isGrup ? [senderId] : []
      );
      if (!result.ok) {
        await kirim(
          sock,
          from,
          isGrup ? `@${senderNum} ${result.pesan}` : result.pesan,
          isGrup ? [senderId] : []
        );
      } else if (isGrup) {
        await kirim(sock, from, `@${senderNum} ✅ QRIS sudah dikirim ke chat pribadimu.`, [senderId]);
      }
      break;
    }

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
    case "analisis":
    case "analisa":
    case "analyze":
    case "vision":
    case "ocr":
      await kirim(
        sock,
        from,
        "🖼️ Kirim gambar dengan caption pertanyaan, atau reply sebuah gambar lalu ketik *!analisis apa isi gambar ini?*"
      );
      break;

    case "ai":
    case "tanya":
    case "chat":
      if (!sisa) {
        await kirim(sock, from, `🤖 Langsung ketik pertanyaan atau kebutuhanmu!\n\nContoh tanpa prefix:\n_buatkan prompt gambar sunset_\n_jelaskan apa itu AI_\n_buat caption instagram_\n\nAtau pakai: *${PREFIX}ai [pertanyaan]*`);
      } else {
        const promptGambar = ambilPromptGambar(sisa);
        if (promptGambar) {
          await kirimGambar(sock, from, promptGambar, isGrup ? `@${senderNum} 🎨 Ini gambarnya!` : "");
        } else {
          const aiRequest = isPermintaanPromptAffiliate(sisa)
            ? buildAffiliatePromptRequest(sisa)
            : sisa;
          const balasan = await chatAI(senderId, gabungkanKonteksKutipan(aiRequest, quotedText));
          await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
        }
      }
      break;

    case "affiliate":
    case "afiliasi":
    case "kontenjualan":
      if (!sisa) {
        await kirim(
          sock,
          from,
          `🛍️ *Pembuat Konten Affiliate*\n\nCara pakai:\n*${PREFIX}affiliate [nama produk + detail]*\n\nContoh:\n*${PREFIX}affiliate serum wajah untuk wanita usia 20-35 tahun, gaya UGC TikTok*`
        );
      } else {
        const balasan = await chatAI(
          senderId,
          gabungkanKonteksKutipan(buildAffiliatePromptRequest(sisa), quotedText)
        );
        await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
      }
      break;

    // Prompt generator (teks saja)
    case "prompt":
    case "buat":
    case "buatkan":
    case "bikin":
    case "bikinkan":
    case "ciptakan":
    case "generate": {
      const promptGambar = ambilPromptGambar(`${cmd} ${sisa}`);
      if (promptGambar) {
        await kirimGambar(sock, from, promptGambar, isGrup ? `@${senderNum} 🎨 Ini gambarnya!` : "");
      } else {
        const topik = sisa || "gambar kreatif";
        const promptReq = isPermintaanPromptAffiliate(`${cmd} ${sisa}`)
          ? buildAffiliatePromptRequest(`${cmd} ${sisa}`)
          : `Buatkan prompt lengkap untuk: ${topik}. Sertakan detail visual, style, lighting, dan quality tags.`;
        const balasan = await chatAI(senderId, gabungkanKonteksKutipan(promptReq, quotedText));
        await kirim(sock, from, isGrup ? `@${senderNum} ${balasan}` : balasan, isGrup ? [senderId] : []);
      }
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
          `_Prioritas Gemini Nano Banana Pro • fallback otomatis jika limit_`
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
      const balasan = await chatAI(senderId, gabungkanKonteksKutipan(pertanyaan, quotedText));
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
