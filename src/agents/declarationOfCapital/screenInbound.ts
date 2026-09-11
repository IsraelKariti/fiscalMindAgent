import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sendWhatsAppTextAndRecord } from '../../twilio/sendAndRecord.js';
import { runInjectionRegexStep, screenForInjection } from '../shared/injectionScreen.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { logger } from '../../util/logger.js';
import type { AgentContext, InboundEvent } from '../types.js';
import type { InjectionBlock } from '../../db/types.js';

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
 */

/** Sent verbatim, no model consulted, when a message is withheld. */
export const BLOCKED_REPLY_HE =
  'קיבלנו את הודעתך, אך היא מכילה תוכן שהמערכת אינה יכולה לעבד. נשמח אם תשלח/י שוב את המידע או המסמכים בנוסח פשוט, ונמשיך משם.';

export async function screenInboundMessage(ctx: AgentContext, evt: InboundEvent): Promise<{ blocked: boolean }> {
  if (!evt.isNewMessage || !evt.messageRowId) return { blocked: false };
  const row = await emails.getById(evt.messageRowId);
  if (!row || row.direction !== 'inbound' || row.blocked) return { blocked: false };
  const text = `${row.channel === 'email' ? `${sanitizeInline(row.subject, 300)}\n` : ''}${sanitizeUntrusted(row.body, 10_000)}`.trim();
  if (text === '') return { blocked: false };

  const client = ctx.client;
  const screenCtx = {
    userId: client.user_id,
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    source: 'inbound_message' as const,
    targetId: row.id,
  };
  let block: InjectionBlock | null = null;
  const regexHit = runInjectionRegexStep(text, screenCtx);
  if (regexHit) {
    block = { detector: 'regex', kind: regexHit.kind, evidence: regexHit.evidence };
  } else {
    try {
      const verdict = await screenForInjection([text], screenCtx);
      if (verdict.suspected) block = { detector: 'llm', kind: null, evidence: verdict.evidence };
    } catch (err) {
      logger.error('inbound message injection screen failed — withholding the message (fail closed)', err, { clientId: client.id, messageId: row.id });
      block = { detector: 'llm', kind: null, evidence: `scan failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
    }
  }
  if (!block) return { blocked: false };

  await emails.markBlocked(row.id, block);
  // One row, the sibling agent's name for it: the message is withheld and
  // every state change of this cycle is suppressed. The row targets the
  // email so the trail links it to the withheld message.
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

  // Fixed reply, no model consulted. Only over WhatsApp (an inbound message just
  // opened the 24h window); email clients hear from the planned follow-up.
  if (row.channel === 'whatsapp' && client.wa_phone && client.agent_instance_id) {
    try {
      const sender = await waSenders.getByInstanceId(client.agent_instance_id);
      if (sender) {
        await sendWhatsAppTextAndRecord(client.id, {
          from: sender.phone_number,
          to: client.wa_phone,
          body: BLOCKED_REPLY_HE,
          reasoning: 'injection screen: fixed reply, no model consulted',
          agentInstanceId: client.agent_instance_id,
        });
      }
    } catch (err) {
      logger.error('blocked-message fixed reply failed', err, { clientId: client.id });
    }
  }
  publishClientUpdated(client.id);
  return { blocked: true };
}
