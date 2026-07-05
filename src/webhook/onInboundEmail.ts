import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import { withClientLock } from '../db/withClientLock.js';
import { env } from '../config/env.js';
import { resend } from '../resend/client.js';
import { parseEmailAddress } from '../util/email.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { ingestAttachments } from './ingestAttachments.js';
import { logger } from '../util/logger.js';

/** `data` of a Resend `email.received` webhook event (metadata only — the body is fetched by id). */
export interface ResendInboundData {
  /** Resend's id for the received email; some payload versions call it `email_id`, others `id`. */
  email_id?: string;
  id?: string;
  from: string;
  to: string[];
  subject: string;
  message_id?: string;
  created_at: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export async function onInboundEmail(data: ResendInboundData): Promise<void> {
  const resendId = data.email_id ?? data.id;
  if (!resendId) {
    logger.warn('inbound event missing email id, ignoring');
    return;
  }

  // The inbound MX is a domain catch-all: anyone can mail any local part, so
  // only recipients matching an allocated agent mailbox are processed.
  const domainSuffix = `@${env.AGENT_EMAIL_DOMAIN.toLowerCase()}`;
  const recipient = data.to.map((t) => parseEmailAddress(t)).find((t) => t.endsWith(domainSuffix));
  const mailbox = recipient ? await agentMailboxes.getByEmailAddress(recipient) : null;
  if (!mailbox) {
    logger.warn('inbound email for unallocated address, ignoring', { to: data.to });
    return;
  }

  const fromAddress = parseEmailAddress(data.from);
  if (fromAddress === mailbox.email_address) return; // our own mail looping back

  // Only this mailbox owner's clients — the same address may be another user's client.
  const client = await clients.getByEmailAddressForUser(mailbox.user_id, fromAddress);
  if (!client) {
    logger.warn('inbound email from unknown address, ignoring', { fromAddress, mailbox: mailbox.email_address });
    return;
  }

  // The webhook event carries metadata only; the body lives behind the receiving API.
  const { data: full, error } = await resend.emails.receiving.get(resendId);
  if (error || !full) {
    throw new Error(`failed to fetch received email ${resendId}: ${error?.name ?? 'unknown'} ${error?.message ?? ''}`);
  }
  const body = full.text ?? (full.html ? stripHtml(full.html) : '');

  const messageId = data.message_id ?? full.message_id ?? `<resend-${resendId}@inbound>`;
  const inserted = await emails.insertInboundIfNew(client.id, {
    messageId,
    resendId,
    subject: data.subject,
    body,
    sentAt: new Date(data.created_at),
  });
  const emailRow = inserted ?? (await emails.getByMessageId(messageId));

  if (inserted) {
    // A new reply always leads to a fresh draft, so cancel the now-outdated pending send
    // right away — before the slow attachment ingestion below — and signal the UI: the
    // timeline must never show the reply alongside the scheduled email it obsoletes, and
    // should show its "drafting" placeholder for the whole time the agent is deciding.
    await withClientLock(client.id, () => removeFutureEmail(client.id));
    publishClientUpdated(client.id);
  }

  // Store attachments before deciding the next step so the LLM sees the files.
  // Runs on duplicate deliveries too (inserted === null): ingestion is
  // idempotent and this backfills attachments a failed earlier run missed.
  const newFiles = await ingestAttachments(client.id, emailRow?.id ?? null, resendId, full.attachments ?? []);

  if (inserted || newFiles > 0) {
    await withClientLock(client.id, async () => {
      // The remove is a no-op for a fresh reply (canceled above); it still matters on the
      // duplicate-delivery path where backfilled attachments trigger a redraft.
      await removeFutureEmail(client.id);
      await setFutureEmail(client.id);
    });
  }
}
