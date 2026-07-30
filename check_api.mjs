// check_api.mjs - Cek API key Gemini
import https from "https";
import dotenv from "dotenv";
dotenv.config();

const key = process.env.GEMINI_API_KEY;
console.log("🔑 API Key:", key?.slice(0, 10) + "...");
console.log("📏 Panjang key:", key?.length, "karakter");
console.log("🔍 Format valid (AIza...):", key?.startsWith("AIza") ? "✅ YA" : "❌ TIDAK - Format salah!");
console.log("");

// Test ke API Gemini
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}&pageSize=5`;

const req = https.get(url, (res) => {
  let data = "";
  res.on("data", (chunk) => (data += chunk));
  res.on("end", () => {
    console.log("📡 HTTP Status:", res.statusCode);
    const json = JSON.parse(data);

    if (res.statusCode === 200) {
      console.log("✅ API Key VALID!");
      console.log("📋 Model tersedia:");
      json.models?.forEach((m) => console.log("  -", m.name));
    } else {
      console.log("❌ API Key ERROR!");
      console.log("💬 Pesan error:", json.error?.message || data.slice(0, 200));
      console.log("");
      console.log("💡 SOLUSI: Dapatkan API Key baru di:");
      console.log("   https://aistudio.google.com/app/apikey");
      console.log("   API Key yang benar dimulai dengan: AIzaSy...");
    }
  });
});

req.on("error", (e) => console.error("Network error:", e.message));
