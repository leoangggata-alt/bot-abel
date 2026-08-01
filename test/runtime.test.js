import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chatAI, isCreatorQuestion, normalizeVisionInput } from "../src/ai.js";
import { normalizeAISettings } from "../src/ai-settings.js";
import { buildRealisticImagePrompt } from "../src/image.js";
import {
  ambilPesanGambar,
  ambilTeksPesan,
  ambilTeksKutipan,
  buildAffiliatePromptRequest,
  buildUGCPromptRequest,
  gabungkanKonteksKutipan,
  isPermintaanMemberGrup,
  isPermintaanPromptAffiliate,
  isPermintaanPromptUGC,
  isPermintaanQRIS,
} from "../src/handler.js";
import { hitungTotalOrder, kirimQRIS } from "../src/order.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

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

test("perintah member grup dikenali tanpa membalas obrolan biasa", () => {
  assert.equal(isPermintaanMemberGrup("tolong jelaskan cara kerjanya"), true);
  assert.equal(isPermintaanMemberGrup("berapa hasil 12 x 8?"), true);
  assert.equal(isPermintaanMemberGrup("lagi ngopi nih teman-teman"), false);
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
  const html = fs.readFileSync(path.join(root, "public", "admin.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  for (const script of scripts) new Function(script[1]);
});
