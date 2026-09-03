import { pool } from '../pool.js';
import type { AgentInstanceRow } from '../types.js';

/** Hebrew display name used when an instance of this type is provisioned. */
export const DEFAULT_INSTANCE_NAMES: Record<string, string> = {
  doc_collector: 'איסוף מסמכים',
  declaration_of_capital: 'הצהרת הון',
  debt_collector: 'גביית חובות',
  customer_service: 'שירות לקוחות',
  invoice_processing: 'עיבוד חשבוניות',
  bank_reconciliation: 'התאמות בנקים',
  transaction_categorization: 'סיווג תנועות',
  tax_deadlines: 'מועדי דיווח ומס',
  client_onboarding: 'קליטת לקוחות',
  payroll_prep: 'הכנת שכר',
  financial_reports: 'דוחות ותובנות',
  expense_tracking: 'קליטת קבלות',
  cashflow_forecast: 'תזרים מזומנים',
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

/** Every accountant's enabled instance of one agent type — periodic whole-platform sweeps. */
export async function listEnabledByType(agentType: string): Promise<AgentInstanceRow[]> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE agent_type = $1 AND enabled ORDER BY created_at ASC',
    [agentType],
  );
  return rows;
}

export type AgentInstanceWithClientCount = AgentInstanceRow & { client_count: number };

/**
 * Every instance on the platform (incl. disabled) with its client count —
 * the admin roster. Legacy CLI-era clients (NULL agent_instance_id) count
 * toward their user's doc_collector instance, mirroring the resolver fallback.
 */
export async function listAllWithClientCounts(): Promise<AgentInstanceWithClientCount[]> {
  const { rows } = await pool.query<AgentInstanceWithClientCount>(
    `SELECT i.*, COUNT(c.id)::int AS client_count
     FROM agent_instances i
     LEFT JOIN clients c
       ON c.agent_instance_id = i.id
       OR (c.agent_instance_id IS NULL AND c.user_id = i.user_id AND i.agent_type = 'doc_collector')
     GROUP BY i.id
     ORDER BY i.created_at ASC`,
  );
  return rows;
}

/** All instances including disabled ones — admin panel only. */
export async function listAllForUser(userId: string): Promise<AgentInstanceRow[]> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'SELECT * FROM agent_instances WHERE user_id = $1 ORDER BY created_at ASC',
    [userId],
  );
  return rows;
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

/** Admin-owned tax year (agent types with collectsTaxYear); NULL falls back to the last concluded year. */
export async function setTaxYear(id: string, taxYear: number): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'UPDATE agent_instances SET tax_year = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, taxYear],
  );
  return rows[0] ?? null;
}

/** Admin-owned pilot supervision flag (048): outbound messages need admin approval before sending. */
export async function setReviewMode(id: string, on: boolean): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'UPDATE agent_instances SET review_mode = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, on],
  );
  return rows[0] ?? null;
}

/** Admin-owned emergency brake (048): silently stops planning + sending for all the instance's clients. */
export async function setAdminPaused(id: string, on: boolean): Promise<AgentInstanceRow | null> {
  const { rows } = await pool.query<AgentInstanceRow>(
    'UPDATE agent_instances SET admin_paused = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, on],
  );
  return rows[0] ?? null;
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
