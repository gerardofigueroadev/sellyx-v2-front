import Database from '@tauri-apps/plugin-sql';

/**
 * Outbox local-first. La columna `kitchen_status` y `kitchen_synced` hacen del
 * SQLite local la fuente de verdad para la cola de cocina — la UI nunca espera
 * al servidor para reflejar un cambio de status.
 */
export interface OutboxOrder {
  local_id: string;
  payload: string;
  created_at: number;
  synced: number;
  server_id: number | null;
  retry_count: number;
  last_error: string | null;
  kitchen_status: 'pending' | 'completed' | 'cancelled';
  kitchen_completed_at: number | null;
  kitchen_synced: number;
}

let _db: Database | null = null;

async function ensureColumn(db: Database, table: string, column: string, ddl: string): Promise<void> {
  const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
  if (!cols.some(c => c.name === column)) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load('sqlite:sellyx.db');
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS orders_outbox (
      local_id              TEXT PRIMARY KEY,
      payload               TEXT NOT NULL,
      created_at            INTEGER NOT NULL,
      synced                INTEGER DEFAULT 0,
      server_id             INTEGER,
      retry_count           INTEGER DEFAULT 0,
      last_error            TEXT,
      kitchen_status        TEXT NOT NULL DEFAULT 'pending',
      kitchen_completed_at  INTEGER,
      kitchen_synced        INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Detectar si las columnas de cocina ya existían ANTES de agregarlas.
  // Si no existían, estamos en una migración de un esquema viejo → hay que
  // tratar las órdenes históricas como ya completadas para que NO inunden la
  // cola de cocina con tickets de hace días/semanas.
  const colsBefore = await _db.select<{ name: string }[]>(`PRAGMA table_info(orders_outbox)`);
  const isFreshMigration = !colsBefore.some(c => c.name === 'kitchen_status');

  await ensureColumn(_db, 'orders_outbox', 'kitchen_status', `kitchen_status TEXT NOT NULL DEFAULT 'pending'`);
  await ensureColumn(_db, 'orders_outbox', 'kitchen_completed_at', `kitchen_completed_at INTEGER`);
  await ensureColumn(_db, 'orders_outbox', 'kitchen_synced', `kitchen_synced INTEGER NOT NULL DEFAULT 0`);

  // CRÍTICO: tras agregar la columna `kitchen_status` con DEFAULT 'pending',
  // TODAS las filas existentes (incluyendo órdenes ya completadas hace días)
  // quedan marcadas como pendientes. Esto rompe al cliente: la cola de cocina
  // se llena de tickets viejos. Las marcamos como ya completadas + sincronizadas
  // para que no aparezcan ni reintenten PATCH a la nube.
  if (isFreshMigration) {
    await _db.execute(
      `UPDATE orders_outbox
          SET kitchen_status = 'completed',
              kitchen_synced = 1,
              kitchen_completed_at = COALESCE(kitchen_completed_at, created_at)
        WHERE kitchen_completed_at IS NULL`
    );
  }

  return _db;
}

export async function saveOrderToOutbox(localId: string, payload: object): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO orders_outbox (local_id, payload, created_at) VALUES (?, ?, ?)',
    [localId, JSON.stringify(payload), Date.now()],
  );
}

/**
 * Siguiente ticketNumber por TURNO, calculado localmente (la PC es la fuente
 * de la verdad). Cuenta cuántas órdenes del outbox pertenecen a este shiftId
 * (el shiftId va dentro del payload JSON) y devuelve max+1. Reinicia en cada
 * turno porque cada turno tiene su propio shiftId. Funciona offline.
 */
export async function getNextTicketNumberForShift(shiftId: number): Promise<number> {
  const db = await getDb();
  const rows = await db.select<{ payload: string }[]>(
    `SELECT payload FROM orders_outbox
      WHERE json_extract(payload, '$.shiftId') = ?`,
    [shiftId],
  );
  let max = 0;
  for (const r of rows) {
    try {
      const tn = JSON.parse(r.payload)?.ticketNumber;
      if (typeof tn === 'number' && tn > max) max = tn;
    } catch { /* payload corrupto, ignorar */ }
  }
  return max + 1;
}

