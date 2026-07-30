// ============================================================
//  src/image.js - Generate Gambar via Pollinations AI
//  Gratis, tanpa API key, langsung kirim ke WhatsApp!
// ============================================================
import https from "https";
import http from "http";

/**
 * Generate gambar dari teks prompt
 * @param {string} prompt - Deskripsi gambar dalam bahasa apapun
 * @param {object} options - { width, height, model }
 * @returns {Buffer} - Buffer gambar PNG/JPEG
 */
export async function generateImage(prompt, options = {}) {
  const {
    width = 1024,
    height = 1024,
    model = "flux",         // flux = kualitas terbaik, turbo = lebih cepat
  } = options;

  // Translate prompt ke bahasa Inggris untuk hasil lebih baik
  const encodedPrompt = encodeURIComponent(prompt);
  const seed = Math.floor(Math.random() * 999999);

  const url = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${width}&height=${height}&model=${model}&seed=${seed}&nologo=true&enhance=true`;

  console.log(`[IMG] Generate: "${prompt.slice(0, 50)}..." (${model})`);

  return new Promise((resolve, reject) => {
    function doRequest(targetUrl, redirectCount = 0) {
      if (redirectCount > 5) return reject(new Error("Too many redirects"));

      const isHttps = targetUrl.startsWith("https");
      const lib = isHttps ? https : http;

      const req = lib.get(targetUrl, (res) => {
        // Handle redirect
        if (res.statusCode === 301 || res.statusCode === 302) {
          return doRequest(res.headers.location, redirectCount + 1);
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode}`));
        }

        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 1000) {
            return reject(new Error("Gambar terlalu kecil / gagal generate"));
          }
          console.log(`[IMG] ✅ Berhasil! Size: ${(buffer.length / 1024).toFixed(1)} KB`);
          resolve(buffer);
        });
      });

      req.on("error", reject);
      req.setTimeout(60000, () => {
        req.destroy();
        reject(new Error("Timeout - server lambat merespon"));
      });
    }

    doRequest(url);
  });
}

/**
 * Kirim gambar ke WhatsApp
 */
export async function kirimGambar(sock, to, prompt, caption = "") {
  try {
    await sock.sendPresenceUpdate("composing", to);

    // Kirim notif dulu
    await sock.sendMessage(to, {
      text: `🎨 Sedang membuat gambar...\n_"${prompt.slice(0, 60)}"_\n\n⏳ Tunggu sebentar ya!`
    });

    const imgBuffer = await generateImage(prompt);

    const finalCaption = caption ||
      `🎨 *Hasil Generate Gambar*\n\n📝 Prompt: _${prompt}_\n\n_Dibuat oleh Bot Abel • Powered by Pollinations AI_`;

    await sock.sendMessage(to, {
      image: imgBuffer,
      caption: finalCaption,
      mimetype: "image/jpeg",
    });

    console.log(`[IMG] ✅ Gambar terkirim ke ${to}`);
    return true;
  } catch (err) {
    console.error("[IMG Error]", err.message);
    await sock.sendMessage(to, {
      text: `❌ Gagal buat gambar: ${err.message}\n\nCoba lagi dengan deskripsi yang lebih detail ya!`
    });
    return false;
  }
}
