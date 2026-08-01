// Generator gambar multi-provider. Urutan dan model dibaca langsung dari panel.
import https from "https";
import http from "http";
import dotenv from "dotenv";
import { getApiKeyCandidates } from "./api-key-store.js";
import { getAISettings } from "./ai-settings.js";
dotenv.config();

function requestJson(method, hostname, path, headers = {}, body, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const bodyString = body === undefined ? "" : JSON.stringify(body);
    const req = https.request({
      hostname,
      path,
      method,
      headers: {
        Accept: "application/json",
        ...(bodyString ? {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(bodyString),
        } : {}),
        ...headers,
      },
    }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode || 0, json: data ? JSON.parse(data) : {} });
        } catch {
          reject(new Error(`Respons gambar tidak valid (HTTP ${res.statusCode || 0})`));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Pembuatan gambar timeout")));
    if (bodyString) req.write(bodyString);
    req.end();
  });
}

function downloadBuffer(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) return reject(new Error("Terlalu banyak redirect gambar"));
    const client = url.startsWith("https:") ? https : http;
    const req = client.get(url, { headers: { "User-Agent": "Bot-Abel/2.0" } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        return resolve(downloadBuffer(nextUrl, redirectCount + 1));
      }
      if (res.statusCode !== 200) return reject(new Error(`Unduh gambar gagal (HTTP ${res.statusCode})`));
      const contentType = String(res.headers["content-type"] || "");
      if (!contentType.startsWith("image/")) return reject(new Error("Server tidak mengembalikan gambar"));
      const chunks = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => {
        const buffer = Buffer.concat(chunks);
        Object.defineProperty(buffer, "downloadMimeType", { value: contentType.split(";")[0] });
        resolve(buffer);
      });
    });
    req.on("error", reject);
    req.setTimeout(120000, () => req.destroy(new Error("Unduh gambar timeout")));
  });
}

function detectMimeType(buffer) {
  if (buffer.downloadMimeType) return buffer.downloadMimeType;
  if (buffer[0] === 0x89 && buffer.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "image/jpeg";
}

function markImage(buffer, provider, mimeType = "") {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1000) throw new Error(`${provider} tidak mengembalikan gambar valid`);
  Object.defineProperty(buffer, "aiProvider", { value: provider });
  Object.defineProperty(buffer, "mimeType", { value: mimeType || detectMimeType(buffer) });
  return buffer;
}

function apiError(provider, status, json) {
  const message = String(json?.error?.message || json?.message || `HTTP ${status}`)
    .replace(/\b(?:sk|xai)-[A-Za-z0-9_.*-]+/gi, "[API_KEY]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[API_KEY]");
  return new Error(`${provider}: ${String(message).slice(0, 240)}`);
}

async function withCandidates(provider, operation) {
  const candidates = getApiKeyCandidates(provider);
  if (!candidates.length) throw new Error(`${provider}: belum ada API key aktif`);
  let lastError;
  for (const [index, candidate] of candidates.entries()) {
    try {
      return await operation(candidate.key, index);
    } catch (error) {
      lastError = error;
      console.warn(`[IMG] ${provider} slot ${index + 1} gagal: ${error.message}`);
    }
  }
  throw lastError || new Error(`${provider}: semua slot gagal`);
}

