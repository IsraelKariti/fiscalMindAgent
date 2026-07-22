import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

export type SendNowResult = 'promoted' | 'already_sending' | 'none_scheduled' | 'send_failed';

/**
 * Promotes the client's pending "send_email" job to run immediately; the worker
 * picks it up and sends within seconds. Call under withClientLock so it can't
 * race a redraft swapping the job out.
 */
export async function sendFutureEmailNow(clientId: string): Promise<SendNowResult> {
  const row = await scheduledJobs.getForClient(clientId);
  if (!row) return 'none_scheduled';
  // A failed send has its own recovery path (retryFailedSend); the UI disables
  // Send now, so this only catches stale tabs.
  if (row.send_failed_at) return 'send_failed';

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (!job) {
    // Redis lost the job (wipe/eviction before the boot resync ran). The row is
    // the durable mirror — re-enqueue the same draft to fire right away.
    const [, jobClientId, emailId] = row.bullmq_job_id.split(':');
    if (!jobClientId || !emailId) {
      logger.warn('unparseable bullmq_job_id in scheduled_jobs, cannot send now', { clientId, jobId: row.bullmq_job_id });
      return 'none_scheduled';
    }
    await sendEmailQueue.add('send_email', { clientId: jobClientId, emailId }, { jobId: row.bullmq_job_id });
    await scheduledJobs.upsertForClient(clientId, row.bullmq_job_id, new Date());
    publishClientUpdated(clientId);
    return 'promoted';
  }

  const state = await job.getState();
  if (state === 'waiting' || state === 'active' || state === 'prioritized') return 'already_sending';
  if (state === 'failed') {
    // The job already ran and failed but the row predates send-failure stamping
    // (or the stamp itself failed) — record it now so the UI flips to the
    // failed state with Retry.
    await scheduledJobs.markSendFailed(clientId);
    publishClientUpdated(clientId);
    return 'send_failed';
  }
  if (state !== 'delayed') {
    // completed: the send happened but the post-send cleanup died — drop the
    // stale row so the timeline stops showing a phantom scheduled message.
    logger.warn('clearing stale scheduled_jobs row for finished job', { clientId, jobId: row.bullmq_job_id, state });
    await scheduledJobs.deleteForClient(clientId);
    publishClientUpdated(clientId);
    return 'none_scheduled';
  }

  try {
    await job.promote();
  } catch (err) {
    // The delay elapsed between getState and promote — the job is on its way anyway.
    logger.debug('promote failed, job already left delayed state', { clientId, jobId: row.bullmq_job_id, err });
    return 'already_sending';
  }
  await scheduledJobs.upsertForClient(clientId, row.bullmq_job_id, new Date());
  publishClientUpdated(clientId);
  return 'promoted';
}
