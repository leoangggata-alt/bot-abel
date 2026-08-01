// Otak AI Abel: urutan provider, model, dan memori diatur dari panel admin.
import https from "https";
import crypto from "crypto";
import dotenv from "dotenv";
import { getApiKeyCandidates } from "./api-key-store.js";
import { getAISettings } from "./ai-settings.js";
dotenv.config();

const history = {};

function buildSystemPrompt(settings) {
  const custom = settings.customInstruction
    ? `\n\n## INSTRUKSI TAMBAHAN ADMIN\n${settings.customInstruction}`
    : "";
  return `Kamu adalah Abel, asisten AI cerdas yang berjalan di WhatsApp.

## IDENTITAS
- Nama: Abel
- Pencipta/developer: ABEL-LAB
- Jika ditanya siapa yang menciptakan, membuat, atau mengembangkanmu, jawab tegas bahwa kamu diciptakan oleh ABEL-LAB.
- Jangan mengaku dibuat oleh OpenAI, Google, xAI, Groq, atau provider model lain.
- Karakter: ceria, cerdas, kreatif, dan selalu siap membantu.
- Bahasa utama: Bahasa Indonesia yang natural, santai, dan sopan.
- Owner: ${process.env.OWNER_NAME || "Admin"}

## PERILAKU
- Utamakan ketepatan. Jangan mengarang fakta, angka, teks, nama, atau detail yang tidak terlihat/diketahui.
- Bedakan pengamatan dengan dugaan. Jika kurang yakin, katakan bagian yang tidak pasti dan minta klarifikasi.
- Baca pesan pengguna, caption, dan konteks pesan yang dibalas sebagai satu kesatuan.
- Saat menganalisis gambar, periksa objek, teks, jumlah, warna, posisi, dan konteks secara teliti. Jangan mengaku membaca teks yang buram.
- Jawab ringkas tetapi lengkap; gunakan poin bila membantu.
- Ingat konteks percakapan yang diberikan.
- Anggota grup boleh memberi pertanyaan dan perintah. Ikuti perintah yang aman dan masih dalam kemampuan bot.
- Jika diminta membuat gambar, jangan hanya memberi prompt; sistem bot akan menangani generator gambar sebelum chat ini.
- Tolak secara sopan permintaan berbahaya atau ilegal.
- Jika tidak yakin, jelaskan batas kepastian dengan singkat.${custom}`;
}

export function isCreatorQuestion(text = "") {
  const value = String(text).toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const asksWho = /\b(siapa|sapa)\b/.test(value);
  const creatorWords = /\b(menciptakan|menciptkan|membuat|buat|pencipta|pembuat|developer|mengembangkan|dikembangkan)\b/.test(value);
  const refersToBot = /\b(kamu|mu|abel|bot)\b/.test(value);
  return (asksWho && creatorWords && refersToBot) || /\bkamu dibuat oleh siapa\b/.test(value);
}

function httpPost(hostname, path, headers, body, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const bodyString = JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyString),
        ...headers,
      },
    }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, json: JSON.parse(data) });
        } catch {
          reject(new Error(`Respons provider tidak valid (HTTP ${res.statusCode || 0})`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Provider timeout")));
    req.write(bodyString);
    req.end();
  });
}

function providerError(provider, status, json) {
  const message = String(json?.error?.message || json?.message || `HTTP ${status}`)
    .replace(/\b(?:sk|xai)-[A-Za-z0-9_.*-]+/gi, "[API_KEY]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[API_KEY]");
  const error = new Error(`${provider}: ${String(message).slice(0, 240)}`);
  error.status = status;
  return error;
}

function requireCandidates(provider) {
  const candidates = getApiKeyCandidates(provider);
  if (!candidates.length) throw new Error(`${provider}: belum ada API key aktif`);
  return candidates;
}

export function normalizeVisionInput(image) {
  if (!image) return null;
  const buffer = Buffer.isBuffer(image) ? image : image.buffer;
  const mimeType = String(image.mimeType || image.mimetype || "image/jpeg").toLowerCase();
  if (!Buffer.isBuffer(buffer) || buffer.length < 100) {
    throw new Error("Data gambar tidak valid");
  }
  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Ukuran gambar melebihi batas 20 MB");
  }
  if (!/^image\/(jpeg|jpg|png|webp)$/.test(mimeType)) {
    throw new Error(`Format gambar ${mimeType} belum didukung`);
  }
  return {
    buffer,
    mimeType: mimeType === "image/jpg" ? "image/jpeg" : mimeType,
    base64: buffer.toString("base64"),
  };
}

