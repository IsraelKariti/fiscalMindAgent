import { pool } from '../pool.js';
import type { UserSettingRow } from '../types.js';

export async function get(userId: string, key: string): Promise<UserSettingRow | null> {
  const { rows } = await pool.query<UserSettingRow>('SELECT * FROM user_settings WHERE user_id = $1 AND key = $2', [
    userId,
    key,
  ]);
  return rows[0] ?? null;
}

export async function upsert(userId: string, key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_settings (user_id, key, value) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [userId, key, value],
  );
}

export async function remove(userId: string, key: string): Promise<void> {
  await pool.query('DELETE FROM user_settings WHERE user_id = $1 AND key = $2', [userId, key]);
}
