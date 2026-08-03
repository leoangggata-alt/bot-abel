import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = path.join(__dirname, "../data/member-memory.json");
const MAX_MEMORIES = 50;
const STOP_WORDS = new Set(["yang", "dan", "atau", "untuk", "dari", "dengan", "saya", "aku", "ini", "itu", "apa", "siapa"]);

function clean(value, limit = 1000) {
  return String(value || "").replace(/[\u0000-\u001f]/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, limit);
}

function terms(value) {
  return [...new Set(clean(value, 10000).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term)))].slice(0, 24);
}

export function createMemberMemoryStore(filePath = DEFAULT_FILE) {
  const file = path.resolve(filePath);
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return parsed?.groups && typeof parsed.groups === "object" ? parsed : { version: 1, groups: {} };
    } catch {
      return { version: 1, groups: {} };
    }
  }
  function write(db) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(db, null, 2), "utf8");
    fs.renameSync(temporary, file);
  }
  function ensure(db, groupId, memberId) {
    const group = clean(groupId, 180);
    const member = clean(memberId, 180);
    if (!group.endsWith("@g.us") || !member) throw new Error("Identitas grup/anggota tidak valid");
    db.groups[group] ||= { members: {} };
    db.groups[group].members[member] ||= { enabled: false, consentAt: null, memories: [], updatedAt: null };
    return db.groups[group].members[member];
  }
  function add(groupId, memberId, text) {
    const value = clean(text);
    if (!value) throw new Error("Informasi yang ingin diingat masih kosong");
    const db = read();
    const profile = ensure(db, groupId, memberId);
    if (!profile.enabled || !profile.consentAt) throw new Error("Aktifkan persetujuan dahulu dengan !memori setuju");
    const item = { id: `P-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, text: value, createdAt: new Date().toISOString() };
    profile.memories.push(item);
    profile.memories = profile.memories.slice(-MAX_MEMORIES);
    profile.updatedAt = new Date().toISOString();
    write(db);
    return item;
  }
  function get(groupId, memberId) {
    const db = read();
    const profile = db.groups?.[clean(groupId, 180)]?.members?.[clean(memberId, 180)];
    return profile ? { enabled: profile.enabled === true && Boolean(profile.consentAt), consentAt: profile.consentAt || null, memories: Array.isArray(profile.memories) ? profile.memories.slice(-MAX_MEMORIES) : [], updatedAt: profile.updatedAt || null } : { enabled: false, consentAt: null, memories: [], updatedAt: null };
  }
  function setEnabled(groupId, memberId, enabled) {
    const db = read();
    const profile = ensure(db, groupId, memberId);
    profile.enabled = Boolean(enabled);
    profile.consentAt = enabled ? new Date().toISOString() : null;
    profile.updatedAt = new Date().toISOString();
    write(db);
    return get(groupId, memberId);
  }
  function clear(groupId, memberId) {
    const db = read();
    const profile = ensure(db, groupId, memberId);
    const removed = profile.memories.length;
    profile.memories = [];
    profile.enabled = false;
    profile.consentAt = null;
    profile.updatedAt = new Date().toISOString();
    write(db);
    return removed;
  }
  function context(groupId, memberId, query, limit = 8) {
    const profile = get(groupId, memberId);
    if (!profile.enabled || !profile.memories.length) return "";
    const queryTerms = terms(query);
    const selected = queryTerms.length
      ? profile.memories.map((item, index) => ({ item, index, score: queryTerms.reduce((sum, term) => sum + (item.text.toLowerCase().includes(term) ? 1 : 0), 0) }))
        .filter(entry => entry.score > 0).sort((a, b) => b.score - a.score || b.index - a.index).slice(0, limit).map(entry => entry.item)
      : profile.memories.slice(-Math.min(3, limit));
    return selected.map(item => `- [${item.id}] ${clean(item.text, 400)}`).join("\n").slice(0, 3000);
  }
  return { add, get, setEnabled, clear, context };
}

const store = createMemberMemoryStore();
export const addMemberMemory = store.add;
export const getMemberMemory = store.get;
export const setMemberMemoryEnabled = store.setEnabled;
export const clearMemberMemory = store.clear;
export const getMemberMemoryContext = store.context;
