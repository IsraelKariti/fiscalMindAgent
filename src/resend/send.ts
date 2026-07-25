import { resend } from './client.js';
import { logger } from '../util/logger.js';
import { outboundBlocked, blockedId } from '../util/outboundGuard.js';

export interface EmailAttachment {
  filename: string;
  content: Buffer;
}

export interface SendEmailArgs {
  from: string;
  to: string;
  subject: string;
  body: string;
  /** Message-ID of the message being replied to. */
  inReplyTo?: string;
  /** Message-ID chain of the conversation so far, oldest first. */
  references?: string[];
  attachments?: EmailAttachment[];
}

/**
 * Sends via Resend. Threading is done with standard In-Reply-To/References
 * headers so mail clients group the conversation. Resend's send response only
 * carries its own UUID; the RFC Message-ID is fetched afterwards (it can be
 * briefly unavailable right after send — callers must tolerate null and the
 * next reply simply skips that hop in the References chain).
 */
export async function sendEmail(args: SendEmailArgs): Promise<{ resendId: string; messageId: string | null }> {
  if (outboundBlocked('email', args.to)) return { resendId: blockedId(), messageId: null };

  const headers: Record<string, string> = {};
  if (args.inReplyTo) headers['In-Reply-To'] = args.inReplyTo;
  if (args.references && args.references.length > 0) headers['References'] = args.references.join(' ');

  const { data, error } = await resend.emails.send({
    from: args.from,
    to: args.to,
    subject: args.subject,
    text: args.body,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    attachments: args.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
  if (error || !data) throw new Error(`Resend send failed: ${error?.name ?? 'unknown'} ${error?.message ?? ''}`);

  let messageId: string | null = null;
  try {
    const fetched = await resend.emails.get(data.id);
    messageId = fetched.data?.message_id ?? null;
  } catch (err) {
    logger.warn('could not fetch Message-ID of sent email', { resendId: data.id, err: String(err) });
  }

  return { resendId: data.id, messageId };
}
