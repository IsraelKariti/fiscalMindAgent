import * as agentInstances from '../db/queries/agentInstances.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { isSupervisedInstance } from './adminPause.js';
import { sendReviewAlertEmail } from './reviewAlert.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { recordAudit } from '../audit/audit.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
import { logger } from '../util/logger.js';
import type { MessageChannel } from '../db/types.js';

/**
 * Stores the drafted message (email or WhatsApp) and schedules its send.
 * Shared by setFutureEmail (LLM-drafted follow-ups) and the CLI bootstrap
 * script (first outreach email).
 */
export async function scheduleDraftMessage(
  clientId: string,
  args: {
    channel: MessageChannel;
    /** '' on whatsapp drafts. */
    subject: string;
    body: string;
    /** Set on WhatsApp template drafts (sent outside the 24h window). */
    waContentSid?: string | null;
    waContentVariables?: string[] | null;
    delayMs: number;
    reasoning?: string;
  },
): Promise<{ emailId: string; jobId: string }> {
  const draft = await emails.insertDraft(clientId, {
    channel: args.channel,
    subject: args.subject,
    body: args.body,
    reasoning: args.reasoning ?? null,
    waContentSid: args.waContentSid ?? null,
    waContentVariables: args.waContentVariables ?? null,
  });
  // Admin review (048): flag the draft BEFORE the job is enqueued, so even a
  // near-zero delay can't race the worker into sending it unreviewed. The
  // send-time gate in the worker only lets 'approved' drafts through.
  const client = await clients.getById(clientId);
  const instance = client?.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
  const scheduledFor = new Date(Date.now() + args.delayMs);
  if (client && isSupervisedInstance(instance) && instance.review_mode) {
    const pending = await emails.markReviewPending(draft.id);
    if (pending) {
      recordAudit({
        actorType: 'agent',
        action: 'review.message_pending',
        agentInstanceId: instance.id,
        clientId,
        targetType: draft.channel === 'whatsapp' ? 'wa_message' : 'email',
        targetId: draft.id,
        detail: { clientName: client.name, channel: draft.channel, scheduledFor: scheduledFor.toISOString() },
      });
      sendReviewAlertEmail(client, instance, pending, scheduledFor).catch((err) => {
        logger.error('review alert email failed', err, { clientId, draftId: draft.id });
      });
    }
  }

  const jobId = `send_email:${clientId}:${draft.id}`;
  const job = await sendEmailQueue.add('send_email', { clientId, emailId: draft.id }, { delay: args.delayMs, jobId });
  if (!job.id) throw new Error('scheduleDraftMessage: enqueued job has no id');
  await scheduledJobs.upsertForClient(clientId, job.id, scheduledFor);
  publishClientUpdated(clientId);
  return { emailId: draft.id, jobId: job.id };
}
