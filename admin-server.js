// ============================================================
//  admin-server.js - Server Admin Panel Bot Abel
//  Jalankan: node admin-server.js
//  Buka: http://localhost:8080
// ============================================================
import express from "express";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import {
  addApiKey,
  deleteApiKey,
  listApiKeys,
  updateApiKey,
} from "./src/api-key-store.js";
import { getAISettings, updateAISettings } from "./src/ai-settings.js";
import { testProvider } from "./src/provider-test.js";
import {
  countActiveBroadcastJobs,
  createBroadcastJob,
  getGroupDirectory,
  listBroadcastJobs,
  MAX_ACTIVE_BROADCASTS,
} from "./src/broadcast-store.js";
import {
  getBotProfiles,
  getBotStatuses,
  requestBotRestart,
  updateBotProfile,
} from "./src/bot-profile-store.js";
import { getHostMode, setHostRole } from "./src/host-mode-store.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number.parseInt(process.env.ADMIN_PORT || "8080", 10);
const HOST = process.env.ADMIN_HOST || "127.0.0.1";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const DATA_FILE     = path.join(__dirname, "data", "products.json");
const ORDERS_FILE   = path.join(__dirname, "data", "orders.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");
const TUNNEL_LOG    = path.join(__dirname, "logs", "tunnel.log");
const TUNNEL_URL_FILE = path.join(__dirname, "logs", "admin-url.txt");

const isLoopbackHost = ["127.0.0.1", "localhost", "::1"].includes(HOST.toLowerCase());
if (!isLoopbackHost && !ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD wajib diisi ketika panel dibuka ke jaringan lokal/internet");
}

app.disable("x-powered-by");

// Health check tetap bisa dipakai PM2/status tanpa membuka data admin.
app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: Math.floor(process.uptime()) });
});

function safeEqual(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

function requireAdmin(req, res, next) {
  // Panel lokal tetap bisa dipakai tanpa sandi. Tunnel menolak start bila sandi kosong.
  if (!ADMIN_PASSWORD) return next();

  const authorization = req.headers.authorization || "";
  if (authorization.startsWith("Basic ")) {
    try {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString(
        "utf8",
      );
      const separator = decoded.indexOf(":");
      const username = separator >= 0 ? decoded.slice(0, separator) : "";
      const password = separator >= 0 ? decoded.slice(separator + 1) : "";
      if (
        safeEqual(username, ADMIN_USER) &&
        safeEqual(password, ADMIN_PASSWORD)
      ) {
        return next();
      }
    } catch {
      // Header tidak valid akan ditolak di bawah.
    }
  }

  res.set("WWW-Authenticate", 'Basic realm="Bot Abel Admin"');
  return res.status(401).send("Login admin diperlukan.");
}

app.use(requireAdmin);
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

// ── Baca URL tunnel Cloudflare ────────────────────────────────
function getTunnelUrl() {
  // Coba dari file cache dulu
  if (fs.existsSync(TUNNEL_URL_FILE)) {
    const url = fs.readFileSync(TUNNEL_URL_FILE, "utf-8").trim();
    if (url) return url;
  }
  // Coba parse dari log cloudflared
  if (fs.existsSync(TUNNEL_LOG)) {
    const log = fs.readFileSync(TUNNEL_LOG, "utf-8");
    const match = log.match(/https:\/\/[a-z0-9\-]+\.trycloudflare\.com/);
    if (match) return match[0];
  }
  return null;
}

function getLanUrls() {
  const urls = [];
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses || []) {
      if ((address.family !== "IPv4" && address.family !== 4) || address.internal) continue;
      urls.push(`http://${address.address}:${PORT}`);
    }
  }
  return [...new Set(urls)];
}

// API: get tunnel URL
app.get("/api/tunnel-url", (req, res) => {
  const url = getTunnelUrl();
  const localUrl = `http://127.0.0.1:${PORT}`;
  const lanUrls = HOST === "0.0.0.0" || HOST === "::" ? getLanUrls() : [];
  res.json({ url, localUrl, lanUrls, preferredUrl: url || lanUrls[0] || localUrl });
});

app.get("/api/host-mode", (req, res) => {
  const mode = getHostMode();
  res.json({
    ...mode,
    localUrl: `http://127.0.0.1:${PORT}`,
    lanUrls: HOST === "0.0.0.0" || HOST === "::" ? getLanUrls() : [],
    tunnelUrl: getTunnelUrl(),
  });
});

app.put("/api/host-mode", (req, res) => {
  try {
    const mode = setHostRole(req.body?.role);
    return res.json({ success: true, mode });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});


// ── Helper baca/tulis data ────────────────────────────────────
function readProducts() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
function saveProducts(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}
function readOrders() {
  if (!fs.existsSync(ORDERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, "utf-8")); } catch { return []; }
}
function saveOrders(data) {
  fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true });
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(data, null, 2));
}
function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    return { businessName: "Bot Abel", ownerName: "Admin", ownerNumber: "", welcomeMsg: "" };
  }
  return JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf-8"));
}
function saveSettings(data) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2));
}

// ── API Produk ────────────────────────────────────────────────
// GET semua produk
app.get("/api/products", (req, res) => {
  res.json(readProducts());
});

// POST tambah produk baru
app.post("/api/products", (req, res) => {
  const products = readProducts();
  const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
  // Auto-generate kode jika kosong
  const kode = req.body.kode || `P${String(newId).padStart(3, "0")}`;
  const produk = { id: newId, kode, aktif: true, ...req.body, kode };
  products.push(produk);
  saveProducts(products);
  res.json({ success: true, produk });
});

