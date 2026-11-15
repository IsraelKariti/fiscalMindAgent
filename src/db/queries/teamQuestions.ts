import { pool } from '../pool.js';
import type { TeamQuestionClosedHow, TeamQuestionRow } from '../types.js';

/**
 * Questions the agent asked the client's team member (openspec
 * `team-questions`, migration 068). At most one open row per client — the
 * partial unique index refuses a second insert while one is open.
 */

export interface NewTeamQuestion {
  clientId: string;
  agentInstanceId: string;
  question: string;
  reason: string;
  /** The inbound message the question rests on; null when none. */
  evidenceMessageId: string | null;
  toEmail: string;
  toName: string;
  toMatch: 'accountant' | 'staff';
}

export async function insert(q: NewTeamQuestion): Promise<TeamQuestionRow> {
  const { rows } = await pool.query<TeamQuestionRow>(
    `INSERT INTO team_questions (client_id, agent_instance_id, question, reason, evidence_message_id, to_email, to_name, to_match)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [q.clientId, q.agentInstanceId, q.question, q.reason, q.evidenceMessageId, q.toEmail.toLowerCase(), q.toName, q.toMatch],
  );
  return rows[0]!;
}

/** Every question of the client, newest first. */
export async function listForClient(clientId: string): Promise<TeamQuestionRow[]> {
  const { rows } = await pool.query<TeamQuestionRow>('SELECT * FROM team_questions WHERE client_id = $1 ORDER BY asked_at DESC, id DESC', [
    clientId,
  ]);
  return rows;
}

export async function getById(id: string): Promise<TeamQuestionRow | null> {
  const { rows } = await pool.query<TeamQuestionRow>('SELECT * FROM team_questions WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** The client's open question, when one is waiting for the team. */
export async function getOpenForClient(clientId: string): Promise<TeamQuestionRow | null> {
  const { rows } = await pool.query<TeamQuestionRow>('SELECT * FROM team_questions WHERE client_id = $1 AND closed_at IS NULL', [clientId]);
  return rows[0] ?? null;
}

/** The open question of each listed client (one query for the roster): client id → row. */
export async function listOpenByClientIds(clientIds: readonly string[]): Promise<Map<string, TeamQuestionRow>> {
  if (clientIds.length === 0) return new Map();
  const { rows } = await pool.query<TeamQuestionRow>('SELECT * FROM team_questions WHERE closed_at IS NULL AND client_id = ANY($1::uuid[])', [
    clientIds,
  ]);
  return new Map(rows.map((r) => [r.client_id, r]));
}

/**
 * Closes the question: an answer for the agent to relay, or "handled outside"
 * (the team member spoke to the client; the text is an optional note).
 * Returns null when the row is not the client's or was already closed, so a
 * race between two people leaves the first closing standing.
 */
export async function close(
  id: string,
  clientId: string,
  how: TeamQuestionClosedHow,
  text: string | null,
  userId: string | null,
  userName: string,
): Promise<TeamQuestionRow | null> {
  const { rows } = await pool.query<TeamQuestionRow>(
    `UPDATE team_questions
     SET closed_how = $3, closed_text = $4, closed_at = now(), closed_by = $5, closed_by_name = $6
     WHERE id = $1 AND client_id = $2 AND closed_at IS NULL
     RETURNING *`,
    [id, clientId, how, text, userId, userName],
  );
  return rows[0] ?? null;
}