function visionDataUrl(image) {
  return `data:${image.mimeType};base64,${image.base64}`;
}

function withOpenAIVision(messages, image) {
  if (!image) return messages;
  return [
    ...messages.slice(0, -1),
    {
      role: "user",
      content: [
        { type: "input_text", text: messages.at(-1)?.content || "Analisis gambar ini." },
        { type: "input_image", image_url: visionDataUrl(image), detail: "auto" },
      ],
    },
  ];
}

function withCompatibleVision(messages, image) {
  if (!image) return messages;
  return [
    ...messages.slice(0, -1),
    {
      role: "user",
      content: [
        { type: "text", text: messages.at(-1)?.content || "Analisis gambar ini." },
        {
          type: "image_url",
          image_url: { url: visionDataUrl(image), detail: "auto" },
        },
      ],
    },
  ];
}

function openAIText(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text.trim();
  return (json.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text" && item.text)
    .map(item => item.text)
    .join("\n")
    .trim();
}

async function callOpenAI(messages, userId, settings, image = null) {
  const model = image ? settings.visionModels.openai : settings.textModels.openai;
  let lastError;
  for (const [index, candidate] of requireCandidates("openai").entries()) {
    try {
      const { status, json } = await httpPost(
        "api.openai.com",
        "/v1/responses",
        { Authorization: `Bearer ${candidate.key}` },
        {
          model,
          instructions: buildSystemPrompt(settings),
          input: withOpenAIVision(messages, image),
          max_output_tokens: 900,
          store: false,
          safety_identifier: crypto.createHash("sha256").update(String(userId)).digest("hex"),
        }
      );
      const text = openAIText(json);
      if (status >= 200 && status < 300 && text) {
        console.log(`[AI] OpenAI/${model}${image ? " vision" : ""} slot ${index + 1}`);
        return text;
      }
      lastError = providerError("OpenAI", status, json);
    } catch (error) {
      lastError = error;
    }
    console.warn(`[AI] OpenAI slot ${index + 1} gagal: ${lastError.message}`);
  }
  throw lastError || new Error("OpenAI gagal");
}

async function callOpenAICompatible(provider, hostname, path, messages, settings, image = null) {
  const configured = image ? settings.visionModels[provider] : settings.textModels[provider];
  const modelFallbacks = image
    ? [configured]
    : provider === "groq"
    ? [configured, "llama-3.3-70b-versatile", "llama-3.1-8b-instant", "openai/gpt-oss-20b"]
    : [configured];
  const models = [...new Set(modelFallbacks.filter(Boolean))];
  let lastError;

  for (const [keyIndex, candidate] of requireCandidates(provider).entries()) {
    for (const model of models) {
      try {
        const { status, json } = await httpPost(
          hostname,
          path,
          { Authorization: `Bearer ${candidate.key}` },
          {
            model,
            messages: [
              { role: "system", content: buildSystemPrompt(settings) },
              ...withCompatibleVision(messages, image),
            ],
            max_tokens: 900,
            temperature: settings.temperature,
          }
        );
        const text = json.choices?.[0]?.message?.content?.trim();
        if (status >= 200 && status < 300 && text) {
          console.log(`[AI] ${provider}/${model}${image ? " vision" : ""} slot ${keyIndex + 1}`);
          return text;
        }
        lastError = providerError(provider, status, json);
      } catch (error) {
        lastError = error;
      }
      console.warn(`[AI] ${provider}/${model} gagal: ${lastError.message}`);
    }
  }
  throw lastError || new Error(`${provider} gagal`);
}

async function callGemini(messages, settings, image = null) {
  const contents = messages.map((message, index) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: image && index === messages.length - 1
      ? [
          { text: message.content },
          { inline_data: { mime_type: image.mimeType, data: image.base64 } },
        ]
      : [{ text: message.content }],
  }));
  let lastError;

  for (const [index, candidate] of requireCandidates("gemini").entries()) {
    try {
      const model = image ? settings.visionModels.gemini : settings.textModels.gemini;
      const { status, json } = await httpPost(
        "generativelanguage.googleapis.com",
        `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(candidate.key)}`,
        {},
        {
          system_instruction: { parts: [{ text: buildSystemPrompt(settings) }] },
          contents,
          generationConfig: { maxOutputTokens: 900 },
        }
      );
      const text = (json.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || "")
        .join("\n")
        .trim();
      if (status >= 200 && status < 300 && text) {
        console.log(`[AI] Gemini/${model}${image ? " vision" : ""} slot ${index + 1}`);
        return text;
      }
      lastError = providerError("Gemini", status, json);
    } catch (error) {
      lastError = error;
    }
    console.warn(`[AI] Gemini slot ${index + 1} gagal: ${lastError.message}`);
  }
  throw lastError || new Error("Gemini gagal");
}

