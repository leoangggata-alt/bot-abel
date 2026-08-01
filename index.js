import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import pino from "pino";
import qrcode from "qrcode-terminal";
import QRCode from "qrcode";
import { Boom } from "@hapi/boom";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { handleMessage, handleGroupUpdate } from "./src/handler.js";
import { getApiKeyCandidates } from "./src/api-key-store.js";
import {
  processNextBroadcastJob,
  syncParticipatingGroups,
} from "./src/broadcast.js";
import { markGroupDirectoryDisconnected } from "./src/broadcast-store.js";
import {
  consumeBotControlRequests,
  getBotProfile,
  getBotProfiles,
  updateBotStatus,
} from "./src/bot-profile-store.js";
import { getHostMode } from "./src/host-mode-store.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const logger = pino({ level: "silent" });
const botPrefix = process.env.BOT_PREFIX ||
  (process.env.PREFIX?.length <= 3 ? process.env.PREFIX : "!");
const baileysVersionPromise = fetchLatestBaileysVersion();
const runtimes = new Map();
let shuttingDown = false;
let broadcastPollTimer = null;
let groupSyncTimer = null;
let broadcastWorkerBusy = false;
let botControlTimer = null;
let hostRoleTimer = null;
let appliedHostRole = null;
let hostRoleBusy = false;

function isHostPrimary() {
  return getHostMode().role === "primary";
}

function createRuntime(profileId) {
  const runtime = {
    profileId,
    socket: null,
    reconnectTimer: null,
    reconnectAttempt: 0,
    pairingRequestedGeneration: -1,
    connecting: false,
    generation: 0,
    recentMessageIds: new Set(),
    recentMessageOrder: [],
  };
  runtimes.set(profileId, runtime);
  return runtime;
}

function getRuntime(profileId) {
  return runtimes.get(profileId) || createRuntime(profileId);
}

function isDuplicateMessage(runtime, id) {
  if (!id) return false;
  if (runtime.recentMessageIds.has(id)) return true;
  runtime.recentMessageIds.add(id);
  runtime.recentMessageOrder.push(id);
  if (runtime.recentMessageOrder.length > 1000) {
    runtime.recentMessageIds.delete(runtime.recentMessageOrder.shift());
  }
  return false;
}

function stopBroadcastServices() {
  if (broadcastPollTimer) clearInterval(broadcastPollTimer);
  if (groupSyncTimer) clearInterval(groupSyncTimer);
  broadcastPollTimer = null;
  groupSyncTimer = null;
}

async function runBroadcastWorker(sock) {
  if (broadcastWorkerBusy || shuttingDown) return;
  const abelRuntime = runtimes.get("abel");
  if (abelRuntime?.socket !== sock) return;
  broadcastWorkerBusy = true;
  try {
    await processNextBroadcastJob(sock);
  } catch (error) {
    console.error(`[Broadcast Grup] Pekerja gagal: ${error.message}`);
  } finally {
    broadcastWorkerBusy = false;
  }
}

function startBroadcastServices(sock) {
  stopBroadcastServices();
  syncParticipatingGroups(sock)
    .then(directory => console.log(`[Broadcast Grup] ${directory.groups.length} grup tersedia di panel`))
    .catch(error => console.error(`[Broadcast Grup] Gagal memuat grup: ${error.message}`));
  broadcastPollTimer = setInterval(() => runBroadcastWorker(sock), 2000);
  groupSyncTimer = setInterval(() => {
    const abelRuntime = runtimes.get("abel");
    if (abelRuntime?.socket !== sock || shuttingDown) return;
    syncParticipatingGroups(sock).catch(error => {
      console.error(`[Broadcast Grup] Gagal memperbarui grup: ${error.message}`);
    });
  }, 60000);
  broadcastPollTimer.unref?.();
  groupSyncTimer.unref?.();
}

