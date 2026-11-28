import * as emails from '../db/queries/emails.js';
import { recordAudit } from '../audit/audit.js';
import { sendWhatsAppText, sendWhatsAppTemplate } from './send.js';
import type { EmailRow } from '../db/types.js';

/**
 * Persist an outbound WhatsApp message as a draft, send it, then mark it sent —
 * the same order the send worker uses, so the message shows in the client's
 * timeline. A Twilio failure leaves the row in 'draft' status (visible, never
 * re-sent) and rethrows. Returns the stored row so callers can link files to it.
 */
export async function sendWhatsAppTextAndRecord(
  clientId: string,
  args: {
    from: string;
    to: string;
    body: string;
    reasoning?: string | null;
    /** Owning instance, for the audit trail (callers always know it). */
    agentInstanceId?: string | null;
  },
): Promise<EmailRow> {
  const draft = await emails.insertDraft(clientId, {
    channel: 'whatsapp',
    subject: '',
    body: args.body,
    reasoning: args.reasoning ?? null,
  });
  const { sid } = await sendWhatsAppText({ from: args.from, to: args.to, body: args.body });
  await emails.markSent(draft.id, { messageId: sid, sentAt: new Date() });
  recordAudit({
    actorType: 'agent',
    action: 'wa.text_sent',
    agentInstanceId: args.agentInstanceId ?? null,
    clientId,
    targetType: 'wa_message',
    targetId: draft.id,
    detail: { to: args.to },
  });
  return draft;
}

/**
 * Send an approved template written by code (not by the planner) and record it
 * as a sent outbound message, so it shows in the client's timeline with its
 * rendered text. The send comes first: a provider failure throws before any
 * row exists, so a retry on a later day leaves no dead draft behind.
 */
export async function sendWhatsAppTemplateAndRecord(
  clientId: string,
  args: {
    from: string;
    to: string;
    contentSid: string;
    variables: string[];
    /** The template text with the variables filled in, for the timeline. */
    renderedBody: string;
    reasoning?: string | null;
    agentInstanceId?: string | null;
    clientName?: string | null;
  },
  deps: {
    send: typeof sendWhatsAppTemplate;
    insertDraft: typeof emails.insertDraft;
    markSent: typeof emails.markSent;
    audit: typeof recordAudit;
  } = { send: sendWhatsAppTemplate, insertDraft: emails.insertDraft, markSent: emails.markSent, audit: recordAudit },
): Promise<EmailRow> {
  const { sid } = await deps.send({ from: args.from, to: args.to, contentSid: args.contentSid, variables: args.variables });
  const row = await deps.insertDraft(clientId, {
    channel: 'whatsapp',
    subject: '',
    body: args.renderedBody,
    reasoning: args.reasoning ?? null,
    waContentSid: args.contentSid,
    waContentVariables: args.variables,
  });
  await deps.markSent(row.id, { messageId: sid, sentAt: new Date() });
  deps.audit({
    actorType: 'agent',
    action: 'wa.template_sent',
    agentInstanceId: args.agentInstanceId ?? null,
    clientId,
    targetType: 'wa_message',
    targetId: row.id,
    detail: { clientName: args.clientName ?? null, to: args.to, contentSid: args.contentSid },
  });
  return row;
}
