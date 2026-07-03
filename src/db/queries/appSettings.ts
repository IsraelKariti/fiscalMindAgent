import { pool } from '../pool.js';
import type { AppSettingRow } from '../types.js';

export async function get(key: string): Promise<AppSettingRow | null> {
  const { rows } = await pool.query<AppSettingRow>('SELECT * FROM app_settings WHERE key = $1', [key]);
  return rows[0] ?? null;
}

export async function upsert(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, value],
  );
}

export async function remove(key: string): Promise<void> {
  await pool.query('DELETE FROM app_settings WHERE key = $1', [key]);
}
