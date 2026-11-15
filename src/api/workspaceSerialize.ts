import type { ClientRow, EmailRow, TeamQuestionRow } from '../db/types.js';

/** A team question as the workspace reads it (openspec `team-questions`): the closer's user id stays server-side. */
export interface WorkspaceTeamQuestion {
  id: string;
  question: string;
  reason: string;
  evidenceMessageId: string | null;
  askedAt: Date;
  toEmail: string;
  toName: string;
  toMatch: 'accountant' | 'staff';
  closedHow: 'answered' | 'handled_outside' | null;
  closedText: string | null;
  closedAt: Date | null;
  closedByName: string | null;
}

export function toTeamQuestion(row: TeamQuestionRow): WorkspaceTeamQuestion {
  return {
    id: row.id,
    question: row.question,
    reason: row.reason,
    evidenceMessageId: row.evidence_message_id,
    askedAt: row.asked_at,
    toEmail: row.to_email,
    toName: row.to_name,
    toMatch: row.to_match,
    closedHow: row.closed_how,
    closedText: row.closed_text,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
  };
}

/** The roster's note of a client's open question (openspec `team-questions`): enough for the sidebar badge and the "for me" chip. */
export function attachOpenTeamQuestion<T extends { id: string }>(
  rows: T[],
  open: Map<string, TeamQuestionRow>,
): (T & { openTeamQuestion: { toEmail: string; toName: string; askedAt: Date } | null })[] {
  return rows.map((row) => {
    const q = open.get(row.id);
    return { ...row, openTeamQuestion: q ? { toEmail: q.to_email, toName: q.to_name, askedAt: q.asked_at } : null };
  });
}

/**
 * Strips the admin-only pilot-supervision fields (048) from rows before they
 * leave an accountant-facing endpoint. The supervision must be invisible to
 * the accountant, so every workspace/agent-router response that serializes a
 * raw ClientRow or EmailRow goes through these.
 */
export function toWorkspaceClient(
  client: ClientRow & { deleted_by_name?: string | null },
): Omit<ClientRow, 'admin_paused' | 'deleted_by' | 'is_test'> & { deletedAt: Date | null; deletedBy: string | null; isTest: boolean } {
  // deleted_by (a user id) stays server-side; the list of deleted clients
  // resolves it to the deleter's name (openspec `soft-delete-clients`).
  const { admin_paused: _adminPaused, deleted_by: _deletedBy, deleted_by_name, is_test, ...rest } = client;
  return { ...rest, deletedAt: client.deleted_at, deletedBy: deleted_by_name ?? null, isTest: is_test };
}

export function toWorkspaceEmail(email: EmailRow): Omit<EmailRow, 'review_status' | 'held_at'> {
  const { review_status: _reviewStatus, held_at: _heldAt, ...rest } = email;
  return rest;
}

/**
 * Admin roster cost (openspec `admin-roster-cost`): under an admin's view-as
 * the client list carries each client's lifetime LLM spend; every other
 * viewer's rows are returned untouched, with no `cost` key at all. `costs` is
 * null when the request is not a view-as session.
 */
export function attachRosterCost<T extends { id: string }>(rows: T[], costs: Map<string, number> | null): (T | (T & { cost: number }))[] {
  if (!costs) return rows;
  return rows.map((row) => ({ ...row, cost: costs.get(row.id) ?? 0 }));
}
