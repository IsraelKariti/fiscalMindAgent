import { logger } from '../../util/logger.js';
import { accountantDisplayName, clientFirstName } from './closingMessage.js';
import type { recordAudit } from '../../audit/audit.js';
import type { AgentContext, InboundEvent } from '../types.js';
import type { ClientDocumentRow, ClientRow, UserRow } from '../../db/types.js';

/**
 * The rules of a client's decline (openspec `client-decline`), free of
 * database, queue and provider imports so tests load them alone: what counts
 * as the decline button, the fixed acknowledgement, and the hand-off routine
 * over injected collaborators. The real wiring is clientDecline.ts.
 */

/** The quick-reply button id of the intro template's decline button (Twilio `ButtonPayload`). */
export const DECLINE_BUTTON_ID = 'decline';
/** The decline button's text, exactly as approved on `capital_declaration_intro_v2` (a tap arrives with this Body). */
export const DECLINE_BUTTON_TEXT = 'לא, אטפל בזה בעצמי';

export type DeclineSource = 'button' | 'planner';

function normalizeButtonText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').replace(/[.!]+$/, '');
}

/**
 * Whether a stored inbound message is the decline button: the tap's payload,
 * or a body that is exactly the button's text (Twilio sends the text as the
 * Body; a client may also type it). Only a new WhatsApp message counts —
 * never a redelivery, never an email. Pure.
 */
export function isDeclineButton(evt: Pick<InboundEvent, 'channel' | 'isNewMessage' | 'buttonPayload'>, body: string | null): boolean {
  if (evt.channel !== 'whatsapp' || !evt.isNewMessage) return false;
  if (evt.buttonPayload === DECLINE_BUTTON_ID) return true;
  return body != null && normalizeButtonText(body) === normalizeButtonText(DECLINE_BUTTON_TEXT);
}

/**
 * The fixed acknowledgement the client hears once: understood, no more
 * messages from the assistant, the documents go straight to the office. Named
 * accountant, first name when known. Pure.
 */
export function declineAckText(client: Pick<ClientRow, 'name'>, accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined): string {
  const first = clientFirstName(client);
  const opening = first ? `הבנתי, תודה ${first}.` : 'הבנתי, תודה.';
  return `${opening} לא אשלח עוד הודעות מכאן. את המסמכים להצהרת ההון אפשר להעביר ישירות למשרד רואה החשבון ${accountantDisplayName(accountant)}.`;
}

/**
 * Whether the acknowledgement can go out right now, and with what — the same
 * conditions as the closing message: an open 24h window (it always is right
 * after the client's message), a sender and the client's number. Pure.
 */
export function declineAckDelivery(
  client: Pick<ClientRow, 'name' | 'wa_phone'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
  wa: { allowed: boolean; windowOpen: boolean },
  sender: { phone_number: string } | null,
): { send: true; from: string; to: string; body: string } | { send: false; reason: string } {
  if (!wa.allowed) return { send: false, reason: 'whatsapp not available for this client' };
  if (!wa.windowOpen) return { send: false, reason: '24h window closed' };
  if (!sender) return { send: false, reason: 'no whatsapp sender on the instance' };
  if (!client.wa_phone) return { send: false, reason: 'client has no whatsapp number' };
  return { send: true, from: sender.phone_number, to: client.wa_phone, body: declineAckText(client, accountant) };
}

/** Names of the documents the accountant still has to get from the client: pending and never-resolved rows. */
export function missingDocumentNames(documents: Pick<ClientDocumentRow, 'name' | 'status'>[]): string[] {
  return documents.filter((d) => d.status === 'pending' || d.status === 'unresolved').map((d) => d.name);
}

