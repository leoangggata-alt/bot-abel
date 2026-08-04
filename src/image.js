// ============================================================
//  src/image.js - Pembuatan Gambar AI
//  Priority:
//    1. Vercel AI Gateway (jika VERCEL_AI_KEY diisi)
//    2. Pollinations AI  (gratis, tanpa API key)
// ============================================================
import https from "https";
import http  from "http";
import fs    from "fs";
import path  from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Konfigurasi ───────────────────────────────────────────────
const VERCEL_AI_KEY  = process.env.VERCEL_AI_KEY  || "";
const VERCEL_AI_URL  = process.env.VERCEL_AI_URL  || "https://api.v0.dev/v1";
const VERCEL_AI_MODEL = process.env.VERCEL_AI_MODEL || "black-forest-labs/flux-1-schnell";

// ── Helper: fetch buffer dari URL ────────────────────────────
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { timeout: 30000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchBuffer(res.headers.location).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end",  () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── Vercel AI Gateway: Generate Image ────────────────────────
async function generateVercelAI(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: VERCEL_AI_MODEL,
      prompt,
      n: 1,
      size: "1024x1024",
    });

    const urlObj = new URL(`${VERCEL_AI_URL}/images/generations`);
    const options = {
      hostname: urlObj.hostname,
      path    : urlObj.pathname,
      method  : "POST",
      headers : {
        "Content-Type" : "application/json",
        "Authorization": `Bearer ${VERCEL_AI_KEY}`,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 60000,
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", async () => {
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || "Vercel AI error"));

          const imgData = json.data?.[0];
          if (!imgData) return reject(new Error("Tidak ada output gambar"));

          // Bisa berupa URL atau base64
          if (imgData.url) {
            const buf = await fetchBuffer(imgData.url);
            resolve(buf);
          } else if (imgData.b64_json) {
            resolve(Buffer.from(imgData.b64_json, "base64"));
          } else {
            reject(new Error("Format respons tidak dikenali"));
          }
        } catch (e) { reject(e); }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.write(body);
    req.end();
  });
}

// ── Pollinations AI: Generate Image (Free fallback) ──────────
async function generatePollinations(prompt, model = "flux") {
  const encoded = encodeURIComponent(prompt);
  const seed    = Math.floor(Math.random() * 99999);
  const url     = `https://image.pollinations.ai/prompt/${encoded}?model=${model}&seed=${seed}&width=1024&height=1024&nologo=true`;
  return fetchBuffer(url);
}

// ── Main: kirimGambar ────────────────────────────────────────
export async function kirimGambar(sock, to, prompt, mentions = []) {
  if (!prompt || prompt.trim().length < 2) {
    return await sock.sendMessage(to, {
      text:
        `🎨 *Generate Gambar AI*\n\n` +
        `Cara pakai:\n` +
        `*!gambar [deskripsi]*\n\n` +
        `Contoh:\n` +
        `├ !gambar wanita cantik di pantai\n` +
        `├ !gambar mobil sport futuristik\n` +
        `└ !gambar nasi goreng lezat\n\n` +
        `🔥 *Model tersedia:*\n` +
        `├ !gambar [prompt]         → default (flux)\n` +
        `├ !gambar hd [prompt]      → kualitas HD\n` +
        `└ !gambar anime [prompt]   → gaya anime`,
      mentions
    });
  }

  // Deteksi model dari prefix prompt
  let model  = "flux";
  let finalPrompt = prompt;

  if (prompt.toLowerCase().startsWith("hd ")) {
    model = "flux-pro";
    finalPrompt = prompt.slice(3).trim();
  } else if (prompt.toLowerCase().startsWith("anime ")) {
    model = "flux-anime";
    finalPrompt = prompt.slice(6).trim();
  }

  // Notif "sedang generate"
  await sock.sendMessage(to, {
    text: `🎨 *Generating gambar...*\n\n📝 Prompt: _${finalPrompt}_\n⏳ Mohon tunggu sebentar...`,
    mentions
  });

  try {
    let imgBuffer;
    let source;

    if (VERCEL_AI_KEY) {
      // ── Gunakan Vercel AI Gateway ─────────────────────────
      console.log(`[IMG] Vercel AI | Model: ${VERCEL_AI_MODEL} | Prompt: "${finalPrompt.slice(0,40)}..."`);
      try {
        imgBuffer = await generateVercelAI(finalPrompt);
        source = `Vercel AI (${VERCEL_AI_MODEL})`;
      } catch (vercelErr) {
        console.warn(`[IMG] Vercel AI gagal: ${vercelErr.message} — fallback ke Pollinations`);
        imgBuffer = await generatePollinations(finalPrompt, model);
        source = `Pollinations (${model})`;
      }
    } else {
      // ── Fallback: Pollinations (gratis) ──────────────────
      console.log(`[IMG] Pollinations | Model: ${model} | Prompt: "${finalPrompt.slice(0,40)}..."`);
      imgBuffer = await generatePollinations(finalPrompt, model);
      source = `Pollinations (${model})`;
    }

    const sizeKB = (imgBuffer.length / 1024).toFixed(1);
    console.log(`[IMG] ✅ Berhasil! Size: ${sizeKB} KB | Source: ${source}`);

    await sock.sendMessage(to, {
      image  : imgBuffer,
      caption:
        `✅ *Gambar berhasil dibuat!*\n\n` +
        `📝 Prompt : _${finalPrompt}_\n` +
        `🤖 Model  : ${source}\n` +
        `📦 Size   : ${sizeKB} KB`,
      mentions
    });

    console.log(`[IMG] ✅ Gambar terkirim ke ${to}`);

  } catch (err) {
    console.error("[IMG] ❌ Gagal:", err.message);
    await sock.sendMessage(to, {
      text:
        `❌ *Gagal generate gambar*\n\n` +
        `Error: _${err.message}_\n\n` +
        `Coba lagi dengan deskripsi yang berbeda ya! 🙏`,
      mentions
    });
  }
}
