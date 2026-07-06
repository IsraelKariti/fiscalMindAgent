import { pool } from '../pool.js';
import type { WaSenderRow } from '../types.js';

export async function getByUserId(userId: string): Promise<WaSenderRow | null> {
  const { rows } = await pool.query<WaSenderRow>('SELECT * FROM wa_senders WHERE user_id = $1', [userId]);
  return rows[0] ?? null;
}

/** Inbound routing: which accountant owns the WhatsApp number a message arrived on. */
export async function getByPhoneNumber(phoneNumber: string): Promise<WaSenderRow | null> {
  const { rows } = await pool.query<WaSenderRow>('SELECT * FROM wa_senders WHERE phone_number = $1', [phoneNumber]);
  return rows[0] ?? null;
}

export async function listAll(): Promise<WaSenderRow[]> {
  const { rows } = await pool.query<WaSenderRow>('SELECT * FROM wa_senders ORDER BY created_at');
  return rows;
}

/** Assigns (or re-assigns) an accountant's WhatsApp sender number. */
export async function upsertForUser(userId: string, phoneNumber: string): Promise<WaSenderRow> {
  const { rows } = await pool.query<WaSenderRow>(
    `INSERT INTO wa_senders (user_id, phone_number) VALUES ($1, $2)
     ON CONFLICT (user_id) DO UPDATE SET phone_number = EXCLUDED.phone_number
     RETURNING *`,
    [userId, phoneNumber],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertForUser: no row returned');
  return row;
}

export async function deleteForUser(userId: string): Promise<void> {
  await pool.query('DELETE FROM wa_senders WHERE user_id = $1', [userId]);
}