/** The collaborators of handleClientDeclineWith — the real ones in handleClientDecline, stubs in tests. */
export interface ClientDeclineDeps {
  markDeclined: (clientId: string) => Promise<ClientRow | null>;
  removeFutureEmail: (clientId: string) => Promise<void>;
  clearDraftingState: (clientId: string) => Promise<void>;
  channelState: (client: ClientRow, now: Date) => Promise<{ allowed: boolean; windowOpen: boolean }>;
  getSender: (instanceId: string) => Promise<{ phone_number: string } | null>;
  sendText: (clientId: string, args: { from: string; to: string; body: string; reasoning: string; agentInstanceId: string | null }) => Promise<{ id: string }>;
  listDocuments: (clientId: string) => Promise<Pick<ClientDocumentRow, 'name' | 'status'>[]>;
  sendDeclinedEmail: (client: ClientRow, missing: string[]) => Promise<void>;
  recordAudit: typeof recordAudit;
  publishClientUpdated: (clientId: string) => void;
  now: () => Date;
}

export interface ClientDeclineOutcome {
  /** False when the client was already declined, complete or deleted: nothing was done. */
  handled: boolean;
  ackSent: boolean;
}

/**
 * The decline routine, in order: claim the client (paused + `declined_at`,
 * conditional so a second decline is a no-op), drop the pending send for
 * good (a resume redrafts from the current state), clear the "drafting…"
 * stamp the webhook set, send the fixed acknowledgement (trace step
 * `send_decline_ack`, sent or skipped with the reason), email the accountant
 * the still-missing documents, and push the workspace update. The stop stands
 * whatever the acknowledgement or the email do. The caller holds the client
 * lock.
 */
export async function handleClientDeclineWith(ctx: AgentContext, source: DeclineSource, deps: ClientDeclineDeps): Promise<ClientDeclineOutcome> {
  const { client } = ctx;
  const claimed = await deps.markDeclined(client.id);
  if (!claimed) {
    logger.info('client decline ignored: already declined, complete or deleted', { clientId: client.id, source });
    return { handled: false, ackSent: false };
  }
  await deps.removeFutureEmail(client.id);
  await deps.clearDraftingState(client.id);
  const audit = { agentInstanceId: client.agent_instance_id, clientId: client.id };
  deps.recordAudit({ ...audit, actorType: 'agent', action: 'client.declined', detail: { clientName: client.name, source } });

  let ackSent = false;
  try {
    const [wa, sender] = await Promise.all([
      deps.channelState(claimed, deps.now()),
      client.agent_instance_id ? deps.getSender(client.agent_instance_id) : null,
    ]);
    const delivery = declineAckDelivery(claimed, ctx.accountant, wa, sender);
    if (delivery.send) {
      const row = await deps.sendText(client.id, {
        from: delivery.from,
        to: delivery.to,
        body: delivery.body,
        reasoning: 'acknowledgement after the client declined the WhatsApp collection',
        agentInstanceId: client.agent_instance_id,
      });
      ackSent = true;
      deps.recordAudit({ ...audit, actorType: 'system', action: 'send_decline_ack', detail: { clientName: client.name, emailId: row.id } });
    } else {
      logger.info('decline acknowledgement skipped', { clientId: client.id, reason: delivery.reason });
      deps.recordAudit({ ...audit, actorType: 'system', action: 'send_decline_ack', detail: { clientName: client.name, skipped: delivery.reason } });
    }
  } catch (err) {
    logger.error('decline acknowledgement failed', err, { clientId: client.id });
    deps.recordAudit({ ...audit, actorType: 'system', action: 'send_decline_ack', detail: { clientName: client.name, skipped: 'send failed' } });
  }

  try {
    const missing = missingDocumentNames(await deps.listDocuments(client.id));
    await deps.sendDeclinedEmail(claimed, missing);
  } catch (err) {
    // The stop stands either way — the workspace shows the declined state.
    logger.error('decline notification failed', err, { clientId: client.id });
  }
  deps.publishClientUpdated(client.id);
  logger.info('client declined the whatsapp collection', { clientId: client.id, source, ackSent });
  return { handled: true, ackSent };
}
