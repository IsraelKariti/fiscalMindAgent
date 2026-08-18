import { pool } from '../pool.js';
import type { WaBusinessAccountRow } from '../types.js';

export async function getByUserId(userId: string): Promise<WaBusinessAccountRow | null> {
  const { rows } = await pool.query<WaBusinessAccountRow>('SELECT * FROM wa_business_accounts WHERE user_id = $1', [
    userId,
  ]);
  return rows[0] ?? null;
}

/** Connects (or replaces) the accountant's own WABA. */
export async function upsertForUser(
  userId: string,
  wabaId: string,
  source: 'embedded_signup' | 'manual',
): Promise<WaBusinessAccountRow> {
  const { rows } = await pool.query<WaBusinessAccountRow>(
    `INSERT INTO wa_business_accounts (user_id, waba_id, source) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET waba_id = EXCLUDED.waba_id, source = EXCLUDED.source, connected_at = now()
     RETURNING *`,
    [userId, wabaId, source],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertForUser: no row returned');
  return row;
}

export async function removeForUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM wa_business_accounts WHERE user_id = $1', [userId]);
}
