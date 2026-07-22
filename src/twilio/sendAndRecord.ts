import * as emails from '../db/queries/emails.js';
import { sendWhatsAppText } from './send.js';
import type { EmailRow } from '../db/types.js';

/**
 * Persist an outbound WhatsApp message as a draft, send it, then mark it sent —
 * the same order the send worker uses, so the message shows in the client's
 * timeline. A Twilio failure leaves the row in 'draft' status (visible, never
 * re-sent) and rethrows. Returns the stored row so callers can link files to it.
 */
export async function sendWhatsAppTextAndRecord(
  clientId: string,
  args: { from: string; to: string; body: string; reasoning?: string | null },
): Promise<EmailRow> {
  const draft = await emails.insertDraft(clientId, {
    channel: 'whatsapp',
    subject: '',
    body: args.body,
    reasoning: args.reasoning ?? null,
  });
  const { sid } = await sendWhatsAppText({ from: args.from, to: args.to, body: args.body });
  await emails.markSent(draft.id, { messageId: sid, sentAt: new Date() });
  return draft;
}
