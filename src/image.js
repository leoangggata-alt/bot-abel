// ============================================================
//  src/image.js - Generate gambar melalui OpenAI GPT Image 2
// ============================================================
import https from "https";
import http from "http";
import dotenv from "dotenv";
import { getApiKeyCandidates } from "./api-key-store.js";
dotenv.config();

const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";

function postJson(hostname, path, headers, body, timeoutMs = 120000) {
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
    }, (res) => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, json: JSON.parse(data) });
        } catch {
          reject(new Error(`Respons gambar tidak valid (HTTP ${res.statusCode})`));
        }
      });
    });

    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error("Pembuatan gambar timeout"));
    });
    req.write(bodyString);
    req.end();
  });
}

function downloadBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Terlalu banyak redirect saat mengambil gambar"));
      return;
    }

    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, {
      headers: { "User-Agent": "Bot-Abel/1.0" },
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        resolve(downloadBuffer(res.headers.location, redirectCount + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Gagal mengunduh gambar (HTTP ${res.statusCode})`));
        return;
      }

      const contentType = res.headers["content-type"] || "";
      if (!contentType.startsWith("image/")) {
        reject(new Error(`Server tidak mengembalikan gambar (${contentType || "unknown"})`));
        return;
      }

      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", reject);
    req.setTimeout(120000, () => {
      req.destroy();
      reject(new Error("Unduh gambar timeout"));
    });
  });
}

function tandaiProvider(buffer, provider) {
  Object.defineProperty(buffer, "aiProvider", {
    value: provider,
    enumerable: false,
  });
  return buffer;
}

/**
 * Membuat gambar dari prompt menggunakan GPT Image 2.
 * @returns {Promise<Buffer>} Buffer JPEG
 */
async function generateOpenAIImage(prompt, options = {}) {
  const {
    size = "1024x1024",
    quality = "medium",
  } = options;

  const candidates = getApiKeyCandidates("openai");
  if (candidates.length === 0) {
    const error = new Error("OPENAI_API_KEY belum diset");
    error.pakaiCadangan = true;
    throw error;
  }

  console.log(`[IMG] Generate OpenAI/${IMAGE_MODEL}: "${prompt.slice(0, 60)}..."`);

  let lastError;
  for (const [index, candidate] of candidates.entries()) {
    let response;
    try {
      response = await postJson(
        "api.openai.com",
        "/v1/images/generations",
        { Authorization: `Bearer ${candidate.key}` },
        {
          model: IMAGE_MODEL,
          prompt,
          size,
          quality,
          output_format: "jpeg",
          n: 1,
        }
      );
    } catch (error) {
      lastError = error;
      console.warn(`[IMG] GPT Image slot ${index + 1} gangguan jaringan`);
      continue;
    }

    const { status, json } = response;
    if (status !== 200) {
      const code = json.error?.code || "";
      const message = json.error?.message || "";
      lastError = new Error(message || `OpenAI HTTP ${status}`);

      const bisaCobaSlotBerikut =
        status === 401 ||
        status === 403 ||
        status === 408 ||
        status === 429 ||
        status >= 500 ||
        /billing|credit|quota|hard limit|api key/i.test(message) ||
        ["rate_limit_exceeded", "insufficient_quota", "credit_balance_exhausted"].includes(code);

      if (bisaCobaSlotBerikut) {
        console.warn(`[IMG] GPT Image slot ${index + 1} limit/tidak valid`);
        continue;
      }
      throw lastError;
    }

    const hasil = json.data?.[0];
    let buffer;
    if (hasil?.b64_json) {
      buffer = Buffer.from(hasil.b64_json, "base64");
    } else if (hasil?.url) {
      buffer = await downloadBuffer(hasil.url);
    }

    if (!buffer || buffer.length < 1000) {
      lastError = new Error("OpenAI tidak mengembalikan gambar yang valid");
      continue;
    }

    console.log(
      `[IMG] ✅ GPT Image 2 slot ${index + 1} berhasil ` +
      `(${(buffer.length / 1024).toFixed(1)} KB)`
    );
    return tandaiProvider(buffer, "GPT Image 2");
  }

  const error = lastError || new Error("Semua key GPT Image gagal");
  error.pakaiCadangan = true;
  throw error;
}

async function generateFreeImage(prompt, options = {}) {
  const size = options.size || "1024x1024";
  const [width, height] = size.split("x").map(Number);
  const seed = Math.floor(Math.random() * 999999);
  const encodedPrompt = encodeURIComponent(prompt);
  const url =
    `https://image.pollinations.ai/prompt/${encodedPrompt}` +
    `?width=${width || 1024}&height=${height || 1024}` +
    `&model=flux&seed=${seed}&nologo=true&enhance=true`;

  console.log(`[IMG] Generate cadangan gratis: "${prompt.slice(0, 60)}..."`);
  const buffer = await downloadBuffer(url);
  if (buffer.length < 1000) throw new Error("Generator cadangan menghasilkan gambar tidak valid");

  console.log(`[IMG] ✅ Generator cadangan berhasil (${(buffer.length / 1024).toFixed(1)} KB)`);
  return tandaiProvider(buffer, "AI Image cadangan");
}

export async function generateImage(prompt, options = {}) {
  try {
    return await generateOpenAIImage(prompt, options);
  } catch (error) {
    if (!error.pakaiCadangan) throw error;

    console.warn(`[IMG] ${error.message}; beralih ke generator gambar cadangan...`);
    return generateFreeImage(prompt, options);
  }
}

export async function kirimGambar(sock, to, prompt, caption = "") {
  try {
    await sock.sendPresenceUpdate("composing", to);
    await sock.sendMessage(to, {
      text:
        `🎨 Sedang membuat gambar dengan *GPT Image 2*...\n` +
        `_"${prompt.slice(0, 60)}"_\n\n⏳ Mohon tunggu sebentar.`,
    });

    const imgBuffer = await generateImage(prompt);
    const provider = imgBuffer.aiProvider || "GPT Image 2";
    const identitas =
      `🎨 *Hasil Generate Gambar*\n\n` +
      `📝 Prompt: _${prompt}_\n\n` +
      `_Dibuat oleh Bot Abel • Powered by ${provider}_`;
    const finalCaption = caption ? `${caption}\n\n${identitas}` : identitas;

    await sock.sendMessage(to, {
      image: imgBuffer,
      caption: finalCaption,
      mimetype: "image/jpeg",
    });

    console.log(`[IMG] ✅ Gambar terkirim ke ${to}`);
    return true;
  } catch (error) {
    console.error("[IMG Error]", error.message);
    await sock.sendMessage(to, {
      text:
        `❌ Gambar belum berhasil dibuat.\n` +
        `${error.message}\n\n` +
        `Coba lagi beberapa saat atau gunakan deskripsi yang lebih singkat.`,
    });
    return false;
  }
}
