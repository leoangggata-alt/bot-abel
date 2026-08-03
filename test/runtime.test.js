import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildCatalogContext,
  buildSystemPrompt,
  chatAI,
  detectAIMode,
  extractActiveRequest,
  isCreatorQuestion,
  isUsableAIResponse,
  needsCatalogContext,
  needsStoreActivityContext,
  summarizeStoreActivity,
  normalizeVisionInput,
} from "../src/ai.js";
import { DEFAULT_AI_SETTINGS, normalizeAISettings } from "../src/ai-settings.js";
import {
  formatGroupBroadcastMessage,
  sendBroadcastToGroups,
} from "../src/broadcast.js";
import { normalizeBroadcastRequest } from "../src/broadcast-store.js";
import {
  formatBroadcastDraft,
  formatPriceListAnnouncement,
  formatStockAnnouncement,
  parseCompactPriceList,
} from "../src/broadcast-format.js";
import { DEFAULT_BOT_PROFILES, normalizePhoneNumber } from "../src/bot-profile-store.js";
import { normalizeHostRole } from "../src/host-mode-store.js";
import { buildRealisticImagePrompt, normalizeImageRequest } from "../src/image.js";
import {
  ambilPesanGambar,
  ambilPromptGambar,
  ambilTeksPesan,
  ambilTeksKutipan,
  buildAffiliatePromptRequest,
  buildUGCPromptRequest,
  bolehKelolaMemoriGrup,
  gabungkanKonteksKutipan,
  handleMessage,
  isPerintahGrupBerprefix,
  routeGroupCommandForBot,
  isPermintaanMemberGrup,
  isPermintaanPromptAffiliate,
  isPermintaanPromptUGC,
  isPermintaanQRIS,
} from "../src/handler.js";
import { hitungTotalOrder, kirimQRIS } from "../src/order.js";
import { createGroupMemoryStore } from "../src/group-memory-store.js";
import { createProductStore, validateProducts } from "../src/product-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

test("penyimpanan produk atomik memulihkan backup saat file utama rusak", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "abel-products-"));
  const filePath = path.join(directory, "products.json");
  const backupPath = path.join(directory, "products.backup.json");
  const store = createProductStore({ filePath, backupPath });
  const products = [{ id: 1, kode: "P001", nama: "Produk Tes", harga: 10000, stok: 2 }];
  store.write(products);
  fs.writeFileSync(filePath, Buffer.alloc(128));
  assert.deepEqual(store.read(), products);
  store.update(current => [...current, { id: 2, kode: "P002", nama: "Produk Baru" }]);
  assert.equal(store.read().length, 2);
  assert.throws(
    () => validateProducts([{ kode: "P001" }, { kode: "p001" }]),
    /sudah digunakan/i,
  );
});

test("identitas pencipta selalu ABEL-LAB tanpa memanggil provider", async () => {
  assert.equal(isCreatorQuestion("Siapa yang menciptakan kamu?"), true);
  assert.equal(await chatAI("test-user", "kamu dibuat oleh siapa?"), "Saya diciptakan oleh ABEL-LAB.");
});

test("permintaan QRIS natural dikenali", () => {
  assert.equal(isPermintaanQRIS("mana QR pesanan saya"), true);
  assert.equal(isPermintaanQRIS("tolong kirimkan qris pembayaran"), true);
  assert.equal(isPermintaanQRIS("apa itu QR code"), false);
});

test("QRIS lengkap terkirim melalui socket tiruan", async () => {
  const sent = [];
  const sock = { sendMessage: async (to, content) => sent.push({ to, content }) };
  assert.equal(await kirimQRIS(sock, "123@lid", "ORD-TEST", 50000), true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "123@lid");
  assert.ok(Buffer.isBuffer(sent[0].content.image));
  assert.ok(sent[0].content.image.length > 100000);
});

test("total pesanan sama dengan harga barang tanpa ongkir", () => {
  assert.equal(hitungTotalOrder(7000, 1), 7000);
  assert.equal(hitungTotalOrder(15000, 3), 45000);
  assert.equal(hitungTotalOrder(50000, 1), 50000);
});

