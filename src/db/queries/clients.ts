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

export async function getByEmailAddressForUser(userId: string, emailAddress: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE user_id = $1 AND email_address = $2', [
    userId,
    emailAddress,
  ]);
  return rows[0] ?? null;
}

export async function insert(args: { userId: string; name: string; emailAddress: string }): Promise<ClientRow> {
  const { rows } = await pool.query<ClientRow>(
    `INSERT INTO clients (user_id, name, email_address, goal_status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [args.userId, args.name, args.emailAddress],
  );
  const row = rows[0];
  if (!row) throw new Error('insert client: no row returned');
  return row;
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

export async function updateGoalStatus(id: string, goalStatus: GoalStatus): Promise<void> {
  await pool.query('UPDATE clients SET goal_status = $2, updated_at = now() WHERE id = $1', [id, goalStatus]);
}

export async function setThreadId(id: string, threadId: string): Promise<void> {
  await pool.query('UPDATE clients SET gmail_thread_id = $2, updated_at = now() WHERE id = $1', [id, threadId]);
}
