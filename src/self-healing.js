export const SELF_REPAIR_CONNECT_TIMEOUT_MS = 90_000;
export const SELF_REPAIR_COOLDOWN_MS = 60_000;

export function assessRuntimeHealth(state = {}, now = Date.now()) {
  if (!state.hostPrimary || !state.enabled || state.connected || state.pairingPending) {
    return { action: "none", reason: "runtime tidak membutuhkan pemulihan" };
  }

  const lastRecoveryAt = Number(state.lastRecoveryAt || 0);
  if (lastRecoveryAt > 0 && now - lastRecoveryAt < SELF_REPAIR_COOLDOWN_MS) {
    return { action: "none", reason: "pemulihan masih dalam masa jeda" };
  }

  const startedAt = Number(state.connectionStartedAt || 0);
  const elapsed = startedAt > 0 ? now - startedAt : Number.POSITIVE_INFINITY;
  if (state.connecting && elapsed <= SELF_REPAIR_CONNECT_TIMEOUT_MS) {
    return { action: "none", reason: "proses koneksi masih dalam batas waktu" };
  }

  if (state.reconnectScheduled) {
    return { action: "none", reason: "reconnect sudah dijadwalkan" };
  }

  if (!state.socketPresent) {
    return { action: "reconnect", reason: "socket hilang tanpa jadwal reconnect" };
  }

  if (elapsed > SELF_REPAIR_CONNECT_TIMEOUT_MS) {
    return { action: "restart", reason: "socket macet sebelum tersambung" };
  }

  return { action: "none", reason: "menunggu status koneksi" };
}