async function generateGeminiImage(prompt, settings) {
  const model = settings.imageModels.gemini;
  return withCandidates("gemini", async (key, index) => {
    const { status, json } = await requestJson(
      "POST",
      "generativelanguage.googleapis.com",
      `/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,
      {},
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
      }
    );
    if (status < 200 || status >= 300) throw apiError("Gemini", status, json);
    const imagePart = (json.candidates?.[0]?.content?.parts || []).find(
      part => part.inlineData?.data || part.inline_data?.data
    );
    const inline = imagePart?.inlineData || imagePart?.inline_data;
    if (!inline?.data) throw new Error("Gemini tidak mengembalikan data gambar");
    console.log(`[IMG] Gemini/${model} slot ${index + 1}`);
    return markImage(Buffer.from(inline.data, "base64"), `Gemini Nano Banana (${model})`, inline.mimeType || inline.mime_type);
  });
}

async function generateOpenAIImage(prompt, settings, options) {
  const model = settings.imageModels.openai;
  return withCandidates("openai", async (key, index) => {
    const { status, json } = await requestJson(
      "POST",
      "api.openai.com",
      "/v1/images/generations",
      { Authorization: `Bearer ${key}` },
      {
        model,
        prompt,
        size: options.size || "1024x1024",
        quality: options.quality || "medium",
        output_format: "jpeg",
        n: 1,
      }
    );
    if (status < 200 || status >= 300) throw apiError("OpenAI", status, json);
    const result = json.data?.[0];
    const buffer = result?.b64_json
      ? Buffer.from(result.b64_json, "base64")
      : result?.url ? await downloadBuffer(result.url) : null;
    console.log(`[IMG] OpenAI/${model} slot ${index + 1}`);
    return markImage(buffer, `OpenAI (${model})`);
  });
}

async function generateXAIImage(prompt, settings) {
  const model = settings.imageModels.xai;
  return withCandidates("xai", async (key, index) => {
    const { status, json } = await requestJson(
      "POST",
      "api.x.ai",
      "/v1/images/generations",
      { Authorization: `Bearer ${key}` },
      { model, prompt, response_format: "url", n: 1 }
    );
    if (status < 200 || status >= 300) throw apiError("xAI", status, json);
    const result = json.data?.[0];
    const buffer = result?.b64_json
      ? Buffer.from(result.b64_json, "base64")
      : result?.url ? await downloadBuffer(result.url) : null;
    console.log(`[IMG] xAI/${model} slot ${index + 1}`);
    return markImage(buffer, `xAI (${model})`);
  });
}

async function generateSeaDreamImage(prompt, settings, options) {
  const model = settings.imageModels.seadream;
  return withCandidates("seadream", async (key, index) => {
    const { status, json } = await requestJson(
      "POST",
      "ark.ap-southeast.bytepluses.com",
      "/api/v3/images/generations",
      { Authorization: `Bearer ${key}` },
      {
        model,
        prompt,
        size: options.size || "1024x1024",
        response_format: "url",
        watermark: false,
      }
    );
    if (status < 200 || status >= 300) throw apiError("SeaDream", status, json);
    const result = json.data?.[0];
    const buffer = result?.b64_json
      ? Buffer.from(result.b64_json, "base64")
      : result?.url ? await downloadBuffer(result.url) : null;
    console.log(`[IMG] SeaDream/${model} slot ${index + 1}`);
    return markImage(buffer, `SeaDream (${model})`);
  });
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function generateLeonardoImage(prompt, settings, options) {
  const modelId = settings.imageModels.leonardo;
  return withCandidates("leonardo", async (key, index) => {
    const [width, height] = String(options.size || "1024x1024").split("x").map(Number);
    const created = await requestJson(
      "POST",
      "cloud.leonardo.ai",
      "/api/rest/v1/generations",
      { Authorization: `Bearer ${key}` },
      {
        prompt,
        modelId,
        num_images: 1,
        width: width || 1024,
        height: height || 1024,
        public: false,
      }
    );
    if (created.status < 200 || created.status >= 300) throw apiError("Leonardo", created.status, created.json);
    const generationId = created.json.sdGenerationJob?.generationId || created.json.generationId;
    if (!generationId) throw new Error("Leonardo tidak mengembalikan generation ID");

    for (let attempt = 0; attempt < 45; attempt += 1) {
      await delay(2000);
      const result = await requestJson(
        "GET",
        "cloud.leonardo.ai",
        `/api/rest/v1/generations/${encodeURIComponent(generationId)}`,
        { Authorization: `Bearer ${key}` },
        undefined,
        30000
      );
      if (result.status < 200 || result.status >= 300) throw apiError("Leonardo", result.status, result.json);
      const generation = result.json.generations_by_pk || result.json.generation || {};
      const imageUrl = generation.generated_images?.[0]?.url;
      if (imageUrl) {
        console.log(`[IMG] Leonardo/${modelId} slot ${index + 1}`);
        return markImage(await downloadBuffer(imageUrl), `Leonardo (${modelId})`);
      }
      if (["FAILED", "ERROR"].includes(String(generation.status || "").toUpperCase())) {
        throw new Error(`Leonardo generation ${generation.status}`);
      }
    }
    throw new Error("Leonardo generation timeout");
  });
}

async function generatePollinationsImage(prompt, options) {
  const [width, height] = String(options.size || "1024x1024").split("x").map(Number);
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}` +
    `?width=${width || 1024}&height=${height || 1024}&model=flux&seed=${Math.floor(Math.random() * 999999)}&nologo=true&enhance=true`;
  return markImage(await downloadBuffer(url), "Pollinations (cadangan gratis)");
}

async function generateWithProvider(provider, prompt, settings, options) {
  switch (provider) {
    case "gemini": return generateGeminiImage(prompt, settings, options);
    case "openai": return generateOpenAIImage(prompt, settings, options);
    case "xai": return generateXAIImage(prompt, settings, options);
    case "seadream": return generateSeaDreamImage(prompt, settings, options);
    case "leonardo": return generateLeonardoImage(prompt, settings, options);
    case "pollinations": return generatePollinationsImage(prompt, options);
    default: throw new Error(`Provider gambar ${provider} tidak dikenal`);
  }
}

export async function generateImage(prompt, options = {}) {
  const settings = getAISettings();
  let lastError;
  for (const provider of settings.imageOrder) {
    try {
      console.log(`[IMG] Mencoba ${provider}: "${prompt.slice(0, 60)}"`);
      return await generateWithProvider(provider, prompt, settings, options);
    } catch (error) {
      lastError = error;
      console.warn(`[IMG] Beralih dari ${provider}: ${error.message}`);
    }
  }
  throw lastError || new Error("Semua provider gambar gagal");
}

export async function kirimGambar(sock, to, prompt, caption = "") {
  try {
    await sock.sendPresenceUpdate("composing", to);
    await sock.sendMessage(to, {
      text: `🎨 Sedang membuat gambar dengan mesin gambar aktif...\n_"${prompt.slice(0, 60)}"_\n\n⏳ Mohon tunggu sebentar.`,
    });
    const imageBuffer = await generateImage(prompt);
    const identity = `🎨 *Hasil Generate Gambar*\n\n📝 Prompt: _${prompt}_\n\n_Dibuat oleh ABEL-LAB • ${imageBuffer.aiProvider}_`;
    await sock.sendMessage(to, {
      image: imageBuffer,
      caption: caption ? `${caption}\n\n${identity}` : identity,
      mimetype: imageBuffer.mimeType || "image/jpeg",
    });
    console.log(`[IMG] Gambar terkirim ke ${to}`);
    return true;
  } catch (error) {
    console.error("[IMG Error]", error.message);
    await sock.sendMessage(to, {
      text: `❌ Gambar belum berhasil dibuat.\n${error.message}\n\nPeriksa tombol Tes Koneksi di panel admin atau coba lagi.`,
    });
    return false;
  }
}