function scheduleReconnect(runtime) {
  if (shuttingDown || runtime.reconnectTimer || !isHostPrimary()) return;
  const profile = getBotProfile(runtime.profileId);
  if (!profile?.enabled) return;
  const delayMs = Math.min(30000, 2000 * 2 ** runtime.reconnectAttempt);
  runtime.reconnectAttempt += 1;
  updateBotStatus(runtime.profileId, {
    state: "reconnecting",
    connected: false,
    message: `Menghubungkan ulang dalam ${Math.ceil(delayMs / 1000)} detik`,
  });
  runtime.reconnectTimer = setTimeout(() => {
    runtime.reconnectTimer = null;
    connectBot(runtime.profileId).catch(error => {
      console.error(`[${profile.name}] Gagal reconnect: ${error.message}`);
      scheduleReconnect(runtime);
    });
  }, delayMs);
}

async function restartBot(profileId) {
  const runtime = getRuntime(profileId);
  runtime.generation += 1;
  if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
  runtime.reconnectTimer = null;
  runtime.reconnectAttempt = 0;
  runtime.pairingRequestedGeneration = -1;
  runtime.connecting = false;
  const oldSocket = runtime.socket;
  runtime.socket = null;
  if (profileId === "abel") {
    stopBroadcastServices();
    markGroupDirectoryDisconnected();
  }
  try {
    oldSocket?.end(new Error(`Restart ${profileId} dari panel`));
  } catch {
    // Socket lama boleh sudah tertutup.
  }

  const profile = getBotProfile(profileId);
  if (!isHostPrimary()) {
    updateBotStatus(profileId, {
      state: "standby",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: `${profile?.name || profileId} standby di host ini`,
    });
    return;
  }
  if (!profile?.enabled) {
    updateBotStatus(profileId, {
      state: "disabled",
      connected: false,
      pairingCode: "",
      message: `${profile?.name || profileId} dinonaktifkan dari panel`,
    });
    return;
  }
  await connectBot(profileId);
}

function startBotControlService() {
  if (botControlTimer) clearInterval(botControlTimer);
  botControlTimer = setInterval(async () => {
    const requests = consumeBotControlRequests();
    const profileIds = [...new Set(
      requests.filter(item => item.action === "restart").map(item => item.id),
    )];
    for (const profileId of profileIds) {
      try {
        await restartBot(profileId);
      } catch (error) {
        console.error(`[${profileId}] Restart dari panel gagal: ${error.message}`);
      }
    }
  }, 2000);
  botControlTimer.unref?.();
}

async function requestPairingCode(sock, runtime, profile, registered, generation) {
  const number = profile.id === "abel"
    ? profile.pairingNumber || String(process.env.PAIRING_NUMBER || "").replace(/\D/g, "")
    : profile.pairingNumber;
  if (profile.linkMethod !== "code" || registered || !number) return;
  if (runtime.pairingRequestedGeneration === generation) return;
  runtime.pairingRequestedGeneration = generation;
  try {
    const code = await sock.requestPairingCode(number);
    const readableCode = code?.match(/.{1,4}/g)?.join("-") || code;
    updateBotStatus(profile.id, {
      state: "waiting_pairing",
      connected: false,
      pairingCode: readableCode,
      qrAvailable: false,
      message: `Masukkan kode pairing untuk ${profile.name}`,
    });
    console.log(`\n[${profile.name}] KODE PAIRING: ${readableCode}`);
    console.log("WhatsApp > Perangkat tertaut > Tautkan dengan nomor telepon\n");
  } catch (error) {
    updateBotStatus(profile.id, {
      state: "pairing_error",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: error.message,
    });
    console.error(`[${profile.name}] Gagal meminta pairing code: ${error.message}`);
  }
}

