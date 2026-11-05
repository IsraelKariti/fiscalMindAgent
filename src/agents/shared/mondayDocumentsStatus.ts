/**
 * The documents status column (openspec `monday-documents-status`): a second
 * board status column that mirrors the client dot of the workspace. One label
 * per dot state, chosen with the dot's own precedence (web/src/format.ts
 * `clientDotState`): refused > done > window ended > in progress. The label is
 * always derived from the client's stored state after an event, never from
 * the event's name, so every call site is trivially correct.
 */

/** In progress (blue dot): the agent is collecting, paused, held or never contacted. */
export const MONDAY_DOCS_IN_PROGRESS = 'בטיפול סוכן';
/** Complete (green dot): every document is in. */
export const MONDAY_DOCS_COMPLETE = 'הושלם בהצלחה';
/** Refused (red dot): the client declined the WhatsApp collection. */
export const MONDAY_DOCS_REFUSED = 'סירוב סוכן';
/** Window ended (orange dot): the due date passed with documents missing. */
export const MONDAY_DOCS_WINDOW_ENDED = 'הסתיים חלקית';

export interface DocumentsStatusInput {
  goal_status: 'pending' | 'complete';
  /** `agent_fields.declined_at` is set. */
  declined: boolean;
  /** `agent_fields.overdue_stopped_at` is set. */
  overdueStopped: boolean;
}

/** The label the documents status column shows for a client's state — same rule and precedence as the dot. */
export function documentsStatusLabelOf(client: DocumentsStatusInput): string {
  if (client.declined && client.goal_status === 'pending') return MONDAY_DOCS_REFUSED;
  if (client.goal_status === 'complete') return MONDAY_DOCS_COMPLETE;
  if (client.overdueStopped) return MONDAY_DOCS_WINDOW_ENDED;
  return MONDAY_DOCS_IN_PROGRESS;
}

/** The stored facts behind the dot, read off a client row's `agent_fields`. */
export function documentsStatusInputOf(client: { goal_status: 'pending' | 'complete'; agent_fields: Record<string, unknown> }): DocumentsStatusInput {
  return {
    goal_status: client.goal_status,
    declined: typeof client.agent_fields['declined_at'] === 'string',
    overdueStopped: typeof client.agent_fields['overdue_stopped_at'] === 'string',
  };
}
