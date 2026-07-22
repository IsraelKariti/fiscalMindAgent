import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

export type RetrySendResult = 'retried' | 'no_failed_send';

/**
 * Re-attempts a scheduled send whose last attempt threw (send_failed_at set):
 * the same draft is re-fired immediately under its original job id. Call under
 * withClientLock so it can't race a redraft swapping the job out.
 */
export async function retryFailedSend(clientId: string): Promise<RetrySendResult> {
  const row = await scheduledJobs.getForClient(clientId);
  if (!row?.send_failed_at) return 'no_failed_send';

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (job) {
    const state = await job.getState();
    if (state === 'failed') {
      await job.retry();
    } else {
      // The job is somehow live again (e.g. a boot resync raced us) — clearing
      // the failure stamp below lets the normal flow own it.
      logger.warn('retryFailedSend: job not in failed state, only clearing the stamp', {
        clientId,
        jobId: row.bullmq_job_id,
        state,
      });
    }
  } else {
    // Redis lost the failed job — re-enqueue the same draft under its original
    // id. onScheduledSend is idempotent, so a stale row sends nothing.
    const [, jobClientId, emailId] = row.bullmq_job_id.split(':');
    if (!jobClientId || !emailId) {
      logger.warn('unparseable bullmq_job_id in scheduled_jobs, cannot retry', { clientId, jobId: row.bullmq_job_id });
      return 'no_failed_send';
    }
    await sendEmailQueue.add('send_email', { clientId: jobClientId, emailId }, { jobId: row.bullmq_job_id });
  }

  // The upsert clears send_failed_at, so the UI flips back to a pending send.
  await scheduledJobs.upsertForClient(clientId, row.bullmq_job_id, new Date());
  publishClientUpdated(clientId);
  return 'retried';
}
