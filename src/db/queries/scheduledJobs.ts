import { pool } from '../pool.js';
import type { ScheduledJobRow } from '../types.js';

export async function getForClient(clientId: string): Promise<ScheduledJobRow | null> {
  const { rows } = await pool.query<ScheduledJobRow>('SELECT * FROM scheduled_jobs WHERE client_id = $1', [clientId]);
  return rows[0] ?? null;
}

export async function upsertForClient(clientId: string, bullmqJobId: string, scheduledFor: Date): Promise<void> {
  await pool.query(
    `INSERT INTO scheduled_jobs (client_id, bullmq_job_id, scheduled_for)
     VALUES ($1, $2, $3)
     ON CONFLICT (client_id) DO UPDATE SET bullmq_job_id = $2, scheduled_for = $3, created_at = now()`,
    [clientId, bullmqJobId, scheduledFor],
  );
}

export async function deleteForClient(clientId: string): Promise<void> {
  await pool.query('DELETE FROM scheduled_jobs WHERE client_id = $1', [clientId]);
}
