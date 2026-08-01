import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST_MODE_FILE = path.join(__dirname, "../data/host-mode.json");

export const HOST_ROLES = Object.freeze(["primary", "standby"]);

export function normalizeHostRole(value, fallback = "primary") {
  const normalized = String(value || "").trim().toLowerCase();
  return HOST_ROLES.includes(normalized) ? normalized : fallback;
}

function readStoredMode() {
  try {
    return JSON.parse(fs.readFileSync(HOST_MODE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function detectPlatform() {
  if (process.env.TERMUX_VERSION || String(process.env.PREFIX || "").includes("com.termux")) {
    return "termux";
  }
  if (process.platform === "win32") return "windows";
  return process.platform;
}

export function getHostMode() {
  const stored = readStoredMode();
  const environmentRole = normalizeHostRole(process.env.BOT_HOST_ROLE, "primary");
  const platform = detectPlatform();
  return {
    role: normalizeHostRole(stored.role, environmentRole),
    platform,
    hostName: String(process.env.BOT_HOST_NAME || os.hostname() || platform).slice(0, 80),
    updatedAt: stored.updatedAt || null,
  };
}

export function setHostRole(role) {
  const normalizedRole = normalizeHostRole(role, "");
  if (!HOST_ROLES.includes(normalizedRole)) {
    const error = new Error("Mode host harus primary atau standby");
    error.status = 400;
    throw error;
  }
  const next = {
    role: normalizedRole,
    updatedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(HOST_MODE_FILE), { recursive: true });
  fs.writeFileSync(HOST_MODE_FILE, JSON.stringify(next, null, 2), "utf8");
  return getHostMode();
}
