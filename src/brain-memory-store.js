import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, "../data/brain-memory.json");
const SCOPES = new Set(["shared", "abel", "arka"]);
const MAX_PER_SCOPE = 500;
const STOP_WORDS = new Set(["yang", "dan", "atau", "untuk", "dari", "dengan", "kamu", "saya", "aku", "ini", "itu", "apa", "siapa"]);

function clean(value, limit = 2000) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, limit);
}

function terms(value) {
  return [...new Set(clean(value, 10000).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term)))].slice(0, 30);
}

function emptyDb() {
  return { version: 1, memories: { shared: [], abel: [], arka: [] } };
}

export function createBrainMemoryStore(filePath = DEFAULT_FILE) {
  const file = path.resolve(filePath);
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      const db = emptyDb();
      for (const scope of SCOPES) {
        db.memories[scope] = Array.isArray(parsed?.memories?.[scope])
          ? parsed.memories[scope].filter(item => item?.id && item?.text).slice(-MAX_PER_SCOPE)
          : [];
      }
      return db;
    } catch {
      return emptyDb();
    }
  }
  function write(db) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(temporary, file);
  }
  function normalizeScope(scope) {
    const value = String(scope || "").toLowerCase();
    if (!SCOPES.has(value)) throw new Error("Target memori harus abel, arka, atau bersama");
    return value;
  }
  function add(scope, text, author = "owner") {
    const target = normalizeScope(scope === "bersama" ? "shared" : scope);
    const value = clean(text);
    if (!value) throw new Error("Isi pelajaran tidak boleh kosong");
    const db = read();
    const item = { id: `M-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, scope: target, text: value, author: clean(author, 80), createdAt: new Date().toISOString() };
    db.memories[target].push(item);
    db.memories[target] = db.memories[target].slice(-MAX_PER_SCOPE);
    write(db);
    return item;
  }
  function remove(id) {
    const targetId = clean(id, 40).toUpperCase();
    const db = read();
    let removed = false;
    for (const scope of SCOPES) {
      const before = db.memories[scope].length;
      db.memories[scope] = db.memories[scope].filter(item => item.id.toUpperCase() !== targetId);
      removed ||= before !== db.memories[scope].length;
    }
    if (removed) write(db);
    return removed;
  }
  function list(scope, limit = 20) {
    const db = read();
    if (!scope) return [...db.memories.shared, ...db.memories.abel, ...db.memories.arka]
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
    return db.memories[normalizeScope(scope === "bersama" ? "shared" : scope)].slice(-limit).reverse();
  }
  function relevant(profileId, query, limit = 10) {
    const db = read();
    const available = [...db.memories.shared, ...(db.memories[profileId] || [])];
    const queryTerms = terms(query);
    if (!queryTerms.length) return available.slice(-Math.min(4, limit));
    return available.map((item, index) => ({ item, index, score: queryTerms.reduce((sum, term) => sum + (item.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
      .filter(entry => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.index - a.index)
      .slice(0, limit)
      .map(entry => entry.item);
  }
  function context(profileId, query) {
    const memories = relevant(profileId, query);
    if (!memories.length) return "";
    return memories.map(item => `- [${item.id}] ${clean(item.text, 500)}`).join("\n").slice(0, 5000);
  }
  function stats() {
    const db = read();
    return Object.fromEntries([...SCOPES].map(scope => [scope, db.memories[scope].length]));
  }
  return { add, remove, list, relevant, context, stats };
}

const store = createBrainMemoryStore();
export const addBrainMemory = store.add;
export const removeBrainMemory = store.remove;
export const listBrainMemories = store.list;
export const getBrainMemoryContext = store.context;
export const getBrainMemoryStats = store.stats;
