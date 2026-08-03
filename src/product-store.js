import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PRODUCTS_FILE = path.join(__dirname, "../data/products.json");
export const PRODUCTS_BACKUP_FILE = path.join(__dirname, "../data/products.backup.json");
const waitArray = new Int32Array(new SharedArrayBuffer(4));

function parseProducts(filePath) {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(value)) throw new Error("Data produk harus berupa daftar JSON");
  return value;
}

function atomicWrite(filePath, products) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(products, null, 2), "utf8");
  fs.renameSync(temporary, filePath);
}

export function validateProducts(products) {
  if (!Array.isArray(products)) throw new Error("Data produk harus berupa daftar");
  const codes = new Set();
  for (const product of products) {
    const code = String(product?.kode || "").trim().toUpperCase();
    if (!code) {
      const error = new Error("Setiap produk wajib memiliki kode");
      error.status = 400;
      throw error;
    }
    if (codes.has(code)) {
      const error = new Error(`Kode produk ${code} sudah digunakan`);
      error.status = 409;
      throw error;
    }
    codes.add(code);
  }
  return products;
}

export function createProductStore({
  filePath = PRODUCTS_FILE,
  backupPath = PRODUCTS_BACKUP_FILE,
  lockPath = `${filePath}.lock`,
} = {}) {
  function read() {
    if (!fs.existsSync(filePath) && !fs.existsSync(backupPath)) return [];
    try {
      return parseProducts(filePath);
    } catch (mainError) {
      try {
        const recovered = parseProducts(backupPath);
        console.warn(`[PRODUK] File utama rusak; memakai backup ${path.basename(backupPath)}`);
        return recovered;
      } catch {
        throw new Error(`Data produk rusak dan backup tidak tersedia: ${mainError.message}`);
      }
    }
  }

  function writeUnlocked(products) {
    validateProducts(products);
    atomicWrite(filePath, products);
    atomicWrite(backupPath, products);
    return products;
  }

  function withLock(action) {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    const deadline = Date.now() + 3000;
    let descriptor;
    while (descriptor === undefined) {
      try {
        descriptor = fs.openSync(lockPath, "wx");
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        try {
          if (Date.now() - fs.statSync(lockPath).mtimeMs > 15000) fs.unlinkSync(lockPath);
        } catch {}
        if (Date.now() >= deadline) throw new Error("Data produk sedang dipakai proses lain; coba lagi");
        Atomics.wait(waitArray, 0, 0, 25);
      }
    }
    try {
      return action();
    } finally {
      try { fs.closeSync(descriptor); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }

  function write(products) {
    return withLock(() => writeUnlocked(products));
  }

  function update(mutator) {
    if (typeof mutator !== "function") throw new Error("Fungsi pembaruan produk wajib diisi");
    return withLock(() => {
      const current = read();
      const next = mutator(current.map(product => ({ ...product })));
      return writeUnlocked(next);
    });
  }

  return { read, write, update, filePath, backupPath };
}

const productStore = createProductStore();
export const readProducts = productStore.read;
export const writeProducts = productStore.write;
export const updateProducts = productStore.update;
