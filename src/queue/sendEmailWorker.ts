import { Worker, type Job } from 'bullmq';
import { redisConnection } from './connection.js';
import { SEND_EMAIL_QUEUE_NAME } from './sendEmailQueue.js';
import { withClientLock } from '../db/withClientLock.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as gmailAccounts from '../db/queries/gmailAccounts.js';
import { sendEmail } from '../gmail/send.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { logger } from '../util/logger.js';

export async function onScheduledSend(job: Job<{ clientId: string; emailId: string }>): Promise<void> {
  const { clientId, emailId } = job.data;

  await withClientLock(clientId, async () => {
    const client = await clients.getById(clientId);
    if (!client) {
      logger.warn('client missing, skipping send', { clientId });
      return;
    }
    if (client.goal_status === 'complete') {
      logger.info('goal already complete, skipping send', { clientId });
      return;
    }

    const draft = await emails.getById(emailId);
    if (!draft || draft.status !== 'draft') {
      // Idempotency: BullMQ retried this job (e.g. after a crash) after it already sent once.
      logger.warn('draft missing or already sent, skipping (retry/duplicate)', { clientId, emailId });
      return;
    }

    const account = client.user_id ? await gmailAccounts.getByUserId(client.user_id) : null;
    if (!account) {
      logger.warn('client owner has no connected Gmail, skipping send', { clientId, userId: client.user_id });
      return;
    }

    const result = await sendEmail(account, {
      to: client.email_address,
      subject: draft.subject,
      body: draft.body,
      threadId: client.gmail_thread_id ?? undefined,
    });

    await emails.markSent(emailId, { gmailMessageId: result.id, gmailThreadId: result.threadId, sentAt: new Date() });
    if (!client.gmail_thread_id) {
      await clients.setThreadId(clientId, result.threadId);
    }

    await removeFutureEmail(clientId);
    await setFutureEmail(clientId);
  });
}

export function createSendEmailWorker(): Worker {
  const worker = new Worker(SEND_EMAIL_QUEUE_NAME, onScheduledSend, { connection: redisConnection });
  worker.on('completed', (job) => logger.info('send_email job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('send_email job failed', err, { jobId: job?.id }));
  return worker;
}
