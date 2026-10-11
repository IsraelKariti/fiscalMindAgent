import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { removeFutureEmail } from './removeFutureEmail.js';
import { resumeAction } from './resumeDecision.js';
import { enqueuePreservedSendNow } from './sendFutureEmailNow.js';
import { setFutureEmail } from './setFutureEmail.js';
import { logger } from '../util/logger.js';

/**
 * Undoes pauseFutureEmail: if the preserved send's scheduled time is still in
 * the future, re-enqueue the very same draft under its original job id and
 * time; if that time passed, send the very same draft right away (openspec
 * `first-message-approval` — the workspace warns the accountant first; the
 * text they read is the text that goes out). Only when nothing was preserved
 * (a reply obsoleted the draft while paused) or the mirror row cannot be
 * re-queued does the agent redraft from current state. Call with
 * clients.paused already cleared and under withClientLock.
 */
export async function resumeFutureEmail(clientId: string): Promise<void> {
  const row = await scheduledJobs.getForClient(clientId);
  const existing = row ? await sendEmailQueue.getJob(row.bullmq_job_id) : null;
  const jobState = existing ? await existing.getState() : null;
  const action = resumeAction({ row, jobState, now: new Date() });

  if (row && action === 'already_queued') {
    // Still (or again) queued — e.g. the pause raced an active send. Nothing to restore.
    publishClientUpdated(clientId);
    return;
  }
  if (row && action === 'restore') {
    // resumeAction only answers 'restore' for a parseable id.
    const emailId = row.bullmq_job_id.split(':')[2] ?? '';
    await sendEmailQueue.add(
      'send_email',
      { clientId, emailId },
      { delay: row.scheduled_for.getTime() - Date.now(), jobId: row.bullmq_job_id },
    );
    logger.info('paused send restored on resume', { clientId, jobId: row.bullmq_job_id, scheduledFor: row.scheduled_for });
    publishClientUpdated(clientId);
    return;
  }
  if (row && action === 'send_now') {
    await enqueuePreservedSendNow(clientId, row.bullmq_job_id);
    logger.info('paused send past its time, sending now on resume', { clientId, jobId: row.bullmq_job_id, scheduledFor: row.scheduled_for });
    return;
  }
  if (row) {
    // Unparseable job id, or a stale completed/failed job squatting on the id
    // (BullMQ would silently ignore a re-add) — fall through to a fresh plan.
    logger.warn('preserved send not restorable, redrafting', { clientId, jobId: row.bullmq_job_id, state: jobState });
  }

  await removeFutureEmail(clientId);
  await setFutureEmail(clientId);
}
