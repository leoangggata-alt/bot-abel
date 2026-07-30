// ============================================================
//  src/ai.js - OpenAI sebagai otak utama, Groq sebagai cadangan
// ============================================================
import https from "https";
import crypto from "crypto";
import dotenv from "dotenv";
import { getApiKeyCandidates } from "./api-key-store.js";
dotenv.config();

const OPENAI_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5.6-sol";

// Memori percakapan per user
const history = {};

// ── System Prompt Abel ───────────────────────────────────────
const SYSTEM_PROMPT = `Kamu adalah Abel, asisten AI cerdas seperti ChatGPT yang berjalan di WhatsApp! 💖

## IDENTITAS
- Nama: Abel
- Karakter: Ceria, cerdas, kreatif, dan selalu siap membantu
- Bahasa: Indonesia (santai tapi sopan)
- Owner: ${process.env.OWNER_NAME || "Admin"}

## KEMAMPUAN UTAMA

### 💬 Menjawab Pertanyaan
- Sains, teknologi, matematika, sejarah, agama, budaya
- Penjelasan konsep rumit dengan bahasa sederhana
- Fakta dan informasi akurat

### ✍️ Membuat Konten
- Prompt untuk AI image generation (Midjourney, DALL-E, Stable Diffusion)
- Caption Instagram, TikTok, Twitter
- Artikel, essay, laporan
- Cerita pendek, puisi, lirik lagu
- Email profesional, surat resmi
- Bio profil, deskripsi produk

### 🛠️ Membuat Prompt AI
Jika diminta buat prompt, format seperti ini:
"Prompt: [deskripsi detail dalam bahasa Inggris untuk AI image]
Style: [realistic/anime/digital art/dll]
Quality: high quality, 4K, detailed"

### 💡 Membantu Kebutuhan Sehari-hari
- Resep masakan
- Tips kesehatan dan kebugaran
- Rekomendasi produk/tempat
- Solusi masalah teknis
- Ide kreatif dan brainstorming
- Terjemahan bahasa
- Koreksi teks/grammar

### 💼 Bisnis & Produktivitas
- Strategi marketing dan iklan
- Analisis bisnis
- Template presentasi
- Rencana kerja dan to-do list

## CARA BERBICARA
- Gunakan Bahasa Indonesia yang natural dan hangat
- Pakai emoji yang sesuai konteks 😊✨
- Jawaban ringkas tapi lengkap (3-5 paragraf max)
- Gunakan format dengan poin/bullet jika membantu
- Jika dipuji, sambut dengan humble 🥰
- Jika ada yang kasar, tetap sopan tapi tegas

## ATURAN
- SELALU jawab pertanyaan dengan helpful
- JANGAN tolak pertanyaan umum/kreatif
- Untuk konten berbahaya/ilegal → tolak sopan
- Ingat konteks percakapan sebelumnya
- Jika tidak yakin, berikan jawaban terbaik + disclaimer kecil`;


// ── HTTP Request Helper ──────────────────────────────────────
function httpPost(hostname, path, headers, body, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(bodyStr),
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, json });
        } catch {
          reject(new Error("Parse error: " + data.slice(0, 100)));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Timeout"));
    });
    req.write(bodyStr);
    req.end();
  });
}

// ── OpenAI Responses API (otak utama) ───────────────────────
function ambilTeksOpenAI(json) {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }

  const teks = (json.output || [])
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text" && item.text)
    .map(item => item.text)
    .join("\n")
    .trim();

  return teks || "";
}

function bolehPakaiCadangan(status, code = "") {
  return status === 408 ||
    status === 409 ||
    status === 429 ||
    status >= 500 ||
    [
      "rate_limit_exceeded",
      "insufficient_quota",
      "credit_balance_exhausted",
    ].includes(code);
}

function errorKeyAtauLimit(status, code = "", message = "") {
  return bolehPakaiCadangan(status, code) ||
    status === 401 ||
    status === 403 ||
    /billing|credit|quota|hard limit|api key/i.test(message);
}

async function callOpenAI(messages, userId) {
  const candidates = getApiKeyCandidates("openai");
  if (candidates.length === 0) {
    const error = new Error("OPENAI_API_KEY tidak diset");
    error.pakaiCadangan = true;
    throw error;
  }

  let lastError;
  for (const [index, candidate] of candidates.entries()) {
    let response;
    try {
      response = await httpPost(
        "api.openai.com",
        "/v1/responses",
        { Authorization: `Bearer ${candidate.key}` },
        {
          model: OPENAI_MODEL,
          instructions: SYSTEM_PROMPT,
          input: messages,
          max_output_tokens: 800,
          reasoning: { effort: "low" },
          text: { verbosity: "low" },
          store: false,
          safety_identifier: crypto
            .createHash("sha256")
            .update(String(userId))
            .digest("hex"),
        },
        45000
      );
    } catch (error) {
      lastError = error;
      console.warn(`[AI] OpenAI slot ${index + 1} gangguan jaringan`);
      continue;
    }

    const { status, json } = response;
    const teks = ambilTeksOpenAI(json);
    if (status === 200 && teks) {
      console.log(`[AI] ✅ OpenAI/${OPENAI_MODEL} (slot ${index + 1})`);
      return teks;
    }

    const message = json.error?.message || `HTTP ${status}`;
    const error = new Error(message);
    error.status = status;
    error.code = json.error?.code || "";
    lastError = error;

    if (!errorKeyAtauLimit(status, error.code, message)) throw error;
    console.warn(`[AI] OpenAI slot ${index + 1} limit/tidak valid, mencoba slot berikutnya...`);
  }

  lastError ||= new Error("Semua key OpenAI gagal");
  lastError.pakaiCadangan = true;
  throw lastError;
}

