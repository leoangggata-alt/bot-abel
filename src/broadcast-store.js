import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const JOBS_DIR = path.join(DATA_DIR, "broadcast-jobs");
const GROUP_CACHE_FILE = path.join(DATA_DIR, "group-cache.json");
const MEDIA_DIR = path.join(DATA_DIR, "broadcast-media");

export const MAX_BROADCAST_LENGTH = 4000;
export const MAX_ACTIVE_BROADCASTS = 3;
export const MAX_BROADCAST_IMAGE_BYTES = 5 * 1024 * 1024;

function ensureDataDirectories() {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
}

const IMAGE_TYPES = {
  "image/jpeg": { extension: ".jpg", matches: buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  "image/png": { extension: ".png", matches: buffer => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: ".webp", matches: buffer => buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP" },
};

export function saveBroadcastImage(buffer, mimeType, originalName = "gambar") {
  ensureDataDirectories();
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const type = IMAGE_TYPES[String(mimeType || "").toLowerCase()];
  if (!type || !type.matches(data)) {
    const error = new Error("Foto harus berformat JPG, PNG, atau WEBP yang valid");
    error.status = 400;
    throw error;
  }
  if (!data.length || data.length > MAX_BROADCAST_IMAGE_BYTES) {
    const error = new Error("Ukuran foto maksimal 5 MB");
    error.status = 413;
    throw error;
  }
  const id = crypto.randomUUID();
  fs.writeFileSync(path.join(MEDIA_DIR, `${id}${type.extension}`), data);
  const metadata = { id, mimeType: String(mimeType).toLowerCase(), originalName: path.basename(String(originalName || "gambar")).slice(0, 120), size: data.length, extension: type.extension };
  writeJson(path.join(MEDIA_DIR, `${id}.json`), metadata);
  return metadata;
}

export function readBroadcastImage(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) return null;
  const metadata = readJson(path.join(MEDIA_DIR, `${id}.json`), null);
  if (!metadata || !IMAGE_TYPES[metadata.mimeType]) return null;
  const file = path.join(MEDIA_DIR, `${id}${metadata.extension}`);
  return fs.existsSync(file) ? { ...metadata, buffer: fs.readFileSync(file) } : null;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

function jobFile(id) {
  if (!/^[a-f0-9-]{36}$/i.test(String(id || ""))) {
    const error = new Error("ID siaran tidak valid");
    error.status = 400;
    throw error;
  }
  return path.join(JOBS_DIR, `${id}.json`);
}

function normalizeGroup(group) {
  const id = String(group?.id || "").trim();
  if (!id.endsWith("@g.us")) return null;
  return {
    id,
    name: String(group?.name || group?.subject || "Grup WhatsApp").trim().slice(0, 160),
    participantCount: Math.max(0, Number(group?.participantCount || group?.participants?.length || 0)),
    announce: Boolean(group?.announce),
  };
}

export function saveGroupDirectory(groups, connected = true) {
  const normalized = groups.map(normalizeGroup).filter(Boolean);
  const directory = {
    connected: Boolean(connected),
    updatedAt: new Date().toISOString(),
    groups: normalized,
  };
  writeJson(GROUP_CACHE_FILE, directory);
  return directory;
}

export function getGroupDirectory() {
  const directory = readJson(GROUP_CACHE_FILE, {
    connected: false,
    updatedAt: null,
    groups: [],
  });
  return {
    connected: Boolean(directory.connected),
    updatedAt: directory.updatedAt || null,
    groups: Array.isArray(directory.groups)
      ? directory.groups.map(normalizeGroup).filter(Boolean)
      : [],
  };
}

export function markGroupDirectoryDisconnected() {
  const current = getGroupDirectory();
  return saveGroupDirectory(current.groups, false);
}

export function normalizeBroadcastRequest(input, availableGroups) {
  const message = String(input?.message || "")
    .replace(/\u0000/g, "")
    .trim();
  if (!message) {
    const error = new Error("Pesan siaran wajib diisi");
    error.status = 400;
    throw error;
  }
  if (message.length > MAX_BROADCAST_LENGTH) {
    const error = new Error(`Pesan maksimal ${MAX_BROADCAST_LENGTH} karakter`);
    error.status = 400;
    throw error;
  }

  const groups = availableGroups.map(normalizeGroup).filter(Boolean);
  const groupMap = new Map(groups.map(group => [group.id, group]));
  const targetMode = input?.targetMode === "selected" ? "selected" : "all";
  const requestedIds = Array.isArray(input?.groupIds)
    ? [...new Set(input.groupIds.map(value => String(value)))]
    : [];
  const targets = targetMode === "all"
    ? groups
    : requestedIds.map(id => groupMap.get(id)).filter(Boolean);

  if (!targets.length) {
    const error = new Error(
      targetMode === "selected"
        ? "Pilih minimal satu grup tujuan"
        : "Bot belum menemukan grup WhatsApp",
    );
    error.status = 400;
    throw error;
  }
  const media = input?.mediaId ? readBroadcastImage(input.mediaId) : null;
  if (input?.mediaId && !media) {
    const error = new Error("Foto siaran tidak ditemukan atau sudah tidak valid");
    error.status = 400;
    throw error;
  }

  return {
    message,
    targetMode,
    targets,
    preformatted: input?.preformatted === true,
    templateMode: String(input?.templateMode || "custom").slice(0, 30),
    media: media ? { id: media.id, mimeType: media.mimeType, originalName: media.originalName, size: media.size } : null,
  };
}

export function createBroadcastJob(input, availableGroups) {
  ensureDataDirectories();
  const normalized = normalizeBroadcastRequest(input, availableGroups);
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    status: "queued",
    message: normalized.message,
    preformatted: normalized.preformatted,
    templateMode: normalized.templateMode,
    media: normalized.media,
    targetMode: normalized.targetMode,
    targets: normalized.targets,
    total: normalized.targets.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    results: [],
    createdAt: now,
    startedAt: null,
    finishedAt: null,
  };
  writeJson(jobFile(job.id), job);
  return job;
}

export function readBroadcastJob(id) {
  return readJson(jobFile(id), null);
}

export function updateBroadcastJob(id, updater) {
  const file = jobFile(id);
  const current = readJson(file, null);
  if (!current) throw new Error(`Siaran ${id} tidak ditemukan`);
  const updated = typeof updater === "function"
    ? updater(structuredClone(current))
    : { ...current, ...updater };
  writeJson(file, updated);
  return updated;
}

export function listBroadcastJobs(limit = 20) {
  ensureDataDirectories();
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  return fs.readdirSync(JOBS_DIR)
    .filter(name => /^[a-f0-9-]{36}\.json$/i.test(name))
    .map(name => readJson(path.join(JOBS_DIR, name), null))
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, safeLimit);
}

export function countActiveBroadcastJobs() {
  return listBroadcastJobs(100)
    .filter(job => job.status === "queued" || job.status === "running")
    .length;
}

export function getNextBroadcastJob() {
  return listBroadcastJobs(100)
    .filter(job => job.status === "queued" || job.status === "running")
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0] || null;
}