async function callProvider(provider, messages, userId, settings, image = null) {
  switch (provider) {
    case "openai": return callOpenAI(messages, userId, settings, image);
    case "gemini": return callGemini(messages, settings, image);
    case "groq": return callOpenAICompatible("groq", "api.groq.com", "/openai/v1/chat/completions", messages, settings, image);
    case "xai": return callOpenAICompatible("xai", "api.x.ai", "/v1/chat/completions", messages, settings, image);
    default: throw new Error(`Provider teks ${provider} tidak dikenal`);
  }
}

export async function chatAI(userId, pesan, options = {}) {
  if (isCreatorQuestion(pesan)) return "Saya diciptakan oleh ABEL-LAB.";

  try {
    const settings = getAISettings();
    const image = normalizeVisionInput(options.image || null);
    if (!history[userId]) history[userId] = [];
    const userHistory = history[userId];
    const providerPrompt = image
      ? `INSTRUKSI AKURASI VISUAL: Periksa gambar sebelum menjawab. Jangan menebak atau melengkapi detail yang tidak terlihat. Untuk teks, angka, QR, nota, dan identitas, tulis hanya yang benar-benar terbaca. Jika tidak cukup jelas, katakan tidak terbaca/tidak yakin.\n\nPERMINTAAN PENGGUNA:\n${pesan}`
      : pesan;
    const messages = [...userHistory, { role: "user", content: providerPrompt }];
    let balasan = "";
    let lastError;

    const providerOrder = image ? settings.visionOrder : settings.textOrder;
    for (const provider of providerOrder) {
      try {
        balasan = await callProvider(provider, messages, userId, settings, image);
        if (balasan) break;
      } catch (error) {
        lastError = error;
        console.warn(`[AI] Beralih dari ${provider}: ${error.message}`);
      }
    }
    if (!balasan) throw lastError || new Error("Semua provider teks gagal");

    if (settings.memoryTurns > 0) {
      userHistory.push({
        role: "user",
        content: image ? `[Pengguna mengirim gambar] ${pesan}` : pesan,
      });
      userHistory.push({ role: "assistant", content: balasan });
      const maxMessages = settings.memoryTurns * 2;
      if (userHistory.length > maxMessages) history[userId] = userHistory.slice(-maxMessages);
    } else {
      history[userId] = [];
    }

    return balasan;
  } catch (error) {
    console.error("[AI Error]", error.message);
    return options.image
      ? "Maaf, gambar belum berhasil dianalisis. Periksa key/model Vision di panel admin lalu coba kirim ulang."
      : "Ups, semua otak Abel sedang tidak tersedia. Periksa status API key di panel admin lalu coba lagi ya.";
  }
}

export function resetAI(userId) {
  delete history[userId];
  console.log(`[AI] Reset history: ${userId}`);
}

export function isNeedAI(text) {
  const value = String(text || "").toLowerCase().trim();
  if (value.length > 15 || value.includes("?")) return true;
  const keywords = [
    "apa", "siapa", "kapan", "dimana", "kenapa", "mengapa", "bagaimana",
    "gimana", "berapa", "tolong", "bantu", "jelaskan", "ceritakan", "buatkan",
    "carikan", "rekomendasi", "saran", "cara", "bisa", "boleh", "apakah",
    "bisakah", "contoh", "maksud",
  ];
  return keywords.some(keyword => value.startsWith(keyword) || value.includes(` ${keyword}`));
}
