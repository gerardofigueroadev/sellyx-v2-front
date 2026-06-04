import {
  getPendingOrders, markOrderSynced, incrementRetry, getPendingCount,
  getKitchenCompletedToSync, markKitchenCompleteSynced,
} from './db';
import { isTauri } from './isTauri';

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
let trySyncNow: (() => Promise<void>) | null = null;

/** Dispara un ciclo de sync inmediato si el servicio está corriendo. No-op si no. */
export function requestImmediateSync(): void {
  if (trySyncNow) { trySyncNow().catch(() => {}); }
}

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
        // Idempotencia: el backend devuelve la orden existente (200) en lugar
        // de 409, así que `saved.id` siempre es el server_id real.
        await markOrderSynced(order.local_id, saved.id);
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

/**
 * Sincroniza al backend los "complete" de cocina marcados localmente.
 * Fuente de verdad: SQLite outbox (kitchen_status='completed', kitchen_synced=0).
 * La UI nunca depende de esto — solo sirve para reflejar el cambio en la nube.
 */
export async function syncPendingCompletes(
  getToken: () => Promise<string | null>,
  apiBase: string,
  isTauriEnv: boolean,
): Promise<void> {
  if (!navigator.onLine || !isTauriEnv) return;

  let pending: Awaited<ReturnType<typeof getKitchenCompletedToSync>> = [];
  try { pending = await getKitchenCompletedToSync(); } catch { return; }
  if (pending.length === 0) return;

  const token = await getToken();
  if (!token) return;

  let confirmedThisCycle = 0;
  let reintented = 0;

  for (const item of pending) {
    if (!item.server_id || item.server_id <= 0) continue; // sanity
    try {
      const res = await fetch(`${apiBase}/orders/${item.server_id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15_000),
      });

      // 200/2xx/404/409 todos cuentan como confirmado — el server ya no
      // tiene que cambiar nada o ya lo hizo. Solo errores 5xx/red ameritan reintento.
      const confirmed = res.ok || res.status === 404 || res.status === 409;

      if (confirmed) {
        await markKitchenCompleteSynced(item.local_id);
        confirmedThisCycle++;
      } else {
        reintented++;
      }
    } catch {
      reintented++;
      // El loop seguirá; la próxima vuelta los reintentará.
    }
  }

  if (confirmedThisCycle + reintented > 0) {
    console.warn('[KITCHEN] sync: cycle summary', {
      pending: pending.length,
      confirmedThisCycle,
      reintented,
    });
  }
}

export async function syncPendingReorders(
  getToken: () => Promise<string | null>,
  apiBase: string,
): Promise<void> {
  if (!navigator.onLine) return;
  const raw = localStorage.getItem('pos_pending_reorders');
  if (!raw) return;
  let merged: Record<string, number>;
  try { merged = JSON.parse(raw); } catch { localStorage.removeItem('pos_pending_reorders'); return; }
  const ids = Object.keys(merged);
  if (ids.length === 0) { localStorage.removeItem('pos_pending_reorders'); return; }

  const token = await getToken();
  if (!token) return;

  const items = ids.map(id => ({ id: Number(id), sortOrder: merged[id] }));
  try {
    const res = await fetch(`${apiBase}/products/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) localStorage.removeItem('pos_pending_reorders');
  } catch { /* mantener para próximo intento */ }
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
    await syncPendingReorders(getToken, apiBase).catch(() => {});
  };

  trySyncNow = trySync;
  window.addEventListener('online', trySync);
  syncInterval = setInterval(trySync, 30_000);
  trySync();
}

export function stopSyncService(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  trySyncNow = null;
}