test("pengaturan panel dinormalisasi dengan aman", () => {
  assert.deepEqual(DEFAULT_AI_SETTINGS.textOrder, ["gemini", "groq", "openai", "xai"]);
  assert.deepEqual(DEFAULT_AI_SETTINGS.visionOrder, ["gemini", "openai", "groq", "xai"]);
  const settings = normalizeAISettings({
    textOrder: "xai,openai,xai,bukan-provider",
    imageOrder: ["gemini", "openai", "pollinations"],
    visionOrder: ["groq", "gemini", "groq"],
    memoryTurns: 99,
    temperature: -5,
  });
  assert.deepEqual(settings.textOrder, ["xai", "openai"]);
  assert.deepEqual(settings.imageOrder, ["gemini", "openai", "pollinations"]);
  assert.deepEqual(settings.visionOrder, ["groq", "gemini"]);
  assert.equal(settings.imageModels.gemini, "gemini-3-pro-image");
  assert.equal(settings.memoryTurns, 50);
  assert.equal(settings.temperature, 0);
});

test("mode host hanya menerima primary atau standby", () => {
  assert.equal(normalizeHostRole("PRIMARY"), "primary");
  assert.equal(normalizeHostRole("standby"), "standby");
  assert.equal(normalizeHostRole("tidak-valid", "standby"), "standby");
});

test("bahasa perintah natural tetap dikenali untuk konteks AI", () => {
  assert.equal(isPermintaanMemberGrup("tolong jelaskan cara kerjanya"), true);
  assert.equal(isPermintaanMemberGrup("berapa hasil 12 x 8?"), true);
  assert.equal(isPermintaanMemberGrup("bercanda dong biar grup ramai"), true);
  assert.equal(isPermintaanMemberGrup("rekomendasikan produk yang murah"), true);
  assert.equal(isPermintaanMemberGrup("aku mau tanya cara order"), true);
  assert.equal(isPermintaanMemberGrup("menurut kamu produk mana yang bagus"), true);
  assert.equal(isPermintaanMemberGrup("lagi ngopi nih teman-teman"), false);
});

test("pesan grup hanya diproses bila memakai prefix", () => {
  assert.equal(isPerintahGrupBerprefix("!ai jelaskan produk"), true);
  assert.equal(isPerintahGrupBerprefix("  !gambar poster promo  "), true);
  assert.equal(isPerintahGrupBerprefix("!analisis"), true);
  assert.equal(isPerintahGrupBerprefix("!"), false);
  assert.equal(isPerintahGrupBerprefix("Abel jelaskan produk"), false);
  assert.equal(isPerintahGrupBerprefix("berapa harga produk?"), false);
  assert.equal(isPerintahGrupBerprefix(""), false);
});

test("handler grup diam tanpa prefix dan merespons command bertanda seru", async () => {
  const sent = [];
  const sock = {
    user: { id: "628216035841:1@s.whatsapp.net" },
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (to, content) => sent.push({ to, content }),
  };
  const baseKey = {
    remoteJid: "120363000000000000@g.us",
    participant: "628111111111@s.whatsapp.net",
    fromMe: false,
  };

  await handleMessage(sock, { key: baseKey, message: { conversation: "berapa harga produk?" } });
  await handleMessage(sock, { key: baseKey, message: { imageMessage: { mimetype: "image/jpeg" } } });
  assert.equal(sent.length, 0);

  await handleMessage(sock, { key: baseKey, message: { conversation: "!menu" } });
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.text, /!menu - Tampilkan menu ini/i);
});

