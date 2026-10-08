import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sendWhatsAppTextAndRecord } from '../../twilio/sendAndRecord.js';
import { runInjectionScreen } from '../shared/injectionScreen.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { logger } from '../../util/logger.js';
import type { AgentContext, InboundEvent } from '../types.js';
import type { ClientRow, EmailRow, InjectionBlock } from '../../db/types.js';

/**
 * The three injection layers on every inbound client message (regex → the
 * dedicated LLM screen → the code check of its proof), BEFORE the planner
 * runs. A hit withholds the message: its text never reaches the planner (the
 * transcript shows a "[message withheld]" marker instead), the client gets a
 * fixed reply over WhatsApp with no model consulted, and the cycle is audited
 * as suppressed. The re-plan still runs afterwards so the scheduled follow-up
 * chain is not broken by an attacker's message.
 *
 * Fails CLOSED: a screen failure blocks like a hit — the accountant sees the
 * audit row and the client is asked to resend.
 *
 * One named function per step: inboundMessageToScreen (which messages are
 * screened), runInjectionScreen (shared, the three layers), withholdMessage,
 * sendBlockedReply.
 */

/** Sent verbatim, no model consulted, when a message is withheld. */
export const BLOCKED_REPLY_HE =
  'קיבלנו את הודעתך, אך היא מכילה תוכן שהמערכת אינה יכולה לעבד. נשמח אם תשלח/י שוב את המידע או המסמכים בנוסח פשוט, ונמשיך משם.';

export async function screenInboundMessage(ctx: AgentContext, evt: InboundEvent): Promise<{ blocked: boolean }> {
  const target = await inboundMessageToScreen(evt);
  if (!target) return { blocked: false };
  const { row, text } = target;
  const client = ctx.client;
  const block = await runInjectionScreen(
    { text: [text] },
    { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id, source: 'inbound_message', targetId: row.id },
    { failureMessage: 'inbound message injection screen failed — withholding the message (fail closed)', logContext: { messageId: row.id } },
  );
  if (!block) return { blocked: false };
  await withholdMessage(client, row, block);
  await sendBlockedReply(client, row);
  publishClientUpdated(client.id);
  return { blocked: true };
}

/**
 * Which messages are screened: only a new inbound message that is not already
 * withheld and has some text. The text is the sanitized body (and the subject,
 * for an email).
 */
async function inboundMessageToScreen(evt: InboundEvent): Promise<{ row: EmailRow; text: string } | null> {
  if (!evt.isNewMessage || !evt.messageRowId) return null;
  const row = await emails.getById(evt.messageRowId);
  if (!row || row.direction !== 'inbound' || row.blocked) return null;
  const text = `${row.channel === 'email' ? `${sanitizeInline(row.subject, 300)}\n` : ''}${sanitizeUntrusted(row.body, 10_000)}`.trim();
  if (text === '') return null;
  return { row, text };
}

/**
 * The message is withheld: marked blocked on its row, and one audit row (the
 * sibling agent's name for it) says every state change of this cycle is
 * suppressed. The row targets the email so the trail links it to the withheld
 * message.
 */
async function withholdMessage(client: ClientRow, row: EmailRow, block: InjectionBlock): Promise<void> {
  await emails.markBlocked(row.id, block);
  recordAudit({
    actorType: 'agent',
    action: 'injection.cycle_suppressed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'email',
    targetId: row.id,
    severity: 'critical',
    suspectedInjection: true,
    detail: { clientName: client.name, source: 'inbound_message_screen', messageId: row.id, channel: row.channel, ...block },
  });
}

/**
 * The fixed reply, no model consulted. Only over WhatsApp (an inbound message
 * just opened the 24h window); email clients hear from the planned follow-up.
 * Best-effort: a send failure is logged, the message stays withheld.
 */
async function sendBlockedReply(client: ClientRow, row: EmailRow): Promise<void> {
  if (row.channel !== 'whatsapp' || !client.wa_phone || !client.agent_instance_id) return;
  try {
    const sender = await waSenders.getByInstanceId(client.agent_instance_id);
    if (!sender) return;
    await sendWhatsAppTextAndRecord(client.id, {
      from: sender.phone_number,
      to: client.wa_phone,
      body: BLOCKED_REPLY_HE,
      reasoning: 'injection screen: fixed reply, no model consulted',
      agentInstanceId: client.agent_instance_id,
    });
  } catch (err) {
    logger.error('blocked-message fixed reply failed', err, { clientId: client.id });
  }
}
