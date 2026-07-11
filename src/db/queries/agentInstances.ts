import { pool } from '../pool.js';
import type { AgentInstanceRow } from '../types.js';

/** Hebrew display name used when an instance of this type is provisioned. */
export const DEFAULT_INSTANCE_NAMES: Record<string, string> = {
  doc_collector: 'איסוף מסמכים',
  debt_collector: 'גביית חובות',
  customer_service: 'שירות לקוחות',
};

export async function listForUser(userId: string): Promise<AgentInstanceRow[]> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE user_id = $1 AND enabled ORDER BY created_at ASC',
    [userId],
  );
  return rows;
}

/** Constrained to one user so API routes can't reach other accountants' instances. */
export async function getByIdForUser(id: string, userId: string): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function getById(id: string): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>('SELECT * FROM agent_instances WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function getByTypeForUser(userId: string, agentType: string): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE user_id = $1 AND agent_type = $2',
    [userId, agentType],
  );
  return rows[0] ?? null;
}

/** All instances including disabled ones — admin panel only. */
export async function listAllForUser(userId: string): Promise<AgentInstanceRow[]> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE user_id = $1 ORDER BY created_at ASC',
    [userId],
  );
  return rows;
}

/**
 * Idempotent: every accountant gets the doc collector. Called on every
 * sign-in/provisioning (users.upsertFromGoogle), mirroring the 019 backfill
 * for users created after it.
 */
export async function ensureInstance(userId: string, agentType: string): Promise<void> {
  await pool.query(
    `INSERT INTO agent_instances (user_id, agent_type, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, agent_type) DO NOTHING`,
    [userId, agentType, DEFAULT_INSTANCE_NAMES[agentType] ?? agentType],
  );
}

/** Admin enablement: creates the instance on first enable, re-enables a disabled one. */
export async function enableInstance(userId: string, agentType: string): Promise<AgentInstanceRow> {
  const { rows } = await pool.query<AgentInstanceRow>(
    `INSERT INTO agent_instances (user_id, agent_type, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, agent_type) DO UPDATE SET enabled = true, updated_at = now()
     RETURNING *`,
    [userId, agentType, DEFAULT_INSTANCE_NAMES[agentType] ?? agentType],
  );
  const row = rows[0];
  if (!row) throw new Error('enableInstance: no row returned');
  return row;
}

/** Replaces the instance's settings JSONB — shape owned by the agent type's Zod schema. */
export async function updateSettings(id: string, settings: Record<string, unknown>): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'UPDATE agent_instances SET settings = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, JSON.stringify(settings)],
  );
  return rows[0] ?? null;
}

/**
 * Admin disablement. Never DELETE an instance — clients cascade off it, so a
 * delete would destroy the agent's client data; disabled instances just stop
 * being listed/resolvable and can be re-enabled with everything intact.
 */
export async function disableInstance(userId: string, agentType: string): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    `UPDATE agent_instances SET enabled = false, updated_at = now()
     WHERE user_id = $1 AND agent_type = $2 RETURNING *`,
    [userId, agentType],
  );
  return rows[0] ?? null;
}
