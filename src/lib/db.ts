import Database from '@tauri-apps/plugin-sql';

export interface OutboxOrder {
  local_id: string;
  payload: string;
  created_at: number;
  synced: number;
  server_id: number | null;
  retry_count: number;
  last_error: string | null;
}

let _db: Database | null = null;

async function getDb(): Promise<Database> {
  if (_db) return _db;
  _db = await Database.load('sqlite:sellyx.db');
  await _db.execute(`
    CREATE TABLE IF NOT EXISTS orders_outbox (
      local_id    TEXT PRIMARY KEY,
      payload     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      synced      INTEGER DEFAULT 0,
      server_id   INTEGER,
      retry_count INTEGER DEFAULT 0,
      last_error  TEXT
    )
  `);
  return _db;
}

export async function saveOrderToOutbox(localId: string, payload: object): Promise<void> {
  const db = await getDb();
  await db.execute(
    'INSERT OR IGNORE INTO orders_outbox (local_id, payload, created_at) VALUES (?, ?, ?)',
    [localId, JSON.stringify(payload), Date.now()],
  );
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
