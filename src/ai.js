// ============================================================
//  src/ai.js - AI via Groq (GRATIS, cepat, 6000 req/hari)
//  Model: Llama 3.1 70B / Gemma 2 9B / Mixtral 8x7B
// ============================================================
import https from "https";
import dotenv from "dotenv";
dotenv.config();

const GROQ_KEY = process.env.GROQ_API_KEY || "";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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
function httpPost(hostname, path, headers, body) {
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
    req.setTimeout(20000, () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(bodyStr);
    req.end();
  });
}

// ── Groq API (primary - GRATIS) ──────────────────────────────
const GROQ_MODELS = [
  "llama-3.1-8b-instant",
  "llama3-70b-8192",
  "gemma2-9b-it",
  "mixtral-8x7b-32768",
];

async function callGroq(messages) {
  if (!GROQ_KEY) throw new Error("GROQ_API_KEY tidak diset");

  for (const model of GROQ_MODELS) {
    try {
      const { status, json } = await httpPost(
        "api.groq.com",
        "/openai/v1/chat/completions",
        { Authorization: `Bearer ${GROQ_KEY}` },
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
        console.log(`[AI] ✅ Groq/${model}`);
        return json.choices[0].message.content.trim();
      }
      throw new Error(json.error?.message || `HTTP ${status}`);
    } catch (e) {
      console.log(`[AI] ⚠️ Groq/${model}: ${e.message.slice(0, 60)}`);
    }
  }
  throw new Error("Groq gagal");
}

// ── Gemini API (fallback) ────────────────────────────────────
async function callGemini(messages) {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY tidak diset");

  const contents = messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const { status, json } = await httpPost(
    "generativelanguage.googleapis.com",
    `/v1beta/models/gemini-2.0-flash-lite-001:generateContent?key=${GEMINI_KEY}`,
    {},
    {
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents,
      generationConfig: { maxOutputTokens: 800, temperature: 0.85 },
    }
  );

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (status === 200 && text) {
    console.log("[AI] ✅ Gemini fallback");
    return text.trim();
  }
  throw new Error(json.error?.message || `HTTP ${status}`);
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

    // Coba Groq dulu, fallback ke Gemini
    let balasan;
    try {
      balasan = await callGroq(messages);
    } catch {
      console.log("[AI] Groq gagal, coba Gemini...");
      balasan = await callGemini(messages);
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
