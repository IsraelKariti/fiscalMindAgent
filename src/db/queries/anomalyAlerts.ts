import { pool } from '../pool.js';
import type { AuditSeverity } from './auditEvents.js';

export type AlertSeverity = Exclude<AuditSeverity, 'info'>;

export interface AnomalyAlertRow {
  id: string;
  created_at: Date;
  rule: string;
  scope_key: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
  status: 'open' | 'acked';
  notified_at: Date | null;
  acked_by: string | null;
  acked_at: Date | null;
}

/**
 * Inserts an alert unless the same (rule, scope_key) fired within the last
 * `throttleMinutes` — the dedupe that turns a sustained anomaly into one email
 * instead of one per scan. Returns the new row, or null when throttled.
 */
export async function insertIfNotRecent(a: {
  rule: string;
  scopeKey: string;
  severity: AlertSeverity;
  title: string;
  detail: Record<string, unknown>;
  throttleMinutes: number;
}): Promise<AnomalyAlertRow | null> {
  const { rows } = await pool.query<AnomalyAlertRow>(
    `INSERT INTO anomaly_alerts (rule, scope_key, severity, title, detail)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1 FROM anomaly_alerts
       WHERE rule = $1 AND scope_key = $2
         AND created_at > now() - make_interval(mins => $6)
     )
     RETURNING *`,
    [a.rule, a.scopeKey, a.severity, a.title, JSON.stringify(a.detail), a.throttleMinutes],
  );
  return rows[0] ?? null;
}

export async function markNotified(id: string): Promise<void> {
  await pool.query(`UPDATE anomaly_alerts SET notified_at = now() WHERE id = $1`, [id]);
}

/** Acknowledge an open alert. Returns the row, or null when it doesn't exist / is already acked. */
export async function ack(id: string, userId: string): Promise<AnomalyAlertRow | null> {
  const { rows } = await pool.query<AnomalyAlertRow>(
    `UPDATE anomaly_alerts
     SET status = 'acked', acked_by = $2, acked_at = now()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id, userId],
  );
  return rows[0] ?? null;
}

/** Alerts from `since` onward, newest first — open ones always included regardless of age. */
export async function listSince(since: Date): Promise<AnomalyAlertRow[]> {
  const { rows } = await pool.query<AnomalyAlertRow>(
    `SELECT * FROM anomaly_alerts
     WHERE created_at >= $1 OR status = 'open'
     ORDER BY created_at DESC`,
    [since],
  );
  return rows;
}

export async function countOpen(): Promise<number> {
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::float8 AS count FROM anomaly_alerts WHERE status = 'open'`,
  );
  return rows[0]?.count ?? 0;
}
