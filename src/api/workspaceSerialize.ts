import type { ClientRow, EmailRow } from '../db/types.js';

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