export async function getPendingOrders(): Promise<OutboxOrder[]> {
  const db = await getDb();
  return db.select<OutboxOrder[]>(
    'SELECT * FROM orders_outbox WHERE synced = 0 ORDER BY created_at ASC',
  );
}

export async function markOrderSynced(localId: string, serverId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE orders_outbox SET synced = 1, server_id = ? WHERE local_id = ?',
    [serverId, localId],
  );
}

export async function incrementRetry(localId: string, error: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE orders_outbox SET retry_count = retry_count + 1, last_error = ? WHERE local_id = ?',
    [error, localId],
  );
}

export async function getPendingCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<[{ count: number }]>(
    'SELECT COUNT(*) as count FROM orders_outbox WHERE synced = 0',
  );
  return rows[0]?.count ?? 0;
}

/** Devuelve el server_id de una orden ya sincronizada por su local_id (o null). */
export async function getServerIdForLocalId(localId: string): Promise<number | null> {
  const db = await getDb();
  const rows = await db.select<{ server_id: number | null }[]>(
    'SELECT server_id FROM orders_outbox WHERE local_id = ? AND synced = 1',
    [localId],
  );
  return rows[0]?.server_id ?? null;
}

// ── Cola de cocina (local-first) ────────────────────────────────────────────

/**
 * Órdenes pendientes de cocinar — fuente de verdad de la cola, sin tocar red.
 * Acotada por `sinceTs` (createdAt mínimo) para no mostrar tickets viejos
 * de turnos cerrados / días anteriores aunque queden vivos en SQLite.
 */
export async function getPendingKitchenOrders(sinceTs?: number): Promise<OutboxOrder[]> {
  const db = await getDb();
  if (sinceTs && sinceTs > 0) {
    return db.select<OutboxOrder[]>(
      `SELECT * FROM orders_outbox
        WHERE kitchen_status = 'pending' AND created_at >= ?
        ORDER BY created_at ASC`,
      [sinceTs],
    );
  }
  return db.select<OutboxOrder[]>(
    `SELECT * FROM orders_outbox WHERE kitchen_status = 'pending' ORDER BY created_at ASC`,
  );
}

/** Marca la orden como completada localmente. La UI se actualiza al toque. */
export async function markKitchenCompletedLocally(localId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE orders_outbox
        SET kitchen_status = 'completed', kitchen_completed_at = ?, kitchen_synced = 0
      WHERE local_id = ?`,
    [Date.now(), localId],
  );
}

/** Órdenes completadas localmente que aún no replicaron el complete al servidor. */
export async function getKitchenCompletedToSync(): Promise<OutboxOrder[]> {
  const db = await getDb();
  return db.select<OutboxOrder[]>(
    `SELECT * FROM orders_outbox
      WHERE kitchen_status = 'completed'
        AND kitchen_synced = 0
        AND synced = 1
        AND server_id IS NOT NULL AND server_id > 0
      ORDER BY kitchen_completed_at ASC`,
  );
}

/**
 * Cuenta los "Listo" marcados localmente que aún NO se replicaron al servidor.
 * A diferencia de getKitchenCompletedToSync, NO exige server_id: una orden con
 * kitchen_status='completed' pero synced=0 (su creación aún no subió) también
 * cuenta como pendiente — cerrar caja con ella la dejaría 'pending' en la nube.
 */
export async function getKitchenCompletedPendingCount(): Promise<number> {
  const db = await getDb();
  const rows = await db.select<[{ count: number }]>(
    `SELECT COUNT(*) as count FROM orders_outbox
      WHERE kitchen_status = 'completed' AND kitchen_synced = 0`,
  );
  return rows[0]?.count ?? 0;
}

/** Marca el complete como sincronizado con el servidor (PATCH confirmado). */
export async function markKitchenCompleteSynced(localId: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE orders_outbox SET kitchen_synced = 1 WHERE local_id = ?',
    [localId],
  );
}
