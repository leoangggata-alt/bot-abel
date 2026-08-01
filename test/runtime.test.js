import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { chatAI, isCreatorQuestion } from "../src/ai.js";
import { normalizeAISettings } from "../src/ai-settings.js";
import { isPermintaanQRIS } from "../src/handler.js";
import { kirimQRIS } from "../src/order.js";

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

test("pengaturan panel dinormalisasi dengan aman", () => {
  const settings = normalizeAISettings({
    textOrder: "xai,openai,xai,bukan-provider",
    imageOrder: ["gemini", "openai", "pollinations"],
    memoryTurns: 99,
    temperature: -5,
  });
  assert.deepEqual(settings.textOrder, ["xai", "openai"]);
  assert.deepEqual(settings.imageOrder, ["gemini", "openai", "pollinations"]);
  assert.equal(settings.memoryTurns, 50);
  assert.equal(settings.temperature, 0);
});

test("JavaScript panel admin valid", () => {
  const html = fs.readFileSync(path.join(root, "public", "admin.html"), "utf8");
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0);
  for (const script of scripts) new Function(script[1]);
});

