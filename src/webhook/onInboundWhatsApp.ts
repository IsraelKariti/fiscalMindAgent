import * as agentInstances from '../db/queries/agentInstances.js';
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

  // Route by which of our numbers received the message — each number is
  // dedicated to exactly one agent instance, so the To-number alone decides
  // both the accountant and the agent.
  const sender = await waSenders.getByPhoneNumber(senderNumber);
  if (!sender) {
    logger.warn('inbound whatsapp for unassigned number, ignoring', { to: senderNumber });
    return;
  }
  const instance = await agentInstances.getById(sender.agent_instance_id);
  if (!instance || !instance.enabled) {
    logger.warn('inbound whatsapp for disabled agent instance, ignoring', {
      to: senderNumber,
      instanceId: sender.agent_instance_id,
    });
    return;
  }

  let client = await clients.getByWaPhoneForInstance(instance.id, clientNumber);
  if (!client) {
    // Unknown number: only the customer_service agent auto-enrolls — it
    // answers anyone who messages its number, authenticated by their phone
    // alone. Other agents' clients are pre-created, so strangers are ignored.
    if (instance.agent_type !== 'customer_service') {
      logger.warn('inbound whatsapp from unknown number, ignoring', { from: clientNumber, to: senderNumber });
      return;
    }
    client =
      (await clients.insertWhatsAppOnly({
        userId: instance.user_id,
        agentInstanceId: instance.id,
        name: clientNumber,
        waPhone: clientNumber,
        optedInBy: instance.user_id,
      })) ?? (await clients.getByWaPhoneForInstance(instance.id, clientNumber)); // conflict: a concurrent delivery won the insert
    if (!client) {
      logger.warn('customer service auto-enroll raced and lost, ignoring', { from: clientNumber });
      return;
    }
    logger.info('customer service client auto-created from inbound whatsapp', { clientId: client.id });
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
