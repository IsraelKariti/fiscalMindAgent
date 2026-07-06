import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';
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
  const jobId = `send_email:${clientId}:${draft.id}`;
  const job = await sendEmailQueue.add('send_email', { clientId, emailId: draft.id }, { delay: args.delayMs, jobId });
  if (!job.id) throw new Error('scheduleDraftMessage: enqueued job has no id');
  await scheduledJobs.upsertForClient(clientId, job.id, new Date(Date.now() + args.delayMs));
  publishClientUpdated(clientId);
  return { emailId: draft.id, jobId: job.id };
}
