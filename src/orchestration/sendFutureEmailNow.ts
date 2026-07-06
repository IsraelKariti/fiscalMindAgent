import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

export type SendNowResult = 'promoted' | 'already_sending' | 'none_scheduled';

/**
 * Promotes the client's pending "send_email" job to run immediately; the worker
 * picks it up and sends within seconds. Call under withClientLock so it can't
 * race a redraft swapping the job out.
 */
export async function sendFutureEmailNow(clientId: string): Promise<SendNowResult> {
  const row = await scheduledJobs.getForClient(clientId);
  if (!row) return 'none_scheduled';

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (!job) return 'none_scheduled';

  const state = await job.getState();
  if (state === 'waiting' || state === 'active' || state === 'prioritized') return 'already_sending';
  if (state !== 'delayed') return 'none_scheduled'; // completed/failed: stale tracking row

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
