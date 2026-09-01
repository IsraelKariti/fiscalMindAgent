import { pool } from '../pool.js';
import type { WaTemplateRow } from '../types.js';

export async function listAll(): Promise<WaTemplateRow[]> {
  const { rows } = await pool.query<WaTemplateRow>('SELECT * FROM wa_templates ORDER BY created_at');
  return rows;
}

/** Templates the given agent type may send: its own plus unscoped (agent_type NULL) ones. */
export async function listForAgentType(agentType: string): Promise<WaTemplateRow[]> {
  const { rows } = await pool.query<WaTemplateRow>(
    'SELECT * FROM wa_templates WHERE agent_type IS NULL OR agent_type = $1 ORDER BY created_at',
    [agentType],
  );
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
  agentType?: string | null;
}): Promise<WaTemplateRow> {
  const { rows } = await pool.query<WaTemplateRow>(
    `INSERT INTO wa_templates (content_sid, name, body, variable_count, agent_type)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [args.contentSid, args.name, args.body, args.variableCount, args.agentType ?? null],
  );
  const row = rows[0];
  if (!row) throw new Error('insert: no row returned');
  return row;
}

export async function remove(id: string): Promise<void> {
  await pool.query('DELETE FROM wa_templates WHERE id = $1', [id]);
}
