import mysql from 'mysql2/promise';
import type { Pool, PoolConnection, ResultSetHeader } from 'mysql2/promise';

export type Db = Pool | PoolConnection;

const g = globalThis as unknown as { __pool?: Pool };
function crear(): Pool {
  const p = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: Number(process.env.DATABASE_PORT || 3306),
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    database: process.env.DATABASE_NAME,
    waitForConnections: true, connectionLimit: 10, timezone: 'Z', charset: 'utf8mb4',
  });
  // Todo se guarda en UTC; las pantallas formatean a America/Guayaquil.
  (p as any).on('connection', (c: any) => c.query("SET time_zone='+00:00'"));
  return p;
}
export const pool: Pool = (g.__pool ??= crear());

export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool.getConnection();
  try {
    await c.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await c.beginTransaction();
    const r = await fn(c);
    await c.commit();
    return r;
  } catch (e) {
    try { await c.rollback(); } catch { /* ignorar */ }
    throw e;
  } finally { c.release(); }
}

export async function q<T = any>(db: Db, sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await db.query(sql, params);
  return rows as T[];
}
export async function q1<T = any>(db: Db, sql: string, params: any[] = []): Promise<T | undefined> {
  return (await q<T>(db, sql, params))[0];
}
export async function ex(db: Db, sql: string, params: any[] = []): Promise<ResultSetHeader> {
  const [r] = await db.query(sql, params);
  return r as ResultSetHeader;
}
/** MariaDB devuelve JSON como texto; MySQL ya lo parsea. */
export function pj<T = any>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return v as unknown as T; } }
  return v as T;
}
