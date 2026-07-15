import { Worker, type Job } from 'bullmq';
import { redisConnection } from './connection.js';
import { SEND_EMAIL_QUEUE_NAME } from './sendEmailQueue.js';
import { withClientLock } from '../db/withClientLock.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as users from '../db/queries/users.js';
import * as waSenders from '../db/queries/waSenders.js';
import { formatFrom } from '../agents/instanceEmail.js';
import { sendEmail } from '../resend/send.js';
import { sendWhatsAppTemplate, sendWhatsAppText } from '../twilio/send.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { isWhatsAppWindowOpen } from '../orchestration/whatsappWindow.js';
import { logger } from '../util/logger.js';
import type { ClientRow, EmailRow } from '../db/types.js';

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
    if (client.paused) {
      // Pausing removes the pending job, so this only catches races (a job that
      // went active as the pause landed) and boot-time resyncs of stale rows.
      logger.info('client paused, skipping send', { clientId });
      return;
    }

    const draft = await emails.getById(emailId);
    if (!draft || draft.status !== 'draft') {
      // Idempotency: BullMQ retried this job (e.g. after a crash) after it already sent once.
      logger.warn('draft missing or already sent, skipping (retry/duplicate)', { clientId, emailId });
      return;
    }

    const sent = draft.channel === 'whatsapp' ? await sendWhatsAppDraft(client, draft) : await sendEmailDraft(client, draft);
    // Either way the pending action is settled — plan the next one. On the
    // not-sent path the abandoned draft simply stays in 'draft' status (the
    // established pattern) and the fresh decision sees the current state.
    if (sent !== 'skip_planning') {
      await removeFutureEmail(clientId);
      await setFutureEmail(clientId);
    }
  });
}

type SendOutcome = 'sent' | 'not_sent' | 'skip_planning';

async function sendEmailDraft(client: ClientRow, draft: EmailRow): Promise<SendOutcome> {
  const mailbox = client.user_id ? await agentMailboxes.getByUserId(client.user_id) : null;
  if (!mailbox) {
    logger.warn('client owner has no agent mailbox, skipping send', { clientId: client.id, userId: client.user_id });
    return 'skip_planning';
  }

  // Each agent sends from its own admin-assigned address with a role display
  // name so clients can tell the conversations apart; legacy clients without
  // an instance (or pre-mandatory-email instances that never got an address)
  // keep the bare account mailbox (their replies route by owner).
  const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
  const sender = instance ? await agentMailboxes.getByInstanceId(instance.id) : null;
  const accountant = client.user_id ? await users.getById(client.user_id) : null;
  const displayName = [accountant?.name, instance?.name].filter(Boolean).join(' – ') || null;

  // Thread the conversation via In-Reply-To/References built from the
  // Message-IDs exchanged with this client so far (capped to the last 20).
  const messageIds = await emails.listMessageIdsForClient(client.id);
  const result = await sendEmail({
    from: formatFrom(displayName, sender?.email_address ?? mailbox.email_address),
    to: client.email_address,
    subject: draft.subject,
    body: draft.body,
    inReplyTo: messageIds.at(-1),
    references: messageIds.slice(-20),
  });

  await emails.markSent(draft.id, { messageId: result.messageId, resendId: result.resendId, sentAt: new Date() });
  return 'sent';
}

async function sendWhatsAppDraft(client: ClientRow, draft: EmailRow): Promise<SendOutcome> {
  // The channel may have been disabled (opt-out, toggle) after drafting; a
  // re-plan falls back to email rather than sending anyway.
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!client.wa_enabled || !client.wa_phone || !sender) {
    logger.warn('whatsapp draft no longer sendable, re-planning', {
      clientId: client.id,
      waEnabled: client.wa_enabled,
      hasPhone: Boolean(client.wa_phone),
      hasSender: Boolean(sender),
    });
    return 'not_sent';
  }

  if (draft.wa_content_sid) {
    const { sid } = await sendWhatsAppTemplate({
      from: sender.phone_number,
      to: client.wa_phone,
      contentSid: draft.wa_content_sid,
      variables: draft.wa_content_variables ?? [],
    });
    await emails.markSent(draft.id, { messageId: sid, sentAt: new Date() });
    return 'sent';
  }

  // Free-form drafts are only deliverable inside the 24h customer-service
  // window. If it closed while the draft waited, don't downgrade silently —
  // re-plan so the LLM decides again (template or email) with current state.
  if (!(await isWhatsAppWindowOpen(client.id))) {
    logger.info('whatsapp 24h window closed before send, re-planning', { clientId: client.id, draftId: draft.id });
    return 'not_sent';
  }

  const { sid } = await sendWhatsAppText({ from: sender.phone_number, to: client.wa_phone, body: draft.body });
  await emails.markSent(draft.id, { messageId: sid, sentAt: new Date() });
  return 'sent';
}

export function createSendEmailWorker(): Worker {
  const worker = new Worker(SEND_EMAIL_QUEUE_NAME, onScheduledSend, { connection: redisConnection });
  worker.on('completed', (job) => logger.info('send_email job completed', { jobId: job.id }));
  worker.on('failed', (job, err) => logger.error('send_email job failed', err, { jobId: job?.id }));
  return worker;
}
