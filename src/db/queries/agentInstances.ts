import { pool } from '../pool.js';
import type { AgentInstanceRow } from '../types.js';

/** Hebrew display name used when an instance of this type is provisioned. */
export const DEFAULT_INSTANCE_NAMES: Record<string, string> = {
  doc_collector: 'איסוף מסמכים',
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
