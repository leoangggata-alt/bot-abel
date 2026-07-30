// ============================================================
//  Penyimpanan pool API key terenkripsi untuk bot dan panel admin
// ============================================================
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const STORE_FILE = path.join(ROOT_DIR, "data", "api-keys.json");
const SECRET_FILE = path.join(ROOT_DIR, "data", ".api-key-secret");
const MAX_KEYS = 10;

export const API_PROVIDERS = Object.freeze({
  openai: {
    name: "GPT / OpenAI",
    icon: "🧠",
    envName: "OPENAI_API_KEY",
    color: "#10a37f",
    usage: "Chat GPT dan GPT Image",
  },
  groq: {
    name: "Groq",
    icon: "⚡",
    envName: "GROQ_API_KEY",
    color: "#f97316",
    usage: "Otak chat cadangan cepat",
  },
  xai: {
    name: "xAI / Grok",
    icon: "𝕏",
    envName: "XAI_API_KEY",
    color: "#f8fafc",
    usage: "Otak chat Grok dari xAI",
  },
  gemini: {
    name: "Google Gemini",
    icon: "💠",
    envName: "GEMINI_API_KEY",
    color: "#4285f4",
    usage: "Otak chat Google",
  },
  seadream: {
    name: "SeaDream",
    icon: "🌊",
    envName: "SEADREAM_API_KEY",
    color: "#06b6d4",
    usage: "Generator gambar SeaDream",
  },
  leonardo: {
    name: "Leonardo AI",
    icon: "🎨",
    envName: "LEONARDO_API_KEY",
    color: "#a855f7",
    usage: "Generator gambar Leonardo",
  },
});

function defaultStore() {
  return {
    version: 1,
    envImported: false,
    providers: Object.fromEntries(
      Object.keys(API_PROVIDERS).map(provider => [provider, []])
    ),
  };
}

function getEncryptionKey() {
  const configured = process.env.API_KEY_ENCRYPTION_SECRET?.trim();
  if (configured) {
    return crypto.createHash("sha256").update(configured).digest();
  }

  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  if (!fs.existsSync(SECRET_FILE)) {
    fs.writeFileSync(SECRET_FILE, crypto.randomBytes(32).toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    });
  }

  const secret = fs.readFileSync(SECRET_FILE, "utf8").trim();
  return crypto.createHash("sha256").update(secret).digest();
}

function encryptKey(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);

  return {
    encrypted: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptKey(entry) {
  try {
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      getEncryptionKey(),
      Buffer.from(entry.iv, "base64")
    );
    decipher.setAuthTag(Buffer.from(entry.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(entry.encrypted, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

function normalizeStore(data) {
  const store = data && typeof data === "object" ? data : defaultStore();
  store.version = 1;
  store.envImported = Boolean(store.envImported);
  store.providers = store.providers && typeof store.providers === "object"
    ? store.providers
    : {};

  for (const provider of Object.keys(API_PROVIDERS)) {
    if (!Array.isArray(store.providers[provider])) {
      store.providers[provider] = [];
    }
    store.providers[provider] = store.providers[provider].slice(0, MAX_KEYS);
  }
  return store;
}

function writeStore(store) {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
  const temporary = `${STORE_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(store, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(temporary, STORE_FILE);
}

function makeEntry(key, label, source = "panel") {
  return {
    id: crypto.randomUUID(),
    label: String(label || "API Key").trim().slice(0, 60) || "API Key",
    active: true,
    source,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...encryptKey(key),
  };
}

function readStore() {
  let store = defaultStore();
  if (fs.existsSync(STORE_FILE)) {
    try {
      store = normalizeStore(JSON.parse(fs.readFileSync(STORE_FILE, "utf8")));
    } catch {
      store = defaultStore();
    }
  }

  if (!store.envImported) {
    for (const [provider, meta] of Object.entries(API_PROVIDERS)) {
      const envKey = process.env[meta.envName]?.trim();
      if (envKey && store.providers[provider].length < MAX_KEYS) {
        store.providers[provider].push(
          makeEntry(envKey, "Key awal dari .env", "env")
        );
      }
    }
    store.envImported = true;
    writeStore(store);
  }

  return store;
}

function assertProvider(provider) {
  if (!API_PROVIDERS[provider]) {
    const error = new Error("Provider API tidak dikenal");
    error.status = 404;
    throw error;
  }
}

function validateKey(value) {
  const key = String(value || "").trim();
  if (key.length < 10 || key.length > 500) {
    const error = new Error("API key harus berisi 10–500 karakter");
    error.status = 400;
    throw error;
  }
  return key;
}

function maskKey(value) {
  if (!value) return "Tidak dapat dibaca";
  if (value.length <= 10) return `${value.slice(0, 2)}••••${value.slice(-2)}`;
  return `${value.slice(0, 5)}••••••••••${value.slice(-4)}`;
}

function publicEntry(entry, reveal = false) {
  const value = decryptKey(entry);
  const result = {
    id: entry.id,
    label: entry.label,
    active: entry.active !== false,
    source: entry.source || "panel",
    masked: maskKey(value),
    readable: Boolean(value),
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
  if (reveal) result.value = value;
  return result;
}

export function listApiKeys({ reveal = false } = {}) {
  const store = readStore();
  return {
    minSlots: 3,
    maxSlots: MAX_KEYS,
    providers: Object.fromEntries(
      Object.entries(API_PROVIDERS).map(([provider, meta]) => [
        provider,
        {
          ...meta,
          keys: store.providers[provider].map(entry => publicEntry(entry, reveal)),
        },
      ])
    ),
  };
}

export function addApiKey(provider, { key, label } = {}) {
  assertProvider(provider);
  const store = readStore();
  if (store.providers[provider].length >= MAX_KEYS) {
    const error = new Error(`Maksimal ${MAX_KEYS} key untuk setiap provider`);
    error.status = 400;
    throw error;
  }

  const entry = makeEntry(validateKey(key), label);
  store.providers[provider].push(entry);
  writeStore(store);
  return publicEntry(entry);
}

export function updateApiKey(provider, id, changes = {}) {
  assertProvider(provider);
  const store = readStore();
  const entry = store.providers[provider].find(item => item.id === id);
  if (!entry) {
    const error = new Error("Slot API key tidak ditemukan");
    error.status = 404;
    throw error;
  }

  if (typeof changes.label === "string") {
    entry.label = changes.label.trim().slice(0, 60) || "API Key";
  }
  if (typeof changes.active === "boolean") entry.active = changes.active;
  if (changes.key) Object.assign(entry, encryptKey(validateKey(changes.key)));
  entry.updatedAt = new Date().toISOString();

  writeStore(store);
  return publicEntry(entry);
}

export function deleteApiKey(provider, id) {
  assertProvider(provider);
  const store = readStore();
  const before = store.providers[provider].length;
  store.providers[provider] = store.providers[provider].filter(
    entry => entry.id !== id
  );
  if (store.providers[provider].length === before) {
    const error = new Error("Slot API key tidak ditemukan");
    error.status = 404;
    throw error;
  }
  writeStore(store);
}

export function getApiKeyCandidates(provider) {
  assertProvider(provider);
  const store = readStore();
  return store.providers[provider]
    .filter(entry => entry.active !== false)
    .map(entry => ({
      id: entry.id,
      label: entry.label,
      key: decryptKey(entry),
    }))
    .filter(entry => entry.key);
}
