import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

/** Cancels the client's currently tracked pending "send_email" job, if any. Safe to call with none pending. */
export async function removeFutureEmail(clientId: string): Promise<void> {
  // The pending action is obsolete, so drafts awaiting admin review (048) are
  // too — supersede them so they leave the review queue instead of lingering.
  // Runs before the early return: a pending draft normally has a job row, but
  // a crash between the two writes must not leave a zombie review item.
  await emails.supersedePendingReview(clientId);
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
  publishClientUpdated(clientId);
}
