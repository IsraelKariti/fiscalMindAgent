import * as emails from '../db/queries/emails.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { sendEmailQueue } from '../queue/sendEmailQueue.js';

/** Shared by setFutureEmail (LLM-drafted follow-ups) and the CLI bootstrap script (first outreach email). */
export async function scheduleDraftEmail(
  clientId: string,
  args: { subject: string; body: string; delayMs: number },
): Promise<{ emailId: string; jobId: string }> {
  const draft = await emails.insertDraft(clientId, args.subject, args.body);
  const jobId = `send_email:${clientId}:${draft.id}`;
  const job = await sendEmailQueue.add('send_email', { clientId, emailId: draft.id }, { delay: args.delayMs, jobId });
  if (!job.id) throw new Error('scheduleDraftEmail: enqueued job has no id');
  await scheduledJobs.upsertForClient(clientId, job.id, new Date(Date.now() + args.delayMs));
  return { emailId: draft.id, jobId: job.id };
}
