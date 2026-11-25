import { pool } from '../pool.js';
import type { ClientKind } from './versionCost.js';
import type { GoalStatus } from '../types.js';

/**
 * One client of an agent instance with the sums the admin documents tab needs
 * (openspec `document-cost-analytics`): its lifetime LLM call sums, its
 * checklist items by group and its message counts. The browser never sees
 * call, item or message rows — only these sums, further reduced by the pure
 * summariser (src/analytics/documentCost.ts).
 */
export interface ClientDocumentCostRow {
  id: string;
  name: string;
  goal_status: GoalStatus;
  paused: boolean;
  deleted: boolean;
  is_test: boolean;
  declined: boolean;
  created_at: Date;
  /** Every llm_calls row of the client. */
  calls: number;
  failed: number;
  /** SUM(cost) over priced calls; 0 when none is priced. */
  cost: number;
  /** Calls whose cost is NULL (counted as zero in `cost`; the UI shows a `+`). */
  unpriced: number;
  /** SUM(cost) over priced calls tied to a file (classification, extraction, verification, split). */
  file_cost: number;
  /** Items whose file the verification pipeline approved. */
  items_file: number;
  /** Items settled by the client's words: not_required, stated, claimed. */
  items_conversation: number;
  /** Items still open: unresolved, pending, collected. Retired rows count nowhere. */
  items_open: number;
  /** Outbound rows with status 'sent'. */
  messages_sent: number;
  /** Inbound rows with status 'received'. */
  messages_received: number;
  first_message_at: Date | null;
  last_message_at: Date | null;
}

/**
 * Every client of the instance (soft-deleted ones included; test clients per
 * `clientKind`), each with its sums. One grouped query; rows are as many as
 * the instance has clients.
 */
export async function listForInstance(agentInstanceId: string, clientKind: ClientKind): Promise<ClientDocumentCostRow[]> {
  const kind = clientKind === 'live' ? 'AND c.is_test = false' : clientKind === 'test' ? 'AND c.is_test = true' : '';
  const { rows } = await pool.query<ClientDocumentCostRow>(
    `SELECT c.id, c.name, c.goal_status, c.paused,
            (c.deleted_at IS NOT NULL) AS deleted,
            c.is_test,
            (c.agent_fields ? 'declined_at') AS declined,
            c.created_at,
            COALESCE(lc.calls, 0) AS calls,
            COALESCE(lc.failed, 0) AS failed,
            COALESCE(lc.cost, 0) AS cost,
            COALESCE(lc.unpriced, 0) AS unpriced,
            COALESCE(lc.file_cost, 0) AS file_cost,
            COALESCE(cd.items_file, 0) AS items_file,
            COALESCE(cd.items_conversation, 0) AS items_conversation,
            COALESCE(cd.items_open, 0) AS items_open,
            COALESCE(em.messages_sent, 0) AS messages_sent,
            COALESCE(em.messages_received, 0) AS messages_received,
            em.first_message_at, em.last_message_at
     FROM clients c
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::float8 AS calls,
              COUNT(*) FILTER (WHERE l.status = 'error')::float8 AS failed,
              COALESCE(SUM(l.cost), 0)::float8 AS cost,
              COUNT(*) FILTER (WHERE l.cost IS NULL)::float8 AS unpriced,
              COALESCE(SUM(l.cost) FILTER (WHERE l.document_file_id IS NOT NULL), 0)::float8 AS file_cost
       FROM llm_calls l WHERE l.client_id = c.id
     ) lc ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE d.status = 'approved')::float8 AS items_file,
              COUNT(*) FILTER (WHERE d.status IN ('not_required', 'stated', 'claimed'))::float8 AS items_conversation,
              COUNT(*) FILTER (WHERE d.status IN ('unresolved', 'pending', 'collected'))::float8 AS items_open
       FROM client_documents d WHERE d.client_id = c.id
     ) cd ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*) FILTER (WHERE e.direction = 'outbound' AND e.status = 'sent')::float8 AS messages_sent,
              COUNT(*) FILTER (WHERE e.direction = 'inbound' AND e.status = 'received')::float8 AS messages_received,
              MIN(e.created_at) FILTER (WHERE e.status IN ('sent', 'received')) AS first_message_at,
              MAX(e.created_at) FILTER (WHERE e.status IN ('sent', 'received')) AS last_message_at
       FROM emails e WHERE e.client_id = c.id
     ) em ON true
     WHERE c.agent_instance_id = $1 ${kind}
     ORDER BY c.created_at ASC`,
    [agentInstanceId],
  );
  return rows;
}