test("Abel dan Arka mempunyai jalur perintah grup yang tidak bertabrakan", () => {
  const abel = { id: "abel", command: "abel" };
  const arka = { id: "arka", command: "arka" };
  assert.equal(routeGroupCommandForBot("!harga", abel).accepted, true);
  assert.equal(routeGroupCommandForBot("!harga", arka).accepted, false);
  assert.equal(routeGroupCommandForBot("!arka jelaskan ini", abel).accepted, false);
  assert.deepEqual(routeGroupCommandForBot("!arka jelaskan ini", arka), {
    accepted: true,
    text: "!ai jelaskan ini",
  });
  assert.equal(routeGroupCommandForBot("!duo beri saran", abel).accepted, true);
  assert.equal(routeGroupCommandForBot("!duo beri saran", arka).accepted, true);
  assert.deepEqual(routeGroupCommandForBot("!arka rangkum 20", arka), {
    accepted: true,
    text: "!rangkum 20",
  });
  assert.deepEqual(routeGroupCommandForBot("! Arka apa kabar?", arka), {
    accepted: true,
    text: "!ai apa kabar?",
  });
  assert.equal(routeGroupCommandForBot("! Arka apa kabar?", abel).accepted, false);
});

test("memori grup persisten, terdeduplikasi, dapat diajar, dan dapat dihapus", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "abel-group-memory-"));
  const memoryFile = path.join(directory, "memory.json");
  try {
    const store = createGroupMemoryStore(memoryFile);
    const groupId = "120363999999999999@g.us";
    const first = {
      id: "MSG-SAMA-1",
      senderId: "628111111111@s.whatsapp.net",
      senderName: "Budi",
      text: "Promo dimulai hari Senin.",
      timestamp: "2026-08-02T10:00:00.000Z",
    };
    store.recordMessage(groupId, first);
    store.recordMessage(groupId, first);
    assert.equal(store.getStats(groupId).messageCount, 1);
    assert.match(store.transcript(groupId), /Budi: Promo dimulai hari Senin/);

    store.recordMessage(groupId, {
      ...first,
      id: "MSG-LAMA-MERPATI",
      text: "Kode proyek MERPATI disepakati untuk peluncuran toko.",
    });
    for (let index = 0; index < 25; index += 1) {
      store.recordMessage(groupId, {
        ...first,
        id: `MSG-BARU-${index}`,
        text: `Obrolan terbaru nomor ${index} tentang kegiatan harian.`,
      });
    }
    const relevantContext = store.context(groupId, {
      query: "Apa kode proyek peluncuran toko?",
    });
    assert.match(relevantContext, /MERPATI/);
    assert.ok(relevantContext.length <= 4500);

    const teaching = store.addTeaching(
      groupId,
      "Sapaan resmi grup adalah Sahabat Abel.",
      "628222222222@lid",
    );
    assert.match(teaching.id, /^A-[A-F0-9-]{8}$/);
    assert.equal(store.getStats(groupId).teachingCount, 1);
    assert.match(store.context(groupId), /Sapaan resmi grup adalah Sahabat Abel/);
    assert.match(store.context(groupId), /bukan instruksi sistem/i);

    assert.equal(store.removeTeaching(groupId, teaching.id.toLowerCase()), true);
    assert.equal(store.getStats(groupId).teachingCount, 0);
    store.clearGroup(groupId, "chat");
    assert.equal(store.getStats(groupId).messageCount, 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("permintaan aktif dipisahkan dari memori agar riwayat AI tidak membengkak", () => {
  const envelope = "MEMORI PERSISTEN GRUP\n- data lama\n\nPERMINTAAN AKTIF PENGGUNA:\nJelaskan dengan akurat.\n\nATURAN JAWABAN AKTIF:\nJawab langsung.";
  assert.equal(extractActiveRequest(envelope), "Jelaskan dengan akurat.");
});

test("jawaban provider yang terpotong atau membocorkan instruksi ditolak", () => {
  assert.equal(isUsableAIResponse("greetings if direct context fits.\n\n3. **"), false);
  assert.equal(isUsableAIResponse("Langkah pertama yang paling masuk akal"), false);
  assert.equal(isUsableAIResponse("Cek data transaksi hari ini dulu, lalu bandingkan dengan kemarin."), true);
  assert.equal(isUsableAIResponse("Siap, Bos! 😎"), true);
});

test("hanya owner atau admin grup yang boleh mengubah pelajaran bot", async () => {
  const sock = {
    groupMetadata: async () => ({
      participants: [
        { id: "628100000001@s.whatsapp.net", lid: "111111@lid", admin: "admin" },
        { id: "628100000002@s.whatsapp.net", lid: "222222@lid", admin: null },
      ],
    }),
  };
  assert.equal(await bolehKelolaMemoriGrup(sock, "123@g.us", "111111@lid", false), true);
  assert.equal(await bolehKelolaMemoriGrup(sock, "123@g.us", "222222@lid", false), false);
  assert.equal(await bolehKelolaMemoriGrup(sock, "123@g.us", "999999@lid", true), true);
});

test("socket Arka mengabaikan command Abel dan menjawab saat dipanggil", async () => {
  const sent = [];
  const sock = {
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (to, content) => sent.push({ to, content }),
  };
  const key = {
    remoteJid: "120363000000000001@g.us",
    participant: "628222222222@s.whatsapp.net",
    fromMe: false,
  };
  const arka = { id: "arka", name: "Arka", command: "arka", memoryTurns: 16, temperature: 0.65 };
  await handleMessage(sock, { key, message: { conversation: "!menu" } }, arka);
  assert.equal(sent.length, 0);
  await handleMessage(sock, { key, message: { conversation: "!arka menu" } }, arka);
  assert.equal(sent.length, 1);
  assert.match(sent[0].content.text, /!arka \[pesan\]/i);
});

test("perintah duo dapat dijawab satu kali oleh masing-masing bot", async () => {
  const sent = [];
  const sock = {
    readMessages: async () => {},
    sendPresenceUpdate: async () => {},
    sendMessage: async (to, content) => sent.push({ to, content }),
  };
  const message = {
    key: {
      remoteJid: "120363000000000002@g.us",
      participant: "628333333333@s.whatsapp.net",
      fromMe: false,
    },
    message: { conversation: "!duo menu" },
  };
  await handleMessage(sock, message, { id: "abel", name: "Abel", command: "abel" });
  await handleMessage(sock, message, { id: "arka", name: "Arka", command: "arka" });
  assert.equal(sent.length, 2);
});

test("nomor Arka dinormalisasi dan karakter otaknya berbeda dari Abel", () => {
  assert.equal(normalizePhoneNumber("081234567890"), "6281234567890");
  assert.equal(DEFAULT_BOT_PROFILES.arka.linkMethod, "qr");
  assert.equal(DEFAULT_BOT_PROFILES.arka.temperature, 0.55);
  assert.match(DEFAULT_BOT_PROFILES.arka.customInstruction, /hubungan sebab-akibat/i);
  assert.match(DEFAULT_BOT_PROFILES.arka.customInstruction, /langkah pelaksanaan berurutan/i);
  assert.match(DEFAULT_BOT_PROFILES.arka.customInstruction, /chat grup lama yang relevan/i);
  assert.match(DEFAULT_BOT_PROFILES.arka.customInstruction, /sesuaikan nada, panjang, format, dan kedalaman/i);
  assert.match(DEFAULT_BOT_PROFILES.arka.personality, /gaul, cerdas, tegas/i);
  assert.match(DEFAULT_BOT_PROFILES.abel.personality, /romantis, manis, ceria, lucu/i);
  assert.match(DEFAULT_BOT_PROFILES.abel.customInstruction, /jawab inti pertanyaan terlebih dahulu/i);
  const sharedSettings = {
    customInstruction: "Jawab akurat.",
    botProfile: {
      id: "arka",
      name: "Arka",
      role: "Pendamping grup",
      personality: "Tenang, tegas, dan analitis",
      customInstruction: "Fokus pada analisis.",
    },
  };
  const prompt = buildSystemPrompt(sharedSettings);
  assert.match(prompt, /Kamu adalah Arka/);
  assert.match(prompt, /Tenang, tegas, dan analitis/);
  assert.match(prompt, /Fokus pada analisis/);
  assert.match(prompt, /ABEL-LAB/);
});

test("permintaan siaran memvalidasi tujuan grup dan panjang pesan", () => {
  const groups = [
    { id: "111@g.us", name: "Grup Satu", participantCount: 12 },
    { id: "222@g.us", name: "Grup Dua", participantCount: 8 },
  ];
  const all = normalizeBroadcastRequest({ message: " Promo hari ini ", targetMode: "all" }, groups);
  assert.equal(all.message, "Promo hari ini");
  assert.equal(all.targets.length, 2);

  const selected = normalizeBroadcastRequest({
    message: "Pengumuman",
    targetMode: "selected",
    groupIds: ["222@g.us", "tidak-valid@g.us"],
  }, groups);
  assert.deepEqual(selected.targets.map(group => group.id), ["222@g.us"]);
  assert.throws(
    () => normalizeBroadcastRequest({ message: "", targetMode: "all" }, groups),
    /wajib diisi/,
  );
});

test("siaran grup memakai socket bot dan mencatat hasil per grup", async () => {
  const sent = [];
  const sock = {
    sendMessage: async (to, content) => {
      if (to === "222@g.us") throw new Error("grup tidak tersedia");
      sent.push({ to, content });
    },
  };
  const targets = [
    { id: "111@g.us", name: "Grup Satu" },
    { id: "222@g.us", name: "Grup Dua" },
  ];
  const results = await sendBroadcastToGroups(sock, targets, "Promo spesial", { delayMs: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "111@g.us");
  assert.match(sent[0].content.text, /^📢/);
  assert.match(formatGroupBroadcastMessage("Promo spesial"), /Promo spesial$/);
  assert.deepEqual(results.map(result => result.status), ["success", "failed"]);

  const formatted = "📢 *ABEL-LAB*\n\n✨ *UPDATE STOK*";
  const direct = [];
  await sendBroadcastToGroups({
    sendMessage: async (to, content) => direct.push({ to, content }),
  }, [{ id: "333@g.us", name: "Grup Tiga" }], formatted, {
    delayMs: 0,
    preformatted: true,
  });
  assert.equal(direct[0].content.text, formatted);
});

test("daftar harga singkat dirombak menjadi pengumuman premium", () => {
  const parsed = parseCompactPriceList("gemini stok 18 harga 50000\ncapcut stok 3 harga 15k");
  assert.deepEqual(parsed, [
    { name: "Gemini", stock: 18, price: 50000 },
    { name: "CapCut", stock: 3, price: 15000 },
  ]);
  const announcement = formatPriceListAnnouncement("gemini stok 18 harga 50000\ncapcut stok 3 harga 15k");
  assert.match(announcement, /DAFTAR HARGA/);
  assert.match(announcement, /Rp50\.000/);
  assert.match(announcement, /Stok: \*3\* — ⚠️ TERBATAS/);
});

test("update stok mengambil harga dan jumlah langsung dari produk aktif", () => {
  const products = [
    { kode: "P001", nama: "Gemini Pro", harga: 45000, stok: 18, aktif: true },
    { kode: "P002", nama: "ChatGPT Plus", harga: 75000, stok: 0, aktif: true },
    { kode: "P003", nama: "Nonaktif", harga: 1000, stok: 9, aktif: false },
  ];
  const announcement = formatStockAnnouncement(products, "Promo khusus hari ini");
  assert.match(announcement, /Gemini Pro/);
  assert.match(announcement, /Rp45\.000/);
  assert.match(announcement, /Stok: \*18\* — ✅ READY/);
  assert.match(announcement, /Stok: \*0\* — ❌ HABIS/);
  assert.doesNotMatch(announcement, /Nonaktif/);
  assert.match(announcement, /Promo khusus hari ini/);

  const finalMessage = formatBroadcastDraft({
    mode: "stock",
    products,
    businessName: "ABEL-LAB",
  });
  assert.match(finalMessage, /^📢 \*ABEL-LAB\*/);
});

test("mode AI otomatis mengenali vision, jualan, humor, kreatif, dan fakta", () => {
  assert.equal(detectAIMode("apa isi gambar ini", true), "vision");
  assert.equal(detectAIMode("rekomendasikan produk yang ready"), "sales");
  assert.equal(detectAIMode("buat lelucon lucu"), "humor");
  assert.equal(detectAIMode("tulis cerita pendek"), "creative");
  assert.equal(detectAIMode("jelaskan mengapa langit biru"), "factual");
});

test("katalog hanya dimuat saat pertanyaan benar-benar membutuhkan produk", () => {
  assert.equal(needsCatalogContext("berapa harga produk P001 dan stoknya?"), true);
  assert.equal(needsCatalogContext("jualan hari ini ramai tidak?"), false);
  const withoutCatalog = buildSystemPrompt({ includeCatalog: false });
  assert.doesNotMatch(withoutCatalog, /P001 \| gemini pro/i);
  assert.match(withoutCatalog, /Katalog tidak dilampirkan/i);
});

test("pertanyaan penjualan hari ini memakai ringkasan transaksi nyata", () => {
  assert.equal(needsStoreActivityContext("jualan hari ini rame kah?"), true);
  assert.equal(needsStoreActivityContext("buat caption jualan"), false);
  const summary = summarizeStoreActivity([
    { waktu: "02/08/2026, 10.15.00", status: "Selesai", total: 50000 },
    { waktu: "02/08/2026, 11.00.00", status: "Menunggu Verifikasi", total: 45000 },
    { waktu: "01/08/2026, 09.00.00", status: "Selesai", total: 7000 },
  ], "2026-08-02");
  assert.match(summary, /Pesanan tercatat: 2/);
  assert.match(summary, /Selesai: 1/);
  assert.match(summary, /Menunggu Verifikasi: 1/);
  assert.doesNotMatch(summary, /Rp|pendapatan:|50\.000/i);
  assert.doesNotMatch(summary, /senderNum|nomor|pelanggan/i);
});

test("pertanyaan aktivitas toko dijawab lokal tanpa halusinasi provider", async () => {
  const abelReply = await chatAI("uji-aktivitas-abel", "jualan hari ini rame kah?", {
    profile: DEFAULT_BOT_PROFILES.abel,
  });
  const arkaReply = await chatAI("uji-aktivitas-arka", "penjualan sekarang berapa?", {
    profile: DEFAULT_BOT_PROFILES.arka,
  });
  assert.match(abelReply, /hari ini tercatat \d+ pesanan/i);
  assert.match(abelReply, /sayang|manis/i);
  assert.match(arkaReply, /hari ini tercatat \d+ pesanan/i);
  assert.match(arkaReply, /Bos|Data realnya/i);
});

test("AI menerima katalog aktual dan perintah visual natural", () => {
  const catalog = buildCatalogContext([
    { kode: "P001", nama: "gemini pro 18bulan", harga: 45000, stok: 14, aktif: true },
    { kode: "P999", nama: "produk habis", harga: 10000, stok: 0, aktif: true },
  ]);
  assert.match(catalog, /P001 \| gemini pro 18bulan \| Rp \d+[.]\d{3}/);
  assert.match(catalog, /HABIS/);
  assert.equal(ambilPromptGambar("buatkan gambar kucing di taman"), "kucing di taman");
  assert.equal(ambilPromptGambar("buatkan poster promo minuman"), "poster promo minuman");
  assert.equal(ambilPromptGambar("buat prompt poster promo"), "");
});

test("prompt konten affiliate dikenali dan disusun lengkap", () => {
  assert.equal(isPermintaanPromptAffiliate("buatkan prompt konten affiliate untuk serum"), true);
  assert.equal(isPermintaanPromptAffiliate("saya baru daftar affiliate"), false);
  const request = buildAffiliatePromptRequest("serum wajah untuk TikTok");
  assert.match(request, /Lima hook/);
  assert.match(request, /Shot list/);
  assert.match(request, /Nano Banana Pro/);
  assert.match(request, /Jangan membuat klaim medis/);
});

test("prompt UGC siap salin memuat dialog, Flow, dan negative prompt", () => {
  assert.equal(isPermintaanPromptUGC("buat prompt UGC untuk video affiliate"), true);
  assert.equal(isPermintaanPromptUGC("ugc botol minum untuk mahasiswa"), true);
  assert.equal(isPermintaanPromptUGC("buat promt detail ugc beserta dialog"), true);
  assert.equal(isPermintaanPromptUGC("apa arti singkatan UGC"), false);
  const request = buildUGCPromptRequest("botol minum untuk mahasiswa di TikTok");
  assert.match(request, /CHARACTER LOCK/);
  assert.match(request, /PROMPT NANO BANANA PRO/);
  assert.match(request, /PROMPT GOOGLE FLOW \/ VEO/);
  assert.match(request, /Talent says in Indonesian/);
  assert.match(request, /NEGATIVE PROMPT FLOW\/VEO/);
  assert.match(request, /tanpa kata no\/don't\/jangan\/tidak/);
});

test("prompt gambar otomatis ditingkatkan untuk hasil realistis", () => {
  const realistic = buildRealisticImagePrompt("wanita memegang botol parfum di studio");
  assert.match(realistic, /premium photorealistic image/i);
  assert.match(realistic, /Do not add logos, watermarks/i);

  const styled = buildRealisticImagePrompt("ilustrasi anime kucing di taman");
  assert.match(styled, /requested visual style faithfully/i);
  assert.doesNotMatch(styled, /premium photorealistic image/i);

  assert.equal(normalizeImageRequest("risot mewah di Bali"), "resort mewah di Bali");
  assert.equal(normalizeImageRequest("poto wanita duduk di pantai"), "foto wanita duduk di pantai");
  assert.equal(
    normalizeImageRequest("buat sebuah temoat risort yang sangat asestic"),
    "buat sebuah tempat resort yang sangat aesthetic"
  );
  const resort = buildRealisticImagePrompt("risot tropis di tepi pantai");
  assert.match(resort, /USER REQUEST — AUTHORITATIVE:\nresort tropis/i);
  assert.match(resort, /photorealistic architectural photography/i);
  assert.doesNotMatch(resort, /natural skin texture|lifelike anatomy/i);
  assert.match(resort, /Follow the complete user request literally/i);
  assert.match(resort, /subject count, identity, pose, action, location/i);
});

test("gambar langsung, gambar kutipan, dan konteks reply dikenali", () => {
  assert.equal(ambilPesanGambar({ imageMessage: { mimetype: "image/jpeg" } }).source, "direct");
  const replied = {
    extendedTextMessage: {
      text: "apa isi gambar ini?",
      contextInfo: {
        quotedMessage: { imageMessage: { mimetype: "image/png", caption: "nota belanja" } },
      },
    },
  };
  assert.equal(ambilPesanGambar(replied).source, "quoted");
  assert.equal(ambilTeksKutipan(replied), "nota belanja");
  assert.match(gabungkanKonteksKutipan("jelaskan", "pesan lama"), /pesan lama/);
});

test("format chat WhatsApp umum terbaca", () => {
  assert.equal(ambilTeksPesan({ conversation: "halo" }), "halo");
  assert.equal(ambilTeksPesan({ imageMessage: { caption: "cek foto ini" } }), "cek foto ini");
  assert.equal(
    ambilTeksPesan({ ephemeralMessage: { message: { extendedTextMessage: { text: "pesan sementara" } } } }),
    "pesan sementara"
  );
  assert.equal(
    ambilTeksPesan({ buttonsResponseMessage: { selectedDisplayText: "Lihat harga" } }),
    "Lihat harga"
  );
});

test("input vision divalidasi dan diubah ke base64", () => {
  const image = normalizeVisionInput({ buffer: Buffer.alloc(256, 1), mimeType: "image/png" });
  assert.equal(image.mimeType, "image/png");
  assert.ok(image.base64.length > 100);
  assert.throws(() => normalizeVisionInput({ buffer: Buffer.alloc(10), mimeType: "image/png" }));
});

test("JavaScript panel admin valid", () => {
  for (const file of ["admin.html", "mobile.html"]) {
    const html = fs.readFileSync(path.join(root, "public", file), "utf8");
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0);
    for (const script of scripts) new Function(script[1]);
  }
});
