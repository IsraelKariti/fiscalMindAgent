import { pool } from '../pool.js';
import type { WaSenderRow } from '../types.js';

/** A sender row joined with its instance's owner and type (for admin views). */
export interface WaSenderWithInstance extends WaSenderRow {
  user_id: string;
  agent_type: string;
}

export async function getByInstanceId(agentInstanceId: string): Promise<WaSenderRow | null> {
  const { rows } = await pool.query<WaSenderRow>('SELECT * FROM wa_senders WHERE agent_instance_id = $1', [
    agentInstanceId,
  ]);
  return rows[0] ?? null;
}

/** Inbound routing: which agent instance owns the WhatsApp number a message arrived on. */
export async function getByPhoneNumber(phoneNumber: string): Promise<WaSenderRow | null> {
  const { rows } = await pool.query<WaSenderRow>('SELECT * FROM wa_senders WHERE phone_number = $1', [phoneNumber]);
  return rows[0] ?? null;
}

export async function listAll(): Promise<WaSenderWithInstance[]> {
  const { rows } = await pool.query<WaSenderWithInstance>(
    `SELECT s.*, ai.user_id, ai.agent_type
     FROM wa_senders s JOIN agent_instances ai ON ai.id = s.agent_instance_id
     ORDER BY s.created_at`,
  );
  return rows;
}

/** All sender numbers across one accountant's agent instances. */
export async function listForUser(userId: string): Promise<WaSenderWithInstance[]> {
  const { rows } = await pool.query<WaSenderWithInstance>(
    `SELECT s.*, ai.user_id, ai.agent_type
     FROM wa_senders s JOIN agent_instances ai ON ai.id = s.agent_instance_id
     WHERE ai.user_id = $1
     ORDER BY s.created_at`,
    [userId],
  );
  return rows;
}

/** Assigns (or re-assigns) an agent instance's WhatsApp sender number. */
export async function upsertForInstance(agentInstanceId: string, phoneNumber: string): Promise<WaSenderRow> {
  const { rows } = await pool.query<WaSenderRow>(
    `INSERT INTO wa_senders (agent_instance_id, phone_number) VALUES ($1, $2)
     ON CONFLICT (agent_instance_id) DO UPDATE SET phone_number = EXCLUDED.phone_number
     RETURNING *`,
    [agentInstanceId, phoneNumber],
  );
  const row = rows[0];
  if (!row) throw new Error('upsertForInstance: no row returned');
  return row;
}

export async function deleteForInstance(agentInstanceId: string): Promise<void> {
  await pool.query('DELETE FROM wa_senders WHERE agent_instance_id = $1', [agentInstanceId]);
}
