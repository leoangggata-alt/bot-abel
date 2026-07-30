import { spawn } from "child_process";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const projectDir = dirname(fileURLToPath(import.meta.url));
const logsDir = join(projectDir, "logs");
const urlFile = join(logsDir, "admin-url.txt");
const port = Number.parseInt(process.env.ADMIN_PORT || "8080", 10);
const adminPassword = process.env.ADMIN_PASSWORD || "";

let child = null;
let stopping = false;
let retryTimer = null;

mkdirSync(logsDir, { recursive: true });

if (!adminPassword) {
  console.error(
    "ADMIN_PASSWORD wajib diisi sebelum ENABLE_TUNNEL=true. Tunnel tidak dijalankan.",
  );
  process.exit(10);
}

function removeOldUrl() {
  if (existsSync(urlFile)) unlinkSync(urlFile);
}

function startTunnel() {
  removeOldUrl();
  console.log(`Membuka Cloudflare Tunnel ke http://127.0.0.1:${port}`);

  child = spawn(
    "cloudflared",
    [
      "tunnel",
      "--url",
      `http://127.0.0.1:${port}`,
      "--no-autoupdate",
    ],
    {
      cwd: projectDir,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  const handleOutput = (data) => {
    const output = data.toString();
    process.stdout.write(output);
    const match = output.match(
      /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i,
    );
    if (match) {
      writeFileSync(urlFile, `${match[0]}\n`, "utf8");
      console.log(`URL admin aktif: ${match[0]}`);
    }
  };

  child.stdout.on("data", handleOutput);
  child.stderr.on("data", handleOutput);

  child.on("error", (error) => {
    console.error(`Gagal menjalankan cloudflared: ${error.message}`);
  });

  child.on("exit", (code, signal) => {
    child = null;
    removeOldUrl();
    if (stopping) return;
    console.error(
      `Cloudflare Tunnel berhenti (code=${code}, signal=${signal}); mencoba lagi dalam 10 detik.`,
    );
    retryTimer = setTimeout(startTunnel, 10000);
  });
}

function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  if (retryTimer) clearTimeout(retryTimer);
  removeOldUrl();
  console.log(`Menerima ${signal}; menghentikan tunnel.`);
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => child?.kill("SIGKILL"), 5000).unref();
  }
  setTimeout(() => process.exit(0), 5500).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startTunnel();
