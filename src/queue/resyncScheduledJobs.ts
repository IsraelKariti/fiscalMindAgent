import * as clients from '../db/queries/clients.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { withClientLock } from '../db/withClientLock.js';
import { sendEmailQueue } from './sendEmailQueue.js';
import { logger } from '../util/logger.js';

/**
 * Redis is treated as disposable: the scheduled_jobs table in Postgres is the
 * durable mirror of every pending send. On worker boot, any mirrored job
 * missing from Redis (lost to a restart/eviction) is re-enqueued under its
 * original id, firing immediately if its scheduled time already passed.
 * onScheduledSend is idempotent (draft-status + goal checks), so re-enqueueing
 * is safe even if a row is stale.
 */
export async function resyncScheduledJobs(): Promise<void> {
  const rows = await scheduledJobs.listAll();
  let restored = 0;

  for (const row of rows) {
    await withClientLock(row.client_id, async () => {
      // Re-read under the lock — a webhook/worker flow may have replaced it.
      const current = await scheduledJobs.getForClient(row.client_id);
      if (!current || current.bullmq_job_id !== row.bullmq_job_id) return;

      // Paused sends are deliberately absent from Redis (the row preserves the
      // draft and time for resume) — don't resurrect them here.
      const client = await clients.getById(row.client_id);
      if (client?.paused) return;

      // Failed sends wait for a manual retry (retryFailedSend) — auto-refiring
      // them at boot would retry into the same broken provider setup.
      if (current.send_failed_at) return;

      if (await sendEmailQueue.getJob(current.bullmq_job_id)) return;

      const [, clientId, emailId] = current.bullmq_job_id.split(':');
      if (!clientId || !emailId) {
        logger.warn('unparseable bullmq_job_id in scheduled_jobs, skipping', { jobId: current.bullmq_job_id });
        return;
      }

      const delay = Math.max(0, current.scheduled_for.getTime() - Date.now());
      await sendEmailQueue.add('send_email', { clientId, emailId }, { delay, jobId: current.bullmq_job_id });
      restored += 1;
      logger.info('restored scheduled send lost from Redis', {
        clientId,
        jobId: current.bullmq_job_id,
        scheduledFor: current.scheduled_for,
      });
    });
  }

  logger.info('scheduled-jobs resync complete', { mirrored: rows.length, restored });
}
