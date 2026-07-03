import { pool } from './pool.js';

/**
 * Serializes any "mutate this client's email schedule" sequence (send+record+remove+set, or
 * insert-inbound+remove+set) across both processes (web + worker) via a Postgres session-level
 * advisory lock. Held for the full duration of `fn`, including external calls (Gemini, Gmail),
 * on a connection dedicated to holding the lock -- `fn`'s own queries go through the shared pool.
 */
export async function withClientLock<T>(clientId: string, fn: () => Promise<T>): Promise<T> {
  const lockConn = await pool.connect();
  try {
    await lockConn.query('SELECT pg_advisory_lock(hashtext($1))', [clientId]);
    return await fn();
  } finally {
    await lockConn.query('SELECT pg_advisory_unlock(hashtext($1))', [clientId]);
    lockConn.release();
  }
}
