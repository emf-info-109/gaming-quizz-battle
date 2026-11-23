/**
 * Pool de connexions MySQL + helpers transactionnels.
 */
import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from '../config.js';

export type { Pool, PoolConnection, ResultSetHeader, RowDataPacket };
/** Un objet sur lequel on peut exécuter une requête : le pool ou une connexion en transaction. */
export type Queryable = Pool | PoolConnection;

export function createPool(db: AppConfig['db']): Pool {
  const pool = mysql.createPool({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    connectionLimit: db.poolSize,
    waitForConnections: true,
    queueLimit: 200,
    connectTimeout: 5_000,
    enableKeepAlive: true,
    charset: 'utf8mb4_0900_ai_ci',
    // Toutes les dates sont manipulées en UTC
    timezone: 'Z',
    ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
  });
  // Fuseau horaire de session en UTC : NOW(3) est identique quelle que soit l'instance.
  pool.pool.on('connection', (conn) => {
    conn.query("SET time_zone = '+00:00'");
  });
  return pool;
}

const RETRYABLE_ERRNOS = new Set([
  1213, // ER_LOCK_DEADLOCK
  1205, // ER_LOCK_WAIT_TIMEOUT
]);

/**
 * Exécute `fn` dans une transaction. Commit si tout va bien, rollback sinon.
 * Les interblocages (deadlocks) MySQL sont rejoués automatiquement : ils sont
 * normaux lorsque plusieurs instances écrivent en même temps.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (conn: PoolConnection) => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      const errno = (err as { errno?: number }).errno;
      if (errno !== undefined && RETRYABLE_ERRNOS.has(errno) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
        continue;
      }
      throw err;
    } finally {
      conn.release();
    }
  }
}

export function isDuplicateKeyError(err: unknown, keyName?: string): boolean {
  const e = err as { code?: string; sqlMessage?: string };
  if (e?.code !== 'ER_DUP_ENTRY') return false;
  return keyName ? Boolean(e.sqlMessage?.includes(keyName)) : true;
}

/** Vérifie que MySQL répond (utilisé par /ready). */
export async function pingDatabase(pool: Pool, timeoutMs = 2_000): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Timeout MySQL')), timeoutMs);
  });
  try {
    await Promise.race([pool.query('SELECT 1'), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
