const MAX_BROADCAST_LENGTH = 4000;
const VALID_MODES = new Set(["custom", "stock", "price-list"]);

function broadcastError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cleanText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function formatRupiah(value) {
  const amount = Math.max(0, Number(value) || 0);
  return `Rp${Math.round(amount).toLocaleString("id-ID")}`;
}

function prettyProductName(value) {
  const aliases = new Map([
    ["chatgpt", "ChatGPT"],
    ["gpt", "GPT"],
    ["gemini", "Gemini"],
    ["capcut", "CapCut"],
    ["netflix", "Netflix"],
    ["canva", "Canva"],
    ["leonardo", "Leonardo AI"],
    ["google flow", "Google Flow"],
    ["grok", "Grok"],
    ["xai", "xAI"],
  ]);
  const name = cleanText(value).replace(/^[-*•\d.)\s]+/, "");
  const alias = aliases.get(name.toLowerCase());
  if (alias) return alias;
  return name.replace(/(^|\s)([a-zà-ÿ])/g, (match, space, letter) => `${space}${letter.toUpperCase()}`);
}

function parseCompactAmount(value) {
  const raw = cleanText(value).toLowerCase();
  const multiplier = /(?:k|rb|ribu)\s*$/.test(raw) ? 1000 : 1;
  const digits = raw.replace(/(?:k|rb|ribu)\s*$/, "").replace(/\D/g, "");
  if (!digits) return null;
  return Number.parseInt(digits, 10) * multiplier;
}

export function normalizeBroadcastMode(value) {
  const mode = String(value || "custom").trim().toLowerCase();
  return VALID_MODES.has(mode) ? mode : "custom";
}

export function parseCompactPriceList(value) {
  const source = cleanText(value)
    .replace(/,\s*(?=[^,\n;]{1,100}\b(?:stok|stock)\b)/gi, "\n");
  if (!source) return [];

  return source
    .split(/\n+|;+/)
    .map(line => cleanText(line))
    .filter(Boolean)
    .map(line => {
      const stockMatch = /\b(?:stok|stock)\s*(?:tersedia\s*)?[:=]?\s*(\d+)/i.exec(line);
      const priceMatch = /\b(?:harga|price)\s*[:=]?\s*(?:rp\.?\s*)?([\d][\d.,]*(?:\s*(?:k|rb|ribu))?)/i.exec(line)
        || /\brp\.?\s*([\d][\d.,]*(?:\s*(?:k|rb|ribu))?)/i.exec(line);
      if (!stockMatch || !priceMatch) return null;

      const cutAt = Math.min(stockMatch.index, priceMatch.index);
      const name = prettyProductName(line.slice(0, cutAt).replace(/[-|:]+\s*$/, ""));
      const stock = Number.parseInt(stockMatch[1], 10);
      const price = parseCompactAmount(priceMatch[1]);
      if (!name || !Number.isFinite(stock) || price === null) return null;
      return { name, stock: Math.max(0, stock), price: Math.max(0, price) };
    })
    .filter(Boolean);
}

function stockStatus(stock) {
  if (stock <= 0) return "❌ HABIS";
  if (stock <= 5) return "⚠️ TERBATAS";
  return "✅ READY";
}

export function formatStockAnnouncement(products, note = "") {
  const activeProducts = (Array.isArray(products) ? products : [])
    .filter(product => product && product.aktif !== false)
    .slice(0, 25);
  if (!activeProducts.length) {
    throw broadcastError("Belum ada produk aktif untuk dibuatkan update stok");
  }

  const rows = activeProducts.map((product, index) => {
    const stock = Math.max(0, Number.parseInt(product.stok, 10) || 0);
    const code = cleanText(product.kode || product.id || "-").toUpperCase();
    const name = cleanText(product.nama || "Produk");
    return [
      `*${String(index + 1).padStart(2, "0")}. ${name}*`,
      `   ├ 🏷️ Kode: *${code}*`,
      `   ├ 💰 Harga: *${formatRupiah(product.harga)}*`,
      `   └ 📦 Stok: *${stock}* — ${stockStatus(stock)}`,
    ].join("\n");
  });
  const totalAvailableStock = activeProducts.reduce(
    (total, product) => total + Math.max(0, Number.parseInt(product.stok, 10) || 0),
    0,
  );

  const extraCount = Math.max(0, (Array.isArray(products) ? products.filter(item => item?.aktif !== false).length : 0) - activeProducts.length);
  const cleanNote = cleanText(note);
  return [
    "✨━━ *UPDATE STOK TERBARU* ━━✨",
    `_Data langsung dari katalog admin • ${activeProducts.length} produk • ${totalAvailableStock} stok tersedia_`,
    "",
    rows.join("\n\n"),
    extraCount ? `\n_+${extraCount} produk aktif lainnya tersedia di katalog._` : "",
    cleanNote ? `\n💬 *CATATAN PROMO*\n${cleanNote}` : "",
    "",
    "━━━━━━━━━━━━━━━━━━",
    "🛒 *CARA PESAN*",
    "Ketik *!order KODE JUMLAH*",
    "_Contoh: !order P001 1_",
    "",
    "⚡ Proses cepat • Produk digital • Tanpa ongkir",
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n").trim();
}

export function formatPriceListAnnouncement(value) {
  const entries = parseCompactPriceList(value).slice(0, 30);
  if (!entries.length) {
    throw broadcastError("Daftar harga belum terbaca. Tulis satu produk per baris, contoh: Gemini stok 18 harga 50000");
  }

  const rows = entries.map((entry, index) => [
    `╭─ *${String(index + 1).padStart(2, "0")}. ${entry.name}*`,
    `│ 📦 Stok: *${entry.stock}* — ${stockStatus(entry.stock)}`,
    `│ 💰 Harga: *${formatRupiah(entry.price)}*`,
    "╰────────────────",
  ].join("\n"));

  return [
    "💎✨ *DAFTAR HARGA & UPDATE STOK* ✨💎",
    "_Harga spesial hari ini, selama persediaan masih ada_",
    "",
    rows.join("\n\n"),
    "",
    "━━━━━━━━━━━━━━━━━━",
    "🛒 *MAU PESAN?*",
    "Kirim nama produk dan jumlah yang diinginkan.",
    "",
    "⚡ Cepat • Aman • Tanpa ongkir",
  ].join("\n").trim();
}

export function formatBroadcastEnvelope(message, businessName = "Bot Abel") {
  const name = cleanText(businessName) || "Bot Abel";
  return `📢 *${name}*\n\n${cleanText(message)}`;
}

export function formatBroadcastDraft({ mode, message, products, businessName } = {}) {
  const normalizedMode = normalizeBroadcastMode(mode);
  let body;
  if (normalizedMode === "stock") {
    body = formatStockAnnouncement(products, message);
  } else if (normalizedMode === "price-list") {
    body = formatPriceListAnnouncement(message);
  } else {
    body = cleanText(message);
    if (!body) throw broadcastError("Pesan siaran wajib diisi");
  }

  const result = formatBroadcastEnvelope(body, businessName);
  if (result.length > MAX_BROADCAST_LENGTH) {
    throw broadcastError(`Pesan hasil format terlalu panjang (${result.length}/${MAX_BROADCAST_LENGTH} karakter). Kurangi produk atau catatan promo.`);
  }
  return result;
}
