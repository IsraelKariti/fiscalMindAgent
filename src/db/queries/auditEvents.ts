import { pool } from '../pool.js';

export type AuditActorType = 'agent' | 'admin' | 'accountant' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditEventInsert {
  actorType: AuditActorType;
  actorUserId: string | null;
  agentInstanceId: string | null;
  clientId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: AuditSeverity;
  suspectedInjection: boolean;
  detail: Record<string, unknown>;
}

/** One row of the admin audit page, with the joins resolved to labels. */
export interface AuditEventListRow {
  id: string;
  occurred_at: Date;
  actor_type: AuditActorType;
  actor_user_id: string | null;
  actor_email: string | null;
  agent_instance_id: string | null;
  agent_type: string | null;
  instance_name: string | null;
  client_id: string | null;
  client_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  severity: AuditSeverity;
  suspected_injection: boolean;
  detail: Record<string, unknown>;
}

// This module is deliberately insert + read only — audit_events is append-only
// (enforced by the migration 031 trigger); do not add update/delete functions.

export async function insert(e: AuditEventInsert): Promise<void> {
  await pool.query(
    `INSERT INTO audit_events
       (actor_type, actor_user_id, agent_instance_id, client_id, action,
        target_type, target_id, severity, suspected_injection, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      e.actorType,
      e.actorUserId,
      e.agentInstanceId,
      e.clientId,
      e.action,
      e.targetType,
      e.targetId,
      e.severity,
      e.suspectedInjection,
      JSON.stringify(e.detail),
    ],
  );
}

/**
 * Events from `since` onward, newest first — the admin audit page's raw cube
 * (filtering/grouping happens client-side, like the LLM-usage page). LEFT
 * JOINs tolerate SET-NULL'd FKs: labels for deleted rows live in `detail`.
 */
export async function listSince(since: Date, limit: number): Promise<AuditEventListRow[]> {
  const { rows } = await pool.query<AuditEventListRow>(
    `SELECT e.id, e.occurred_at, e.actor_type, e.actor_user_id, u.email AS actor_email,
            e.agent_instance_id, ai.agent_type, ai.name AS instance_name,
            e.client_id, c.name AS client_name,
            e.action, e.target_type, e.target_id, e.severity, e.suspected_injection, e.detail
     FROM audit_events e
     LEFT JOIN users u            ON u.id = e.actor_user_id
     LEFT JOIN agent_instances ai ON ai.id = e.agent_instance_id
     LEFT JOIN clients c          ON c.id = e.client_id
     WHERE e.occurred_at >= $1
     ORDER BY e.occurred_at DESC
     LIMIT $2`,
    [since, limit],
  );
  return rows;
}

export interface InstanceActionCountRow {
  agent_instance_id: string | null;
  count: number;
}

/**
 * How many of the given actions each agent instance performed in [from, to) —
 * the anomaly scanner's current-window and baseline-window counters.
 */
export async function countByInstanceBetween(
  actions: string[],
  from: Date,
  to: Date,
): Promise<InstanceActionCountRow[]> {
  const { rows } = await pool.query<InstanceActionCountRow>(
    `SELECT agent_instance_id, count(*)::float8 AS count
     FROM audit_events
     WHERE action = ANY($1) AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY agent_instance_id`,
    [actions, from, to],
  );
  return rows;
}

/** Platform-wide count of one action since `since` (e.g. tax-fetch failures in the last hour). */
export async function countActionSince(action: string, since: Date): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::float8 AS count FROM audit_events WHERE action = $1 AND occurred_at >= $2`,
    [action, since],
  );
  return rows[0]?.count ?? 0;
}

export interface ActionOccurrenceRow {
  occurred_at: Date;
  agent_instance_id: string | null;
  client_id: string | null;
}

/** Every occurrence of one action since `since` — for rules that inspect timing (off-hours checks). */
export async function listActionSince(action: string, since: Date): Promise<ActionOccurrenceRow[]> {
  const { rows } = await pool.query<ActionOccurrenceRow>(
    `SELECT occurred_at, agent_instance_id, client_id
     FROM audit_events
     WHERE action = $1 AND occurred_at >= $2
     ORDER BY occurred_at`,
    [action, since],
  );
  return rows;
}