async function connectBot(profileId) {
  const profile = getBotProfile(profileId);
  const runtime = getRuntime(profileId);
  if (!profile?.enabled || shuttingDown || runtime.connecting || !isHostPrimary()) return null;

  runtime.connecting = true;
  runtime.generation += 1;
  const generation = runtime.generation;
  updateBotStatus(profileId, {
    state: "connecting",
    connected: false,
    pairingCode: "",
    qrAvailable: false,
    message: `Menghubungkan ${profile.name} ke WhatsApp`,
  });

  try {
    const sessionDirectory = profileId === "abel" ? "./session" : `./session-${profileId}`;
    const qrImagePath = join(__dirname, profileId === "abel" ? "qrcode.png" : `qrcode-${profileId}.png`);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDirectory);
    const { version } = await baileysVersionPromise;
    const sock = makeWASocket({
      version,
      logger,
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, logger),
      },
      printQRInTerminal: false,
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      getMessage: async () => ({ conversation: "" }),
      browser: [`${profile.name} by ABEL-LAB`, "Chrome", "120.0.0"],
    });
    runtime.socket = sock;
    runtime.connecting = false;

    console.log(`[${profile.name}] Baileys ${version.join(".")} — menghubungkan...`);
    sock.ev.on("connection.update", async update => {
      if (runtime.generation !== generation) return;
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        if (profile.linkMethod === "code") {
          updateBotStatus(profileId, {
            state: "preparing_pairing",
            connected: false,
            pairingCode: "",
            qrAvailable: false,
            message: `Menyiapkan kode pairing untuk ${profile.name}`,
          });
          await requestPairingCode(sock, runtime, profile, state.creds.registered, generation);
        } else {
          console.log(`[${profile.name}] QR tersedia untuk dipindai`);
          qrcode.generate(qr, { small: true });
          updateBotStatus(profileId, {
            state: "waiting_qr",
            connected: false,
            pairingCode: "",
            qrAvailable: true,
            message: `Pindai QR untuk menghubungkan ${profile.name}`,
          });
          QRCode.toFile(qrImagePath, qr, {
            color: { dark: "#000000", light: "#FFFFFF" },
            width: 400,
            margin: 2,
          }).catch(error => console.error(`[${profile.name}] Gagal menyimpan QR: ${error.message}`));
        }
      }

      if (connection === "close") {
        const statusCode = lastDisconnect?.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : "unknown";
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut && isHostPrimary();
        runtime.socket = null;
        if (profileId === "abel") {
          stopBroadcastServices();
          markGroupDirectoryDisconnected();
        }
        updateBotStatus(profileId, {
          state: shouldReconnect ? "reconnecting" : "logged_out",
          connected: false,
          pairingCode: "",
          qrAvailable: false,
          message: shouldReconnect
            ? `Koneksi terputus (${statusCode}), mencoba kembali`
            : "Sesi keluar; tautkan ulang dari panel",
        });
        console.warn(`[${profile.name}] Koneksi tertutup | status=${statusCode}`);
        if (shouldReconnect) scheduleReconnect(runtime);
      }

      if (connection === "open") {
        runtime.reconnectAttempt = 0;
        const number = sock.user?.id?.split(":")[0] || "";
        updateBotStatus(profileId, {
          state: "connected",
          connected: true,
          number,
          pairingCode: "",
          qrAvailable: false,
          message: `${profile.name} aktif dan siap menerima pesan`,
        });
        console.log(`\n✅ ${profile.name.toUpperCase()} TERHUBUNG — ${number}`);
        console.log(`📌 Grup: !${profile.command} [pesan]${profileId === "abel" ? " atau command ! biasa" : ""}`);
        if (profileId === "abel") startBroadcastServices(sock);
        const openaiKeys = getApiKeyCandidates("openai").length;
        const geminiKeys = getApiKeyCandidates("gemini").length;
        const groqKeys = getApiKeyCandidates("groq").length;
        console.log(`[${profile.name}] API bersama — OpenAI ${openaiKeys}, Gemini ${geminiKeys}, Groq ${groqKeys}`);
      }
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("messages.upsert", async upsert => {
      if (runtime.generation !== generation) return;
      try {
        const { messages, type } = upsert;
        if (type !== "notify" && type !== "append") return;
        for (const msg of messages) {
          const messageTimeMs = Number(msg.messageTimestamp || 0) * 1000;
          if (type === "append" && messageTimeMs > 0 && Date.now() - messageTimeMs > 120000) continue;
          if (isDuplicateMessage(runtime, msg.key.id)) continue;
          if (msg.key.remoteJid === "status@broadcast") continue;

          const normalizedContent = normalizeMessageContent(msg.message);
          const normalizedMsg = normalizedContent ? { ...msg, message: normalizedContent } : msg;
          const from = normalizedMsg.key.remoteJid;
          const text = normalizedMsg.message?.conversation ||
            normalizedMsg.message?.extendedTextMessage?.text ||
            normalizedMsg.message?.imageMessage?.caption || "(non-text)";
          console.log(`[${profile.name}] ${from?.endsWith("@g.us") ? "Grup" : "Personal"} | ${from} | "${text}"`);
          await handleMessage(sock, normalizedMsg, getBotProfile(profileId) || profile);
        }
      } catch (error) {
        console.error(`[${profile.name}] Pesan gagal:`, error?.stack || error);
      }
    });

    if (profileId === "abel") {
      sock.ev.on("group-participants.update", async update => {
        try {
          await handleGroupUpdate(sock, [update]);
        } catch (error) {
          console.error(`[${profile.name}] Update grup gagal: ${error.message}`);
        }
      });
    }

    return sock;
  } catch (error) {
    runtime.connecting = false;
    updateBotStatus(profileId, {
      state: "error",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: error.message,
    });
    throw error;
  }
}

