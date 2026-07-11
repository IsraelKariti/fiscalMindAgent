import { pool } from '../pool.js';
import type { EmailDirection, GoalStatus } from '../types.js';

/** One client with everything the workspace dashboard shows about it, pre-aggregated in SQL. */
export interface ClientSummaryRow {
  id: string;
  name: string;
  email_address: string;
  goal_status: GoalStatus;
  created_at: Date;
  docs_total: number;
  docs_collected: number;
  emails_sent: number;
  emails_received: number;
  last_inbound_at: Date | null;
  next_scheduled_for: Date | null;
}

export async function listClientSummaries(userId: string): Promise<ClientSummaryRow[]> {
  const { rows } = await pool.query<ClientSummaryRow>(
    `SELECT c.id, c.name, c.email_address, c.goal_status, c.created_at,
            COALESCE(d.total, 0)::int AS docs_total,
            COALESCE(d.collected, 0)::int AS docs_collected,
            COALESCE(e.sent, 0)::int AS emails_sent,
            COALESCE(e.received, 0)::int AS emails_received,
            e.last_inbound_at,
            sj.scheduled_for AS next_scheduled_for
     FROM clients c
     LEFT JOIN (
       SELECT client_id,
              count(*) AS total,
              count(*) FILTER (WHERE status = 'collected') AS collected
       FROM client_documents
       GROUP BY client_id
     ) d ON d.client_id = c.id
     LEFT JOIN (
       SELECT client_id,
              count(*) FILTER (WHERE direction = 'outbound' AND status = 'sent') AS sent,
              count(*) FILTER (WHERE direction = 'inbound' AND status = 'received') AS received,
              max(COALESCE(sent_at, created_at))
                FILTER (WHERE direction = 'inbound' AND status = 'received') AS last_inbound_at
       FROM emails
       GROUP BY client_id
     ) e ON e.client_id = c.id
     LEFT JOIN scheduled_jobs sj ON sj.client_id = c.id
     WHERE c.user_id = $1
     ORDER BY c.created_at DESC`,
    [userId],
  );
  return rows;
}

/** listClientSummaries scoped to one agent instance — agent-scoped API routes use this. */
export async function listClientSummariesForInstance(agentInstanceId: string): Promise<ClientSummaryRow[]> {
  const { rows } = await pool.query<ClientSummaryRow>(
    `SELECT c.id, c.name, c.email_address, c.goal_status, c.created_at,
            COALESCE(d.total, 0)::int AS docs_total,
            COALESCE(d.collected, 0)::int AS docs_collected,
            COALESCE(e.sent, 0)::int AS emails_sent,
            COALESCE(e.received, 0)::int AS emails_received,
            e.last_inbound_at,
            sj.scheduled_for AS next_scheduled_for
     FROM clients c
     LEFT JOIN (
       SELECT client_id,
              count(*) AS total,
              count(*) FILTER (WHERE status = 'collected') AS collected
       FROM client_documents
       GROUP BY client_id
     ) d ON d.client_id = c.id
     LEFT JOIN (
       SELECT client_id,
              count(*) FILTER (WHERE direction = 'outbound' AND status = 'sent') AS sent,
              count(*) FILTER (WHERE direction = 'inbound' AND status = 'received') AS received,
              max(COALESCE(sent_at, created_at))
                FILTER (WHERE direction = 'inbound' AND status = 'received') AS last_inbound_at
       FROM emails
       GROUP BY client_id
     ) e ON e.client_id = c.id
     LEFT JOIN scheduled_jobs sj ON sj.client_id = c.id
     WHERE c.agent_instance_id = $1
     ORDER BY c.created_at DESC`,
    [agentInstanceId],
  );
  return rows;
}

export interface EmailActivityRow {
  at: Date;
  direction: EmailDirection;
}

/** Delivered emails across all the user's clients within the window — feeds the weekly activity chart. */
export async function listEmailActivity(userId: string, days: number): Promise<EmailActivityRow[]> {
  const { rows } = await pool.query<EmailActivityRow>(
    `SELECT COALESCE(e.sent_at, e.created_at) AS at, e.direction
     FROM emails e
     JOIN clients c ON c.id = e.client_id
     WHERE c.user_id = $1 AND e.status IN ('sent', 'received')
       AND COALESCE(e.sent_at, e.created_at) >= now() - make_interval(days => $2)`,
    [userId, days],
  );
  return rows;
}

export async function countFilesForUser(userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM document_files f
     JOIN clients c ON c.id = f.client_id
     WHERE c.user_id = $1`,
    [userId],
  );
  return rows[0]?.count ?? 0;
}

/** Delivered messages across one instance's clients within the window — agent-scoped activity chart. */
export async function listEmailActivityForInstance(agentInstanceId: string, days: number): Promise<EmailActivityRow[]> {
  const { rows } = await pool.query<EmailActivityRow>(
    `SELECT COALESCE(e.sent_at, e.created_at) AS at, e.direction
     FROM emails e
     JOIN clients c ON c.id = e.client_id
     WHERE c.agent_instance_id = $1 AND e.status IN ('sent', 'received')
       AND COALESCE(e.sent_at, e.created_at) >= now() - make_interval(days => $2)`,
    [agentInstanceId, days],
  );
  return rows;
}

export async function countFilesForInstance(agentInstanceId: string): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
     FROM document_files f
     JOIN clients c ON c.id = f.client_id
     WHERE c.agent_instance_id = $1`,
    [agentInstanceId],
  );
  return rows[0]?.count ?? 0;
}
