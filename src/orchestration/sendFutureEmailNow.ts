import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { awaitsAdminReview } from './reviewWait.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';

export type SendNowResult = 'promoted' | 'already_sending' | 'none_scheduled' | 'send_failed' | 'awaiting_review';

/**
 * Re-enqueues the mirrored send under its own job id with no delay and stamps
 * the row's time to now. For a job missing from Redis (wipe/eviction) and for
 * a preserved draft the accountant resumes after its planned time passed
 * (openspec `first-message-approval`). Returns false when the job id is
 * unparseable — the caller then logs and falls back.
 */
export async function enqueuePreservedSendNow(clientId: string, bullmqJobId: string): Promise<boolean> {
  const [, jobClientId, emailId] = bullmqJobId.split(':');
  if (!jobClientId || !emailId) return false;
  await sendEmailQueue.add('send_email', { clientId: jobClientId, emailId }, { jobId: bullmqJobId });
  await scheduledJobs.upsertForClient(clientId, bullmqJobId, new Date());
  publishClientUpdated(clientId);
  return true;
}

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
  // Admin review (openspec `review-wait-visibility`): a draft the admin has not
  // approved can only end up held by the worker, so refuse before touching the
  // queue — a stale tab must not promote the job or restamp the planned time.
  const [, , draftId] = row.bullmq_job_id.split(':');
  if (draftId && awaitsAdminReview(await emails.getById(draftId))) return 'awaiting_review';

  const job = await sendEmailQueue.getJob(row.bullmq_job_id);
  if (!job) {
    // Redis lost the job (wipe/eviction before the boot resync ran). The row is
    // the durable mirror — re-enqueue the same draft to fire right away.
    if (!(await enqueuePreservedSendNow(clientId, row.bullmq_job_id))) {
      logger.warn('unparseable bullmq_job_id in scheduled_jobs, cannot send now', { clientId, jobId: row.bullmq_job_id });
      return 'none_scheduled';
    }
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
    // completed: usually the send happened but the post-send cleanup died.
    // Exception (048): the worker consumed the job without sending because the
    // draft is parked awaiting admin review — keep the row (the accountant's
    // "scheduled" bubble must not vanish) and report ok; the admin's approval
    // will re-enqueue the actual send.
    const [, , heldEmailId] = row.bullmq_job_id.split(':');
    if (heldEmailId) {
      const draft = await emails.getById(heldEmailId);
      if (draft?.status === 'held') return 'already_sending';
    }
    // Otherwise drop the stale row so the timeline stops showing a phantom
    // scheduled message.
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
