import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { removeFutureEmail } from './removeFutureEmail.js';
import { setFutureEmail } from './setFutureEmail.js';
import { logger } from '../util/logger.js';

/**
 * Undoes pauseFutureEmail: if the preserved send's scheduled time is still in
 * the future, re-enqueue the very same draft under its original job id and time.
 * Only when nothing was preserved (a reply obsoleted the draft while paused) or
 * the scheduled time passed does the agent redraft from current state. Call with
 * clients.paused already cleared and under withClientLock.
 */
export async function resumeFutureEmail(clientId: string): Promise<void> {
  const row = await scheduledJobs.getForClient(clientId);
  if (row && row.scheduled_for.getTime() > Date.now()) {
    const [, , emailId] = row.bullmq_job_id.split(':');
    const existing = await sendEmailQueue.getJob(row.bullmq_job_id);
    const state = existing ? await existing.getState() : null;
    if (state === 'delayed' || state === 'waiting' || state === 'waiting-children' || state === 'active' || state === 'prioritized') {
      // Still (or again) queued — e.g. the pause raced an active send. Nothing to restore.
      publishClientUpdated(clientId);
      return;
    }
    if (emailId && !existing) {
      await sendEmailQueue.add(
        'send_email',
        { clientId, emailId },
        { delay: row.scheduled_for.getTime() - Date.now(), jobId: row.bullmq_job_id },
      );
      logger.info('paused send restored on resume', { clientId, jobId: row.bullmq_job_id, scheduledFor: row.scheduled_for });
      publishClientUpdated(clientId);
      return;
    }
    // Unparseable job id, or a stale completed/failed job squatting on the id
    // (BullMQ would silently ignore a re-add) — fall through to a fresh plan.
    logger.warn('preserved send not restorable, redrafting', { clientId, jobId: row.bullmq_job_id, state });
  }

  await removeFutureEmail(clientId);
  await setFutureEmail(clientId);
}
