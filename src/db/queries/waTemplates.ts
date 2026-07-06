import { pool } from '../pool.js';
import type { WaTemplateRow } from '../types.js';

export async function listAll(): Promise<WaTemplateRow[]> {
  const { rows } = await pool.query<WaTemplateRow>('SELECT * FROM wa_templates ORDER BY created_at');
  return rows;
}

export async function getByContentSid(contentSid: string): Promise<WaTemplateRow | null> {
  const { rows } = await pool.query<WaTemplateRow>('SELECT * FROM wa_templates WHERE content_sid = $1', [contentSid]);
  return rows[0] ?? null;
}

export async function insert(args: {
  contentSid: string;
  name: string;
  body: string;
  variableCount: number;
}): Promise<WaTemplateRow> {
  const { rows } = await pool.query<WaTemplateRow>(
    `INSERT INTO wa_templates (content_sid, name, body, variable_count)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [args.contentSid, args.name, args.body, args.variableCount],
  );
  const row = rows[0];
  if (!row) throw new Error('insert: no row returned');
  return row;
}

export async function remove(id: string): Promise<void> {
  await pool.query('DELETE FROM wa_templates WHERE id = $1', [id]);
}
