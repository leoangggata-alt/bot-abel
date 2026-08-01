import https from "https";
import { API_PROVIDERS, getApiKeyCandidates } from "./api-key-store.js";

function requestJson(hostname, path, headers = {}, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: "GET", headers }, res => {
      let data = "";
      res.on("data", chunk => (data += chunk));
      res.on("end", () => {
        let json = {};
        try { json = data ? JSON.parse(data) : {}; } catch { /* status tetap berguna */ }
        resolve({ status: res.statusCode || 0, json });
      });
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("Koneksi timeout")));
    req.end();
  });
}

async function testCandidate(provider, key) {
  switch (provider) {
    case "openai":
      return requestJson("api.openai.com", "/v1/models", { Authorization: `Bearer ${key}` });
    case "groq":
      return requestJson("api.groq.com", "/openai/v1/models", { Authorization: `Bearer ${key}` });
    case "xai":
      return requestJson("api.x.ai", "/v1/models", { Authorization: `Bearer ${key}` });
    case "gemini":
      return requestJson(
        "generativelanguage.googleapis.com",
        `/v1beta/models?key=${encodeURIComponent(key)}`
      );
    case "seadream":
      return requestJson(
        "ark.ap-southeast.bytepluses.com",
        "/api/v3/models",
        { Authorization: `Bearer ${key}` }
      );
    case "leonardo":
      return requestJson(
        "cloud.leonardo.ai",
        "/api/rest/v1/me",
        { Authorization: `Bearer ${key}`, Accept: "application/json" }
      );
    default:
      throw new Error("Provider tidak dikenal");
  }
}

function safeMessage(status, json) {
  if (status >= 200 && status < 300) return "Terhubung";
  const raw = json?.error?.message || json?.error || json?.message || `HTTP ${status}`;
  return String(raw)
    .replace(/\b(?:sk|xai)-[A-Za-z0-9_.*-]+/gi, "[API_KEY]")
    .replace(/\bAIza[A-Za-z0-9_-]+/g, "[API_KEY]")
    .slice(0, 180);
}

export async function testProvider(provider) {
  if (!API_PROVIDERS[provider]) {
    const error = new Error("Provider API tidak dikenal");
    error.status = 404;
    throw error;
  }

  const candidates = getApiKeyCandidates(provider);
  if (candidates.length === 0) {
    return { provider, ok: false, message: "Belum ada API key aktif", slots: [] };
  }

  const slots = [];
  for (const candidate of candidates) {
    try {
      const { status, json } = await testCandidate(provider, candidate.key);
      slots.push({
        id: candidate.id,
        label: candidate.label,
        ok: status >= 200 && status < 300,
        status,
        message: safeMessage(status, json),
      });
    } catch (error) {
      slots.push({
        id: candidate.id,
        label: candidate.label,
        ok: false,
        status: 0,
        message: String(error.message || "Koneksi gagal").slice(0, 180),
      });
    }
  }

  const ok = slots.some(slot => slot.ok);
  return {
    provider,
    ok,
    message: ok ? "Sedikitnya satu slot terhubung" : "Semua slot aktif gagal",
    slots,
  };
}
