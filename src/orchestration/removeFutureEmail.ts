import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

/** Cancels the client's currently tracked pending "send_email" job, if any. Safe to call with none pending. */
export async function removeFutureEmail(clientId: string): Promise<void> {
  const row = await scheduledJobs.getForClient(clientId);
  if (!row) return;

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (job) {
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting' || state === 'waiting-children') {
      await job.remove();
    } else {
      // 'active': this call is happening from inside onScheduledSend's own processing of this
      // very job -- BullMQ disallows removing an active job; it completes naturally on return.
      // 'completed'/'failed': nothing to remove.
      logger.debug('skipping job removal for non-cancelable state', { clientId, jobId: row.bullmq_job_id, state });
    }
  }
  await scheduledJobs.deleteForClient(clientId);
}
