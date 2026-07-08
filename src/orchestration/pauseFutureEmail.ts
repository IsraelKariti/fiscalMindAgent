import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

/**
 * Takes the client's pending "send_email" job out of the queue while keeping the
 * scheduled_jobs row and the draft, so resuming before the scheduled time can
 * restore the exact same send (see resumeFutureEmail). Safe to call with none
 * pending. The caller must have set clients.paused first — that flag is what
 * keeps resyncScheduledJobs from re-enqueueing the mirrored row at boot.
 */
export async function pauseFutureEmail(clientId: string): Promise<void> {
  const row = await scheduledJobs.getForClient(clientId);
  if (!row) return;

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (job) {
    const state = await job.getState();
    if (state === 'delayed' || state === 'waiting' || state === 'waiting-children') {
      await job.remove();
    } else {
      // 'active': the send is in flight and BullMQ disallows removal — it completes,
      // and the worker's re-plan sees the paused flag and schedules nothing.
      logger.debug('skipping job removal for non-cancelable state', { clientId, jobId: row.bullmq_job_id, state });
    }
  }
  publishClientUpdated(clientId);
}