async function activateHost() {
  const profiles = getBotProfiles();
  console.log(`[HOST] PRIMARY aktif di ${getHostMode().hostName}`);
  for (const profile of Object.values(profiles)) {
    if (!profile.enabled) {
      updateBotStatus(profile.id, {
        state: "disabled",
        connected: false,
        message: `${profile.name} dinonaktifkan dari panel`,
      });
      continue;
    }
    connectBot(profile.id).catch(error => {
      console.error(`[${profile.name}] Gagal memulai: ${error.message}`);
      scheduleReconnect(getRuntime(profile.id));
    });
  }
}

function deactivateHost() {
  const profiles = getBotProfiles();
  console.log(`[HOST] STANDBY aktif di ${getHostMode().hostName}; socket WhatsApp dihentikan`);
  stopBroadcastServices();
  markGroupDirectoryDisconnected();
  for (const [profileId, runtime] of runtimes.entries()) {
    runtime.generation += 1;
    runtime.connecting = false;
    if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
    const oldSocket = runtime.socket;
    runtime.socket = null;
    try {
      oldSocket?.end(new Error("Host dialihkan ke standby"));
    } catch {
      // Socket mungkin sudah tertutup.
    }
    const profile = profiles[profileId];
    updateBotStatus(profileId, {
      state: "standby",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: `${profile?.name || profileId} standby di host ini`,
    });
  }
  for (const profile of Object.values(profiles)) {
    if (runtimes.has(profile.id)) continue;
    updateBotStatus(profile.id, {
      state: "standby",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: `${profile.name} standby di host ini`,
    });
  }
}

async function applyHostRole(force = false) {
  if (hostRoleBusy || shuttingDown) return;
  const role = getHostMode().role;
  if (!force && role === appliedHostRole) return;
  hostRoleBusy = true;
  appliedHostRole = role;
  try {
    if (role === "primary") await activateHost();
    else deactivateHost();
  } finally {
    hostRoleBusy = false;
  }
}

async function startRuntimeServices() {
  startBotControlService();
  await applyHostRole(true);
  hostRoleTimer = setInterval(() => {
    applyHostRole().catch(error => console.error(`[HOST] Gagal menerapkan mode: ${error.message}`));
  }, 2000);
  hostRoleTimer.unref?.();
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopBroadcastServices();
  if (botControlTimer) clearInterval(botControlTimer);
  botControlTimer = null;
  if (hostRoleTimer) clearInterval(hostRoleTimer);
  hostRoleTimer = null;
  markGroupDirectoryDisconnected();
  for (const runtime of runtimes.values()) {
    if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    runtime.generation += 1;
    try {
      runtime.socket?.end(new Error(`Shutdown ${signal}`));
    } catch {
      // Socket mungkin sudah tertutup.
    }
    updateBotStatus(runtime.profileId, {
      state: "offline",
      connected: false,
      pairingCode: "",
      qrAvailable: false,
      message: `Bot dihentikan (${signal})`,
    });
  }
  setTimeout(() => process.exit(0), 1000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startRuntimeServices().catch(error => {
  console.error("Gagal memulai bot:", error.message);
  process.exitCode = 1;
});
