import { getPendingOrders, markOrderSynced, incrementRetry, getPendingCount } from './db';

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

export function startSyncService(
  getToken: () => Promise<string | null>,
  apiBase: string,
): void {
  const trySync = () => syncPendingOrders(getToken, apiBase).catch(() => {});

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
