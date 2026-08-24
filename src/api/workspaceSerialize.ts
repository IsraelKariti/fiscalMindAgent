import type { ClientRow, EmailRow } from '../db/types.js';

/**
 * Strips the admin-only pilot-supervision fields (048) and the LLM-experiment
 * assignment (049) from rows before they leave an accountant-facing endpoint.
 * The supervision must be invisible to the accountant, so every
 * workspace/agent-router response that serializes a raw ClientRow or EmailRow
 * goes through these.
 */
export function toWorkspaceClient(client: ClientRow): Omit<ClientRow, 'admin_paused' | 'llm_variant'> {
  const { admin_paused: _adminPaused, llm_variant: _llmVariant, ...rest } = client;
  return rest;
}

export function toWorkspaceEmail(email: EmailRow): Omit<EmailRow, 'review_status' | 'held_at'> {
  const { review_status: _reviewStatus, held_at: _heldAt, ...rest } = email;
  return rest;
}
