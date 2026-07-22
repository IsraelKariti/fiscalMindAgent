import { pool } from '../pool.js';
import type { ScheduledJobRow } from '../types.js';

export async function listAll(): Promise<ScheduledJobRow[]> {
  const { rows } = await pool.query<ScheduledJobRow>('SELECT * FROM scheduled_jobs ORDER BY scheduled_for');
  return rows;
}

export async function getForClient(clientId: string): Promise<ScheduledJobRow | null> {
  const { rows } = await pool.query<ScheduledJobRow>('SELECT * FROM scheduled_jobs WHERE client_id = $1', [clientId]);
  return rows[0] ?? null;
}

export async function upsertForClient(clientId: string, bullmqJobId: string, scheduledFor: Date): Promise<void> {
  // Any fresh scheduling supersedes a recorded send failure.
  await pool.query(
    `INSERT INTO scheduled_jobs (client_id, bullmq_job_id, scheduled_for)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET bullmq_job_id = $2, scheduled_for = $3, send_failed_at = NULL, created_at = now()`,
    [clientId, bullmqJobId, scheduledFor],
  );
}

export async function markSendFailed(clientId: string): Promise<void> {
  await pool.query('UPDATE scheduled_jobs SET send_failed_at = now() WHERE client_id = $1', [clientId]);
}

export async function deleteForClient(clientId: string): Promise<void> {
  await pool.query('DELETE FROM scheduled_jobs WHERE client_id = $1', [clientId]);
}