// ── Groq API (otak kedua / cadangan) ────────────────────────
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
];

async function callGroq(messages) {
  const candidates = getApiKeyCandidates("groq");
  if (candidates.length === 0) throw new Error("GROQ_API_KEY tidak diset");

  for (const [keyIndex, candidate] of candidates.entries()) {
    for (const model of GROQ_MODELS) {
      try {
        const { status, json } = await httpPost(
          "api.groq.com",
          "/openai/v1/chat/completions",
          { Authorization: `Bearer ${candidate.key}` },
          {
            model,
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...messages,
            ],
            max_tokens: 800,
            temperature: 0.85,
          }
        );

        if (status === 200 && json.choices?.[0]?.message?.content) {
          console.log(`[AI] ✅ Groq/${model} (slot ${keyIndex + 1})`);
          return json.choices[0].message.content.trim();
        }

        const message = json.error?.message || `HTTP ${status}`;
        console.log(`[AI] ⚠️ Groq/${model}: ${message.slice(0, 60)}`);
        if (errorKeyAtauLimit(status, json.error?.code, message)) break;
      } catch (error) {
        console.log(`[AI] ⚠️ Groq/${model}: ${error.message.slice(0, 60)}`);
        break;
      }
    }
  }
  throw new Error("Groq gagal");
}

// ── Gemini API (cadangan terakhir bila key tersedia) ─────────
async function callGemini(messages) {
  const candidates = getApiKeyCandidates("gemini");
  if (candidates.length === 0) throw new Error("GEMINI_API_KEY tidak diset");

  const contents = messages.map(message => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: message.content }],
  }));

  for (const [index, candidate] of candidates.entries()) {
    try {
      const { status, json } = await httpPost(
        "generativelanguage.googleapis.com",
        `/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${encodeURIComponent(candidate.key)}`,
        {},
        {
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { maxOutputTokens: 800, temperature: 0.85 },
        }
      );

      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (status === 200 && text) {
        console.log(`[AI] ✅ Gemini (slot ${index + 1})`);
        return text.trim();
      }
      console.warn(`[AI] Gemini slot ${index + 1} gagal (HTTP ${status})`);
    } catch (error) {
      console.warn(`[AI] Gemini slot ${index + 1}: ${error.message.slice(0, 60)}`);
    }
  }
  throw new Error("Gemini gagal");
}

// ── Chat dengan memori percakapan ────────────────────────────
export async function chatAI(userId, pesan) {
  try {
    if (!history[userId]) history[userId] = [];
    const userHistory = history[userId];

    const messages = [
      ...userHistory,
      { role: "user", content: pesan },
    ];

    // Selalu pakai OpenAI terlebih dahulu. Groq hanya untuk kuota/gangguan.
    let balasan;
    try {
      balasan = await callOpenAI(messages, userId);
    } catch (error) {
      if (!error.pakaiCadangan) throw error;

      console.warn(
        `[AI] OpenAI tidak tersedia (${error.code || error.status || error.message}), ` +
        "beralih ke Groq..."
      );
      try {
        balasan = await callGroq(messages);
      } catch {
        console.warn("[AI] Semua key Groq gagal, mencoba Gemini...");
        balasan = await callGemini(messages);
      }
    }

    // Simpan ke history
    userHistory.push({ role: "user", content: pesan });
    userHistory.push({ role: "assistant", content: balasan });

    // Batasi 20 pesan terakhir
    if (userHistory.length > 20) {
      history[userId] = userHistory.slice(-20);
    }

    return balasan;
  } catch (err) {
    console.error("[AI Error]", err.message);
    return "Ups, Abel lagi ada gangguan sebentar 🔧 Coba kirim lagi ya! Kalau masih error ketik *!reset* 😊";
  }
}

// ── Reset histori ────────────────────────────────────────────
export function resetAI(userId) {
  delete history[userId];
  console.log(`[AI] Reset history: ${userId}`);
}

// ── Cek apakah pesan perlu AI ────────────────────────────────
export function isNeedAI(text) {
  const t = text.toLowerCase().trim();
  if (t.length > 15) return true;
  if (t.includes("?")) return true;

  const keywords = [
    "apa", "siapa", "kapan", "dimana", "kenapa", "mengapa",
    "bagaimana", "gimana", "berapa", "tolong", "bantu", "jelaskan",
    "ceritakan", "buatkan", "carikan", "rekomendasi", "saran",
    "cara", "bisa", "boleh", "apakah", "bisakah", "contoh", "maksud"
  ];
  return keywords.some(k => t.startsWith(k) || t.includes(` ${k}`));
}
