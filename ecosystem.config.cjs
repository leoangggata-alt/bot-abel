const path = require("path");
const fs = require("fs");
// .env adalah sumber konfigurasi utama. Override mencegah PM2 mempertahankan
// nilai owner/API lama setelah file konfigurasi diperbarui.
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });

const logsDir = path.join(__dirname, "logs");
fs.mkdirSync(logsDir, { recursive: true });

const common = {
  cwd: __dirname,
  autorestart: true,
  restart_delay: 5000,
  exp_backoff_restart_delay: 100,
  max_restarts: 20,
  min_uptime: "10s",
  time: true,
  max_memory_restart: "450M",
  kill_timeout: 10000,
};

const apps = [
  {
    ...common,
    name: "abel-bot",
    script: "index.js",
    out_file: path.join(logsDir, "bot.log"),
    error_file: path.join(logsDir, "bot-error.log"),
    stop_exit_codes: [0, 10],
  },
  {
    ...common,
    name: "abel-admin",
    script: "admin-server.js",
    out_file: path.join(logsDir, "admin.log"),
    error_file: path.join(logsDir, "admin-error.log"),
  },
];

if (String(process.env.ENABLE_TUNNEL).toLowerCase() === "true") {
  apps.push({
    ...common,
    name: "abel-tunnel",
    script: "tunnel-runner.js",
    out_file: path.join(logsDir, "tunnel.log"),
    error_file: path.join(logsDir, "tunnel-error.log"),
  });
}

module.exports = { apps };
