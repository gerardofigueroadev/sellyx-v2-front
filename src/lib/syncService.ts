import { getPendingOrders, markOrderSynced, incrementRetry, getPendingCount, getServerIdForLocalId } from './db';
import { isTauri } from './isTauri';

interface PendingComplete {
  serverId?: number;
  localId?: string;
  completedAt: string;
}

export type SyncStatus = 'online' | 'offline' | 'syncing';

type StatusListener = (status: SyncStatus, pendingCount: number) => void;
const listeners = new Set<StatusListener>();

export function onSyncStatusChange(cb: StatusListener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function emit(status: SyncStatus, pending: number) {
  listeners.forEach(cb => cb(status, pending));
}

let isSyncing = false;
let syncInterval: ReturnType<typeof setInterval> | null = null;

export async function syncPendingOrders(
  getToken: () => Promise<string | null>,
  apiBase: string,
): Promise<void> {
  if (isSyncing || !navigator.onLine) return;

  const pending = await getPendingOrders();
  if (pending.length === 0) return;

  isSyncing = true;
  emit('syncing', pending.length);

  const token = await getToken();
  if (!token) {
    isSyncing = false;
    emit('offline', pending.length);
    return;
  }

  for (const order of pending) {
    try {
      const payload = JSON.parse(order.payload);
      const res = await fetch(`${apiBase}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });

      if (res.ok) {
        const saved = await res.json();
        await markOrderSynced(order.local_id, saved.id);
      } else if (res.status === 409) {
        // El servidor ya tiene esta orden (idempotencia) — marcarla como sincronizada
        await markOrderSynced(order.local_id, -1);
      } else {
        await incrementRetry(order.local_id, `HTTP ${res.status}`);
      }
    } catch (e) {
      await incrementRetry(order.local_id, String(e));
    }
  }

  isSyncing = false;
  const remaining = await getPendingCount();
  emit(navigator.onLine ? 'online' : 'offline', remaining);
}

export async function syncPendingCompletes(
  getToken: () => Promise<string | null>,
  apiBase: string,
  isTauri: boolean,
): Promise<void> {
  if (!navigator.onLine) return;
  const raw = localStorage.getItem('pos_pending_completes');
  if (!raw) return;
  let queue: PendingComplete[];
  try { queue = JSON.parse(raw); } catch { localStorage.removeItem('pos_pending_completes'); return; }
  if (queue.length === 0) { localStorage.removeItem('pos_pending_completes'); return; }

  const token = await getToken();
  if (!token) return;

  const remaining: PendingComplete[] = [];
  for (const item of queue) {
    let serverId = item.serverId;

    // Si solo hay localId, buscar su serverId en el outbox (debe estar ya sincronizado)
    if (!serverId && item.localId && isTauri) {
      try {
        const sid = await getServerIdForLocalId(item.localId);
        if (sid && sid > 0) serverId = sid;
      } catch { /* ignore */ }
    }

    // Sin serverId todavía → la orden aún no se sincronizó, esperar siguiente ciclo
    if (!serverId) { remaining.push(item); continue; }

    try {
      const res = await fetch(`${apiBase}/orders/${serverId}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });
      // 404/409 = orden no existe o ya completada → drop
      if (!res.ok && res.status !== 404 && res.status !== 409) {
        remaining.push(item);
      }
    } catch {
      remaining.push(item);
    }
  }

  if (remaining.length === 0) localStorage.removeItem('pos_pending_completes');
  else localStorage.setItem('pos_pending_completes', JSON.stringify(remaining));
}

export async function syncPendingSettings(
  getToken: () => Promise<string | null>,
  apiBase: string,
): Promise<void> {
  if (!navigator.onLine) return;
  const raw = localStorage.getItem('pos_pending_settings_patch');
  if (!raw) return;
  let patch: any;
  try { patch = JSON.parse(raw); } catch { localStorage.removeItem('pos_pending_settings_patch'); return; }
  if (!patch || Object.keys(patch).length === 0) { localStorage.removeItem('pos_pending_settings_patch'); return; }

  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`${apiBase}/organizations/my/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) localStorage.removeItem('pos_pending_settings_patch');
  } catch { /* mantener para próximo intento */ }
}

export function startSyncService(
  getToken: () => Promise<string | null>,
  apiBase: string,
): void {
  const tauri = isTauri();
  const trySync = async () => {
    // Orden importante: 1) crear órdenes pendientes (para obtener server_id)
    //                   2) luego sincronizar completes (que pueden depender de esos server_id)
    //                   3) settings en paralelo
    await syncPendingOrders(getToken, apiBase).catch(() => {});
    await syncPendingCompletes(getToken, apiBase, tauri).catch(() => {});
    await syncPendingSettings(getToken, apiBase).catch(() => {});
  };

  window.addEventListener('online', trySync);
  syncInterval = setInterval(trySync, 30_000);
  trySync();
}

export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
