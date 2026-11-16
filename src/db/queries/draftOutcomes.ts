import { pool } from '../pool.js';
import type { DiscardReason, EmailStatus, PlanTrigger } from '../types.js';

/**
 * One outbound draft of an agent instance with what became of it (openspec
 * `discarded-message-analytics`): the admin analytics tab's raw row. `cost`
 * is the recorded cost of the planning cycle's llm_calls rows, null when the
 * draft predates the cycle id (076) or none of its calls was priced — unknown,
 * never zero.
 */
export interface DraftOutcomeRow {
  id: string;
  client_id: string;
  client_name: string;
  client_deleted: boolean;
  status: EmailStatus;
  created_at: Date;
  sent_at: Date | null;
  plan_trigger: PlanTrigger | null;
  scheduled_for: Date | null;
  discarded_at: Date | null;
  discard_reason: DiscardReason | null;
  cost: number | null;
  /** The client's last inbound row written before the draft; null for a draft with none (kickoff). */
  last_inbound_at: Date | null;
}

/** Every outbound draft of the instance written in [from, to), oldest first. Deleted and test clients included (admin surface). */
export async function listForInstance(agentInstanceId: string, from: Date, to: Date): Promise<DraftOutcomeRow[]> {
  const { rows } = await pool.query<DraftOutcomeRow>(
    `SELECT e.id, e.client_id, c.name AS client_name, (c.deleted_at IS NOT NULL) AS client_deleted,
            e.status, e.created_at, e.sent_at, e.plan_trigger, e.scheduled_for, e.discarded_at, e.discard_reason,
            CASE WHEN lc.priced THEN lc.cost ELSE NULL END AS cost,
            li.at AS last_inbound_at
     FROM emails e
     JOIN clients c ON c.id = e.client_id
     LEFT JOIN LATERAL (
       SELECT SUM(l.cost)::float8 AS cost, bool_or(l.cost IS NOT NULL) AS priced
       FROM llm_calls l WHERE l.plan_run_id = e.plan_run_id
     ) lc ON e.plan_run_id IS NOT NULL
     LEFT JOIN LATERAL (
       SELECT MAX(i.created_at) AS at FROM emails i
       WHERE i.client_id = e.client_id AND i.direction = 'inbound' AND i.created_at <= e.created_at
     ) li ON true
     WHERE c.agent_instance_id = $1
       AND e.direction = 'outbound'
       AND e.created_at >= $2 AND e.created_at < $3
     ORDER BY e.created_at ASC`,
    [agentInstanceId, from, to],
  );
  return rows;
}

/** When the instance's first outbound draft was written; null for an instance with none. */
export async function firstDraftAt(agentInstanceId: string): Promise<Date | null> {
  const { rows } = await pool.query<{ first_at: Date | null }>(
    `SELECT MIN(e.created_at) AS first_at
     FROM emails e JOIN clients c ON c.id = e.client_id
     WHERE c.agent_instance_id = $1 AND e.direction = 'outbound'`,
    [agentInstanceId],
  );
  return rows[0]?.first_at ?? null;
}
