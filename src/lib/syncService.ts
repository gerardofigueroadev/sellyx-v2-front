import {
  getPendingOrders, markOrderSynced, incrementRetry, getPendingCount,
  getKitchenCompletedToSync, markKitchenCompleteSynced, getKitchenCompletedPendingCount,
  upsertServerKitchenOrder,
} from './db';
import { isTauri } from './isTauri';
import { captureEvent } from './analytics';

/** Evento que avisa a la cola de cocina que ingresaron pedidos nuevos (pull). */
export const KITCHEN_UPDATED_EVENT = 'sellyx:kitchen-updated';

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

      // 200 (creada o idempotente) y 409 (ya existe) → la orden YA está en el
      // server. Debemos marcarla synced SIEMPRE, aunque el parseo del body falle
      // (proxy/gateway devuelve algo no-JSON). Antes, un json() que lanzaba caía
      // al catch → incrementRetry y la venta quedaba atascada pese a existir.
      if (res.ok || res.status === 409) {
        let serverId: number | null = null;
        try {
          const saved = await res.json();
          serverId = saved?.id ?? null;
        } catch { /* body no-JSON: da igual, la orden existe */ }
        // Si no tenemos id del body, lo obtenemos por reconciliación (localId).
        if (serverId == null) {
          const found = await reconcileOneByLocalId(order.local_id, token, apiBase);
          serverId = found;
        }
        if (serverId != null) {
          await markOrderSynced(order.local_id, serverId);
        } else {
          // Raro: 2xx sin id resoluble. No la re-subimos (existe); dejamos que la
          // reconciliación del cierre la resuelva. Contamos el intento.
          await incrementRetry(order.local_id, 'ok-sin-id');
        }
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

/**
 * PULL de pedidos digitales (WhatsApp/web) del servidor hacia la cola de cocina
 * local. Complementa el sync push-only: estos pedidos NACEN en el servidor (link
 * público) y de otro modo nunca llegarían al POS. Idempotente (INSERT OR IGNORE
 * por PK chatbot-<id>). Al ingresar alguno nuevo, emite un evento para que la UI
 * de cocina se refresque. Solo Tauri (la cola vive en SQLite local).
 */
export async function pullKitchenOrders(
  getToken: () => Promise<string | null>,
  apiBase: string,
  isTauriEnv: boolean,
): Promise<void> {
  if (!navigator.onLine || !isTauriEnv) return;

  const token = await getToken();
  if (!token) return;

  // Sucursal activa: imprescindible para el ADMIN (su token no trae branchId, y
  // sin esto el endpoint devuelve []). El cajero la manda igual (el backend la
  // ignora y usa la de su token). NO enviamos `since`: el backend ya filtra por
  // pending + sucursal + canal digital, que es suficiente.
  const branchId = localStorage.getItem('pos_active_branch');
  try {
    const qs = branchId ? `?branchId=${encodeURIComponent(branchId)}` : '';
    const res = await fetch(`${apiBase}/orders/kitchen-pending${qs}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) { console.warn('[KITCHEN-PULL] HTTP', res.status); return; }
    const orders = await res.json();
    if (!Array.isArray(orders) || orders.length === 0) return;

    let inserted = 0;
    for (const o of orders) {
      try {
        const isNew = await upsertServerKitchenOrder(o);
        if (isNew) inserted++;
      } catch { /* un pedido corrupto no debe frenar el resto */ }
    }
    // Refrescamos la UI si trajimos pedidos (aunque rowsAffected no reporte
    // inserciones nuevas): garantiza que la cola se pinte tras el primer pull.
    if (inserted > 0 || orders.length > 0) {
      window.dispatchEvent(new CustomEvent(KITCHEN_UPDATED_EVENT));
    }
  } catch { /* red intermitente: la próxima vuelta reintenta */ }
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

/** Suma de pendientes locales: ventas sin crear + "Listo" sin replicar. */
async function countUnsynced(): Promise<number> {
  const create = await getPendingCount().catch(() => 0);
  const done = await getKitchenCompletedPendingCount().catch(() => 0);
  return create + done;
}

/**
 * RECONCILIACIÓN (solo Tauri): pregunta al server cuáles de las ventas del outbox
 * sin subir YA existen allí (por su localId) y las marca como sincronizadas sin
 * re-subir. Resuelve el atasco donde una venta ya guardada en el server queda
 * "pendiente de subir" para siempre (falló el parseo/markSynced tras un 200, o
 * el token expiró justo después de crearla). Devuelve cuántas reconcilió.
 * NUNCA lanza: si algo falla, no bloquea el flujo de cierre.
 */
/** Resuelve el server id de UN localId consultando /orders/reconcile. null si no existe. */
async function reconcileOneByLocalId(
  localId: string,
  token: string,
  apiBase: string,
): Promise<number | null> {
  try {
    const res = await fetch(`${apiBase}/orders/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ localIds: [localId] }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const rows: { localId: string; id: number }[] = await res.json();
    return Array.isArray(rows) && rows[0]?.id != null ? rows[0].id : null;
  } catch {
    return null;
  }
}

export async function reconcileOutbox(
  getToken: () => Promise<string | null>,
  apiBase: string,
): Promise<number> {
  if (!isTauri() || !navigator.onLine) return 0;
  try {
    const pending = await getPendingOrders();
    if (pending.length === 0) return 0;
    const token = await getToken();
    if (!token) { console.warn('[CAJA] reconcile: sin token, no se puede reconciliar'); return 0; }

    const localIds = pending.map(o => o.local_id);
    console.log(`[CAJA] reconcile: consultando al servidor por ${localIds.length} venta(s) sin subir…`);
    const res = await fetch(`${apiBase}/orders/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ localIds }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.warn(`[CAJA] reconcile: el servidor respondió HTTP ${res.status}`); return 0; }
    const existing: { localId: string; id: number }[] = await res.json();
    if (!Array.isArray(existing) || existing.length === 0) {
      console.log('[CAJA] reconcile: ninguna de esas ventas está en el servidor todavía');
      return 0;
    }

    let fixed = 0;
    for (const row of existing) {
      if (!row?.localId || row?.id == null) continue;
      try {
        await markOrderSynced(row.localId, row.id);
        fixed++;
      } catch (e) {
        console.warn(`[CAJA] reconcile: fallo al marcar ${row.localId} como subida:`, String(e));
      }
    }
    console.log(`[CAJA] reconcile: ${existing.length} ya estaban en el servidor → ${fixed} marcadas como subidas`);
    // Visibilidad remota: si reconcilió algo, es que hubo ventas "fantasma"
    // (ya en server pero mal marcadas). Saber cuántas y en qué versión ayuda a
    // detectar si el bug reaparece en algún cliente.
    if (fixed > 0) {
      captureEvent('caja_reconcile_desatascadas', { cantidad: fixed, consultadas: localIds.length });
    }
    return fixed;
  } catch (e) {
    console.warn('[CAJA] reconcile: error (no bloquea el cierre):', String(e));
    return 0; // reconciliación es best-effort; nunca bloquea
  }
}

/**
 * Drena la cola ANTES de cerrar caja: reconcilia contra el server, crea las
 * órdenes pendientes y envía los "Listo" (complete) que no replicaron. Devuelve
 * cuántos items quedan sin sincronizar. Si devuelve 0, es seguro cerrar caja.
 *
 * IMPORTANTE — sin falsos positivos con internet lento: no cortamos por reloj.
 * Mientras haya PROGRESO seguimos aunque la red esté lenta (cada request tiene su
 * timeout de 15s). Solo nos rendimos tras `maxStalls` vueltas sin bajar ni un
 * pendiente (conexión rota, no lenta). Nada se pierde: el estado ya está en SQLite.
 */
export async function drainBeforeShiftClose(
  getToken: () => Promise<string | null>,
  apiBase: string,
  maxStalls = 3,
): Promise<{ remaining: number; stalled: boolean }> {
  if (!isTauri()) return { remaining: 0, stalled: false }; // web sin outbox: nada que drenar

  // Atajo instantáneo: si no hay nada pendiente, cerrar de una (caso normal).
  let remaining = await countUnsynced();
  if (remaining === 0) { console.log('[CAJA] cierre: sin ventas pendientes, cerrando directo'); return { remaining: 0, stalled: false }; }

  console.log(`[CAJA] cierre: hay ${remaining} item(s) sin sincronizar antes de cerrar`);

  // Sin red declarada por el SO: no intentamos (evita esperas inútiles).
  if (!navigator.onLine) { console.warn('[CAJA] cierre: sin conexión, no se puede drenar ahora'); return { remaining, stalled: false }; }

  const tauri = true;
  let stalls = 0;

  // PRIMER PASO: reconciliar contra el server. Muchas veces las "pendientes de
  // subir" YA están en el server (fallo al marcar synced tras un 200). Esto las
  // desatasca de golpe sin re-subir, y a menudo deja remaining=0 sin drenar nada.
  await reconcileOutbox(getToken, apiBase).catch(() => {});
  remaining = await countUnsynced();
  if (remaining === 0) { console.log('[CAJA] cierre: todo reconciliado, ya se puede cerrar'); return { remaining: 0, stalled: false }; }
  console.log(`[CAJA] cierre: tras reconciliar quedan ${remaining} sin subir → intentando subirlas…`);

  // Sin límite de vueltas por tiempo: el freno es la falta de progreso.
  // Con progreso continuo, esto avanza hasta vaciar la cola por lenta que esté.
  while (remaining > 0 && stalls < maxStalls) {
    await syncPendingOrders(getToken, apiBase).catch(() => {});
    await syncPendingCompletes(getToken, apiBase, tauri).catch(() => {});
    // Nota: syncPendingOrders ya reconcilia por-orden ante un 2xx/409 sin id, así
    // que NO repetimos reconcileOutbox aquí (evita round-trips redundantes en una
    // red lenta durante el cierre). El reconcile inicial (antes del loop) cubre el
    // caso masivo de ventas ya-en-server.

    const after = await countUnsynced();
    if (after === 0) { console.log('[CAJA] cierre: todas las ventas subieron, ya se puede cerrar'); return { remaining: 0, stalled: false }; }

    // ¿Progresó? (bajó al menos 1). Si sí, reseteamos el contador de estancamiento.
    if (after < remaining) { console.log(`[CAJA] cierre: progreso ${remaining}→${after}`); stalls = 0; }
    else { stalls++; console.warn(`[CAJA] cierre: sin progreso (${after} atascadas), intento ${stalls}/${maxStalls}`); }

    remaining = after;
  }

  // Se estancó: varias vueltas sin bajar ni un pendiente → conexión rota, no lenta.
  console.warn(`[CAJA] cierre: no se pudieron subir ${remaining} venta(s) tras ${maxStalls} intentos`);
  // Visibilidad remota: el cierre quedó bloqueado por ventas que no suben. Es el
  // síntoma exacto del bug original — queremos saber si le pasa a algún cliente.
  captureEvent('caja_cierre_bloqueado', { ventas_sin_subir: remaining, online: navigator.onLine });
  return { remaining, stalled: stalls >= maxStalls };
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
    // Pull de pedidos WhatsApp/web hacia la cola de cocina (cada 30s, junto al ciclo).
    await pullKitchenOrders(getToken, apiBase, tauri).catch(() => {});
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
