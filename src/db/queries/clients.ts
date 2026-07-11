import { pool } from '../pool.js';
import type { ClientRow, GoalStatus } from '../types.js';

export async function getById(id: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** getById constrained to one user's roster — API routes use this so users can't reach others' clients. */
export async function getByIdForUser(id: string, userId: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ?? null;
}

export async function listForUser(userId: string): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at DESC', [
    userId,
  ]);
  return rows;
}

/** Case-insensitive: addresses are stored lowercased, but callers may pass any casing. */
export async function getByEmailAddressForUser(userId: string, emailAddress: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE user_id = $1 AND lower(email_address) = lower($2)',
    [userId, emailAddress],
  );
  return rows[0] ?? null;
}

/** Inbound WhatsApp routing: the accountant's client with this (E.164) number. */
export async function getByWaPhoneForUser(userId: string, waPhone: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE user_id = $1 AND wa_phone = $2', [
    userId,
    waPhone,
  ]);
  return rows[0] ?? null;
}

export async function insert(args: {
  userId: string;
  /** Callers without agent scope (monday import) default to the user's doc_collector instance. */
  agentInstanceId?: string;
  name: string;
  emailAddress: string;
}): Promise<ClientRow> {
  const { rows } = await pool.query<ClientRow>(
    `INSERT INTO clients (user_id, agent_instance_id, name, email_address, goal_status)
     VALUES ($1, COALESCE($2, (SELECT id FROM agent_instances WHERE user_id = $1 AND agent_type = 'doc_collector')), $3, $4, 'pending')
     RETURNING *`,
    // Stored lowercased — inbound routing and the import dedupe match on it.
    [args.userId, args.agentInstanceId ?? null, args.name, args.emailAddress.trim().toLowerCase()],
  );
  const row = rows[0];
  if (!row) throw new Error('insert client: no row returned');
  return row;
}

/** getById constrained to one agent instance — agent-scoped API routes use this. */
export async function getByIdForInstance(id: string, agentInstanceId: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1 AND agent_instance_id = $2', [
    id,
    agentInstanceId,
  ]);
  return rows[0] ?? null;
}

export async function listForInstance(agentInstanceId: string): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE agent_instance_id = $1 ORDER BY created_at DESC',
    [agentInstanceId],
  );
  return rows;
}

/** Case-insensitive: addresses are stored lowercased, but callers may pass any casing. */
export async function getByEmailAddressForInstance(
  agentInstanceId: string,
  emailAddress: string,
): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE agent_instance_id = $1 AND lower(email_address) = lower($2)',
    [agentInstanceId, emailAddress],
  );
  return rows[0] ?? null;
}

/** Inbound WhatsApp routing: the instance's client with this (E.164) number. */
export async function getByWaPhoneForInstance(agentInstanceId: string, waPhone: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE agent_instance_id = $1 AND wa_phone = $2', [
    agentInstanceId,
    waPhone,
  ]);
  return rows[0] ?? null;
}

/** updateDetailsForUser constrained to one agent instance — agent-scoped API routes use this. */
export async function updateDetailsForInstance(
  id: string,
  agentInstanceId: string,
  patch: ClientDetailsPatch,
): Promise<ClientRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, agentInstanceId];
  for (const field of ['name', 'occupation', 'phone', 'company', 'notes'] as const) {
    if (patch[field] !== undefined) {
      values.push(patch[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getByIdForInstance(id, agentInstanceId);
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND agent_instance_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

/** Deletes the instance's client; documents, files, emails and the scheduled-job row cascade. */
export async function removeForInstance(id: string, agentInstanceId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND agent_instance_id = $2', [
    id,
    agentInstanceId,
  ]);
  return (rowCount ?? 0) > 0;
}

export interface ClientDetailsPatch {
  name?: string;
  occupation?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

/** Updates only the provided profile fields; returns the updated row (null if the client isn't the user's). */
export async function updateDetailsForUser(
  id: string,
  userId: string,
  patch: ClientDetailsPatch,
): Promise<ClientRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, userId];
  for (const field of ['name', 'occupation', 'phone', 'company', 'notes'] as const) {
    if (patch[field] !== undefined) {
      values.push(patch[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getByIdForUser(id, userId);
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

/**
 * Enables the WhatsApp channel: stores the validated E.164 number and records
 * who opted the client in and when (clearing any earlier opt-out).
 */
export async function enableWhatsApp(id: string, args: { waPhone: string; optedInBy: string }): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET wa_phone = $2, wa_enabled = true, wa_opted_in_at = now(), wa_opted_in_by = $3,
         wa_opted_out_at = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, args.waPhone, args.optedInBy],
  );
  return rows[0] ?? null;
}

/** Disables the WhatsApp channel (accountant toggle or client opt-out); the number is kept. */
export async function disableWhatsApp(id: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET wa_enabled = false, wa_opted_out_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Flips the outreach pause switch; returns the updated row (null if the client is gone). */
export async function setPaused(id: string, paused: boolean): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'UPDATE clients SET paused = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, paused],
  );
  return rows[0] ?? null;
}

/**
 * Stamps the start of a planning attempt (and clears any earlier failure).
 * Agent-status fields only, so updated_at is left alone — it tracks accountant edits.
 */
export async function markDraftingStarted(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = now(), draft_failed_at = NULL WHERE id = $1', [id]);
}

/** Records that the planning attempt threw; the UI offers a manual retry. */
export async function markDraftingFailed(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = NULL, draft_failed_at = now() WHERE id = $1', [id]);
}

/** Clears the drafting stamp after a successful planning attempt. */
export async function clearDraftingState(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = NULL, draft_failed_at = NULL WHERE id = $1', [id]);
}

/** Deletes the client; documents, files, emails and the scheduled-job row go with it via FK cascades. */
export async function removeForUser(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [id, userId]);
  return (rowCount ?? 0) > 0;
}

export async function updateGoalStatus(id: string, goalStatus: GoalStatus): Promise<void> {
  await pool.query('UPDATE clients SET goal_status = $2, updated_at = now() WHERE id = $1', [id, goalStatus]);
}
