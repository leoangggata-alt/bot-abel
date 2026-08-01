// Pengiriman pesan massal dan pekerja antrean siaran panel admin.
import dotenv from "dotenv";
import {
  getNextBroadcastJob,
  saveGroupDirectory,
  updateBroadcastJob,
} from "./broadcast-store.js";

dotenv.config();

const BISNIS = process.env.BUSINESS_NAME || "Toko Kami";

export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function formatGroupBroadcastMessage(message) {
  return `📢 *${BISNIS}*\n\n${String(message || "").trim()}`;
}

export async function syncParticipatingGroups(sock) {
  const chats = await sock.groupFetchAllParticipating();
  const groups = Object.entries(chats || {}).map(([id, metadata]) => ({
    id,
    name: metadata?.subject || "Grup WhatsApp",
    participantCount: metadata?.participants?.length || 0,
    announce: Boolean(metadata?.announce),
  }));
  return saveGroupDirectory(groups, true);
}

export async function sendBroadcastToGroups(sock, targets, message, options = {}) {
  const delayMs = Math.max(0, Number(options.delayMs ?? 1500));
  const onProgress = typeof options.onProgress === "function"
    ? options.onProgress
    : async () => {};
  const results = [];
  const content = formatGroupBroadcastMessage(message);

  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    let result;
    try {
      await sock.sendMessage(target.id, { text: content });
      result = {
        groupId: target.id,
        groupName: target.name,
        status: "success",
        sentAt: new Date().toISOString(),
      };
      console.log(`[Broadcast Grup] ✅ ${target.name}`);
    } catch (error) {
      result = {
        groupId: target.id,
        groupName: target.name,
        status: "failed",
        error: String(error?.message || "Pengiriman gagal").slice(0, 300),
        sentAt: new Date().toISOString(),
      };
      console.error(`[Broadcast Grup] ❌ ${target.name}: ${result.error}`);
    }
    results.push(result);
    await onProgress(result, results);
    if (delayMs > 0 && index < targets.length - 1) await delay(delayMs);
  }

  return results;
}

export async function processNextBroadcastJob(sock, options = {}) {
  const job = getNextBroadcastJob();
  if (!job) return null;

  const previousResults = Array.isArray(job.results) ? job.results : [];
  const completedIds = new Set(previousResults.map(result => result.groupId));
  const pendingTargets = (job.targets || []).filter(target => !completedIds.has(target.id));
  let latest = updateBroadcastJob(job.id, current => ({
    ...current,
    status: "running",
    startedAt: current.startedAt || new Date().toISOString(),
    finishedAt: null,
  }));

  console.log(`[Broadcast Grup] Memproses ${job.id} ke ${pendingTargets.length} grup tersisa...`);

  try {
    await sendBroadcastToGroups(sock, pendingTargets, job.message, {
      delayMs: options.delayMs,
      onProgress: async result => {
        latest = updateBroadcastJob(job.id, current => {
          const results = [...(current.results || []), result];
          const succeeded = results.filter(item => item.status === "success").length;
          const failed = results.filter(item => item.status === "failed").length;
          return {
            ...current,
            results,
            processed: results.length,
            succeeded,
            failed,
          };
        });
      },
    });

    latest = updateBroadcastJob(job.id, current => {
      const succeeded = (current.results || []).filter(item => item.status === "success").length;
      const failed = (current.results || []).filter(item => item.status === "failed").length;
      const status = failed === 0 ? "completed" : succeeded === 0 ? "failed" : "partial";
      return {
        ...current,
        status,
        processed: (current.results || []).length,
        succeeded,
        failed,
        finishedAt: new Date().toISOString(),
      };
    });
  } catch (error) {
    latest = updateBroadcastJob(job.id, current => ({
      ...current,
      status: "failed",
      error: String(error?.message || "Pekerja siaran gagal").slice(0, 500),
      finishedAt: new Date().toISOString(),
    }));
  }

  console.log(
    `[Broadcast Grup] Selesai ${job.id}: ${latest.succeeded} berhasil, ${latest.failed} gagal`,
  );
  return latest;
}

// Kompatibilitas untuk pemanggilan lama dari kode lain.
export async function broadcastKeGrup(sock, pesan) {
  const directory = await syncParticipatingGroups(sock);
  return sendBroadcastToGroups(sock, directory.groups, pesan);
}

export async function broadcastPesan(sock, numbers, pesan) {
  const results = [];
  const content = `📢 *Pesan dari ${BISNIS}*\n\n${pesan}\n\n_Balas STOP untuk berhenti menerima pesan_`;
  for (const number of numbers) {
    const jid = `${number}@s.whatsapp.net`;
    try {
      await sock.sendMessage(jid, { text: content });
      results.push({ number, status: "success" });
    } catch (error) {
      results.push({ number, status: "failed", error: error.message });
    }
    await delay(1000);
  }
  return {
    total: results.length,
    sukses: results.filter(item => item.status === "success").length,
    gagal: results.filter(item => item.status === "failed").length,
    detail: results,
  };
}

export async function notifOrder(sock, phoneNumber, orderData) {
  const jid = `${phoneNumber}@s.whatsapp.net`;
  const pesan =
    `✅ *Konfirmasi Pesanan*\n\n` +
    `Halo ${orderData.nama}!\n\n` +
    `📋 No. Order: *${orderData.orderId}*\n` +
    `🛍️ Produk: ${orderData.produk}\n` +
    `💰 Total: Rp ${Number(orderData.total).toLocaleString("id-ID")}\n` +
    `📦 Status: ${orderData.status}\n\n` +
    `Cek status: *!order ${orderData.orderId}*\n` +
    `Terima kasih telah berbelanja! 🙏`;
  await sock.sendMessage(jid, { text: pesan });
}