// PUT update produk (termasuk kode)
app.put("/api/products/:id", (req, res) => {
  const products = readProducts();
  const idx = products.findIndex(p => p.id === parseInt(req.params.id));
  if (idx === -1) return res.status(404).json({ error: "Produk tidak ditemukan" });
  products[idx] = { ...products[idx], ...req.body };
  saveProducts(products);
  res.json({ success: true, produk: products[idx] });
});

// DELETE hapus produk
app.delete("/api/products/:id", (req, res) => {
  const products = readProducts();
  const filtered = products.filter(p => p.id !== parseInt(req.params.id));
  saveProducts(filtered);
  res.json({ success: true });
});

// ── API Settings ──────────────────────────────────────────────
app.get("/api/settings", (req, res) => res.json(readSettings()));
app.post("/api/settings", (req, res) => {
  saveSettings(req.body);
  res.json({ success: true });
});

// ── API Key Pool ─────────────────────────────────────────────
app.get("/api/api-keys", (req, res) => {
  // Key lengkap hanya boleh keluar saat panel benar-benar dilindungi password.
  const reveal = Boolean(ADMIN_PASSWORD) && req.query.reveal === "true";
  res.json(listApiKeys({ reveal }));
});

app.post("/api/api-keys/:provider", (req, res) => {
  try {
    const key = addApiKey(req.params.provider, req.body);
    res.status(201).json({ success: true, key });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.put("/api/api-keys/:provider/:id", (req, res) => {
  try {
    const key = updateApiKey(req.params.provider, req.params.id, req.body);
    res.json({ success: true, key });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.delete("/api/api-keys/:provider/:id", (req, res) => {
  try {
    deleteApiKey(req.params.provider, req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

app.post("/api/api-keys/:provider/test", async (req, res) => {
  try {
    res.json(await testProvider(req.params.provider));
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// Pengaturan ini dibaca ulang oleh bot pada setiap permintaan, jadi tidak perlu restart.
app.get("/api/ai-settings", (req, res) => {
  res.json(getAISettings());
});

app.put("/api/ai-settings", (req, res) => {
  try {
    res.json({ success: true, settings: updateAISettings(req.body) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ── API Orders ─────────────────────────────────────────────
app.get("/api/orders", (req, res) => res.json(readOrders().reverse()));
app.put("/api/orders/:noOrder", (req, res) => {
  const orders = readOrders();
  const idx = orders.findIndex(o => o.noOrder === req.params.noOrder);
  if (idx === -1) return res.status(404).json({ error: "Order tidak ditemukan" });
  orders[idx] = { ...orders[idx], ...req.body };
  saveOrders(orders);
  res.json({ success: true, order: orders[idx] });
});

// ── API Stats ─────────────────────────────────────────────────
// API antrean pesan siaran. Bot mengambil job ini melalui pekerja lokal.
app.get("/api/broadcast/groups", (req, res) => {
  res.json(getGroupDirectory());
});

app.get("/api/broadcast/jobs", (req, res) => {
  res.json({ jobs: listBroadcastJobs(req.query.limit) });
});

app.post("/api/broadcast/jobs", (req, res) => {
  try {
    if (countActiveBroadcastJobs() >= MAX_ACTIVE_BROADCASTS) {
      return res.status(429).json({
        error: `Maksimal ${MAX_ACTIVE_BROADCASTS} siaran boleh mengantre. Tunggu siaran sebelumnya selesai.`,
      });
    }
    const directory = getGroupDirectory();
    const job = createBroadcastJob(req.body, directory.groups);
    return res.status(202).json({ success: true, job });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

// Dua identitas bot memakai koneksi dan memori terpisah, tetapi pool API sama.
app.get("/api/bots", (req, res) => {
  res.json({
    profiles: getBotProfiles(),
    statuses: getBotStatuses(),
    sharedApiPool: true,
  });
});

app.put("/api/bots/:id", (req, res) => {
  try {
    const profile = updateBotProfile(req.params.id, req.body);
    requestBotRestart(req.params.id);
    return res.json({ success: true, profile, restartQueued: true });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.post("/api/bots/:id/restart", (req, res) => {
  try {
    requestBotRestart(req.params.id);
    return res.status(202).json({ success: true, restartQueued: true });
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message });
  }
});

app.get("/api/bots/:id/qr", (req, res) => {
  const id = req.params.id;
  if (!getBotProfiles()[id]) return res.status(404).json({ error: "Bot tidak ditemukan" });
  const qrFile = path.join(__dirname, id === "abel" ? "qrcode.png" : `qrcode-${id}.png`);
  if (!fs.existsSync(qrFile)) return res.status(404).json({ error: "QR belum tersedia" });
  return res.sendFile(qrFile);
});

app.get("/api/stats", (req, res) => {
  const products = readProducts();
  const orders = readOrders();
  const pendapatan = orders
    .filter(o => o.status === "Selesai")
    .reduce((a, b) => a + (b.total || 0), 0);
  res.json({
    totalProduk: products.length,
    produkAktif: products.filter(p => p.aktif).length,
    totalStok: products.reduce((a, b) => a + (b.stok || 0), 0),
    kategori: [...new Set(products.map(p => p.kategori))].length,
    totalOrder: orders.length,
    orderBaru: orders.filter(o => o.status === "Menunggu Konfirmasi").length,
    pendapatan,
  });
});

// Serve admin panel
app.get("/", (req, res) => {
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(req.get("user-agent") || "");
  if (isMobile && req.query.full !== "1") return res.redirect("/m");
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get(["/m", "/mobile"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mobile.html"));
});

app.listen(PORT, HOST, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  🛠️  Admin Panel Bot Abel             ║`);
  console.log(`║  🌐 http://${HOST}:${PORT}           ║`);
  console.log(`║  📦 Data: data/products.json          ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
