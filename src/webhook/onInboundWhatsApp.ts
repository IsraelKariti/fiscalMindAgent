import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as waSenders from '../db/queries/waSenders.js';
import { withClientLock } from '../db/withClientLock.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { loadAgentContext } from '../agents/resolve.js';
import { ingestWaMedia, type WaMediaItem } from './ingestWaMedia.js';
import { logger } from '../util/logger.js';

/** The fields of a Twilio inbound-message webhook POST this handler uses. */
export interface TwilioInboundParams {
  MessageSid: string;
  /** e.g. "whatsapp:+972501234567" — the client. */
  From: string;
  /** e.g. "whatsapp:+14155238886" — the accountant's sender number. */
  To: string;
  Body?: string;
  NumMedia?: string;
  [key: string]: string | undefined;
}

/**
 * Standalone messages that mean "stop messaging me here". Deterministic and
 * conservative on purpose (exact match after trimming, not substring): a false
 * positive silently kills the channel, while a miss just leaves it to the
 * accountant to toggle off.
 */
const OPT_OUT_KEYWORDS = new Set([
  'stop',
  'unsubscribe',
  'הסר',
  'הסירו אותי',
  'תפסיקו',
  'תפסיקו לשלוח',
  'לא מעוניין',
  'לא מעוניינת',
  'להסרה',
]);

function isOptOut(body: string): boolean {
  return OPT_OUT_KEYWORDS.has(body.trim().toLowerCase().replace(/[.!]+$/, ''));
}

function stripWhatsAppPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, '');
}

export async function onInboundWhatsApp(params: TwilioInboundParams): Promise<void> {
  const senderNumber = stripWhatsAppPrefix(params.To);
  const clientNumber = stripWhatsAppPrefix(params.From);

  // Route by which of our numbers received the message — that number belongs
  // to exactly one accountant (mirrors the agent-mailbox recipient match).
  const sender = await waSenders.getByPhoneNumber(senderNumber);
  if (!sender) {
    logger.warn('inbound whatsapp for unassigned number, ignoring', { to: senderNumber });
    return;
  }

  // Only this accountant's clients — the same person may be another user's client.
  const client = await clients.getByWaPhoneForUser(sender.user_id, clientNumber);
  if (!client) {
    logger.warn('inbound whatsapp from unknown number, ignoring', { from: clientNumber, to: senderNumber });
    return;
  }

  const body = params.Body ?? '';
  const inserted = await emails.insertInboundIfNew(client.id, {
    channel: 'whatsapp',
    messageId: params.MessageSid,
    subject: '',
    body,
    sentAt: new Date(),
  });
  const messageRow = inserted ?? (await emails.getByMessageIdForClient(client.id, params.MessageSid));

  // Client-side opt-out: flip the channel off before the agent re-plans, so
  // the next decision already sees WhatsApp as unavailable and uses email.
  if (inserted && isOptOut(body)) {
    await clients.disableWhatsApp(client.id);
    logger.info('whatsapp opt-out detected, channel disabled', { clientId: client.id });
  }

  const agent = await loadAgentContext(client);
  if (inserted && agent.definition.conversationModel === 'scheduled_follow_up') {
    // A new reply always leads to a fresh draft, so cancel the now-outdated
    // pending send right away — before the slow media ingestion below — and
    // signal the UI (same contract as inbound email).
    await withClientLock(client.id, () => removeFutureEmail(client.id));
    publishClientUpdated(client.id);
  }

  // Store media before deciding the next step so the LLM sees the files. Runs
  // on duplicate deliveries too: ingestion is idempotent and backfills items a
  // failed earlier run missed.
  const numMedia = Number(params.NumMedia ?? '0') || 0;
  const media: WaMediaItem[] = [];
  for (let i = 0; i < numMedia; i++) {
    const url = params[`MediaUrl${i}`];
    if (url) media.push({ url, contentType: params[`MediaContentType${i}`] ?? '' });
  }
  const newFiles = media.length > 0 ? await ingestWaMedia(client.id, messageRow?.id ?? null, params.MessageSid, media) : 0;

  if (inserted || newFiles > 0) {
    await agent.definition.onInboundMessage(agent, {
      channel: 'whatsapp',
      messageRowId: messageRow?.id ?? null,
      isNewMessage: inserted !== null,
      newFileCount: newFiles,
    });
  }
}
