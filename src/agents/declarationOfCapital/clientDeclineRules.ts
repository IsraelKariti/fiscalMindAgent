import { logger } from '../../util/logger.js';
import { accountantDisplayName, clientFirstName } from './closingMessage.js';
import { readTaxAdvisor } from './taxAdvisor.js';
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
/** The decline button's text, exactly as approved on `capital_declaration_intro_v3` (a tap arrives with this Body). */
export const DECLINE_BUTTON_TEXT = 'העברה ישירות למשרד';

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

/** The person the acknowledgement sends the client to, and where. */
export interface DeclineContact {
  name: string;
  /** Null only when neither the advisor nor the accountant has an email (never for a kickoff client, see kickoffGate.ts). */
  email: string | null;
}

/**
 * Who handles the client's case, as the acknowledgement names them: the tax
 * advisor stored on the client at kickoff (openspec `client-tax-advisor`) with
 * the advisor's email; the accountant's display name and login email only
 * when no advisor is stored (an admin test client, or a client started before
 * the kickoff gate), and the accountant's email when the stored advisor has
 * none. Pure.
 */
export function declineContact(
  client: Pick<ClientRow, 'agent_fields'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
): DeclineContact {
  const advisor = readTaxAdvisor(client.agent_fields ?? {});
  const accountantEmail = accountant?.email?.trim() || null;
  if (advisor) return { name: advisor.name, email: advisor.email?.trim() || accountantEmail };
  return { name: accountantDisplayName(accountant), email: accountantEmail };
}

/** Twilio caps a free-form WhatsApp body at 1600 characters. */
export const WHATSAPP_BODY_MAX = 1600;

/**
 * The fixed acknowledgement the client hears once: understood, no more
 * messages from the assistant, who handles the case and the email address the
 * documents go to, and every document still missing (openspec
 * `client-decline`). The list is left out when nothing is missing. Returned as
 * the bodies to send in order: one, or the sentences and then the list (split
 * further by lines) when the whole would pass the WhatsApp body limit. Pure.
 */
export function declineAckBodies(
  client: Pick<ClientRow, 'name' | 'agent_fields'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
  missing: string[],
): string[] {
  const first = clientFirstName(client);
  const opening = first ? `הבנתי, תודה ${first}.` : 'הבנתי, תודה.';
  const contact = declineContact(client, accountant);
  const route = contact.email
    ? `הטיפול בתיק שלך בידי ${contact.name}. את המסמכים להצהרת ההון אפשר לשלוח ישירות למייל ${contact.email}.`
    : `הטיפול בתיק שלך בידי ${contact.name}. את המסמכים להצהרת ההון אפשר להעביר ישירות למשרד.`;
  const sentences = `${opening} לא אשלח עוד הודעות מכאן. ${route}`;
  if (missing.length === 0) return [sentences];
  const heading = 'המסמכים שעדיין חסרים:';
  const lines = missing.map((name) => `• ${name}`);
  const whole = `${sentences}\n\n${heading}\n${lines.join('\n')}`;
  if (whole.length <= WHATSAPP_BODY_MAX) return [whole];
  return [sentences, ...chunkLines(heading, lines)];
}

/** The heading and the lines as consecutive bodies, each within the WhatsApp limit; a single over-long line still goes out whole. */
function chunkLines(heading: string, lines: string[]): string[] {
  const bodies: string[] = [];
  let current = heading;
  for (const line of lines) {
    if (current.length + 1 + line.length > WHATSAPP_BODY_MAX && current !== heading) {
      bodies.push(current);
      current = line;
    } else {
      current = `${current}\n${line}`;
    }
  }
  bodies.push(current);
  return bodies;
}

/** The acknowledgement as one text (what the client reads, bodies joined). */
export function declineAckText(
  client: Pick<ClientRow, 'name' | 'agent_fields'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
  missing: string[],
): string {
  return declineAckBodies(client, accountant, missing).join('\n\n');
}

/**
 * Whether the acknowledgement can go out right now, and with what — the same
 * conditions as the closing message: an open 24h window (it always is right
 * after the client's message), a sender and the client's number. Pure.
 */
export function declineAckDelivery(
  client: Pick<ClientRow, 'name' | 'wa_phone' | 'agent_fields'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
  wa: { allowed: boolean; windowOpen: boolean },
  sender: { phone_number: string } | null,
  missing: string[],
): { send: true; from: string; to: string; bodies: string[] } | { send: false; reason: string } {
  if (!wa.allowed) return { send: false, reason: 'whatsapp not available for this client' };
  if (!wa.windowOpen) return { send: false, reason: '24h window closed' };
  if (!sender) return { send: false, reason: 'no whatsapp sender on the instance' };
  if (!client.wa_phone) return { send: false, reason: 'client has no whatsapp number' };
  return { send: true, from: sender.phone_number, to: client.wa_phone, bodies: declineAckBodies(client, accountant, missing) };
}

/** Names of the documents the accountant still has to get from the client: pending and never-resolved rows. */
export function missingDocumentNames(documents: Pick<ClientDocumentRow, 'name' | 'status'>[]): string[] {
  return documents.filter((d) => d.status === 'pending' || d.status === 'unresolved').map((d) => d.name);
}

/** The collaborators of handleClientDeclineWith — the real ones in handleClientDecline, stubs in tests. */
export interface ClientDeclineDeps {
  markDeclined: (clientId: string) => Promise<ClientRow | null>;
  /** Mirrors the (now red) dot to the board's documents status column; fire-and-forget. */
  syncDocumentsStatus: (clientId: string) => Promise<void>;
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
 * stamp the webhook set, read the still-missing documents once, send the
 * fixed acknowledgement naming the advisor, the email and that list (trace
 * step `send_decline_ack`, sent or skipped with the reason; several bodies
 * when the list passes the WhatsApp limit), email the accountant the same
 * list, and push the workspace update. The stop stands whatever the
 * acknowledgement or the email do. The caller holds the client lock.
 */
export async function handleClientDeclineWith(ctx: AgentContext, source: DeclineSource, deps: ClientDeclineDeps): Promise<ClientDeclineOutcome> {
  const { client } = ctx;
  const claimed = await deps.markDeclined(client.id);
  if (!claimed) {
    logger.info('client decline ignored: already declined, complete or deleted', { clientId: client.id, source });
    return { handled: false, ackSent: false };
  }
  void deps.syncDocumentsStatus(client.id);
  await deps.removeFutureEmail(client.id);
  await deps.clearDraftingState(client.id);
  const audit = { agentInstanceId: client.agent_instance_id, clientId: client.id };
  deps.recordAudit({ ...audit, actorType: 'agent', action: 'client.declined', detail: { clientName: client.name, source } });

  // The still-missing documents, read once for the acknowledgement and the
  // email. A failed read never skips the acknowledgement: it goes out without
  // the list, and the email reads again below.
  let missing: string[] | null = null;
  try {
    missing = missingDocumentNames(await deps.listDocuments(client.id));
  } catch (err) {
    logger.error('decline: reading the document list failed, acknowledging without the list', err, { clientId: client.id });
  }

  let ackSent = false;
  try {
    const [wa, sender] = await Promise.all([
      deps.channelState(claimed, deps.now()),
      client.agent_instance_id ? deps.getSender(client.agent_instance_id) : null,
    ]);
    const delivery = declineAckDelivery(claimed, ctx.accountant, wa, sender, missing ?? []);
    if (delivery.send) {
      const ids: string[] = [];
      for (const body of delivery.bodies) {
        const row = await deps.sendText(client.id, {
          from: delivery.from,
          to: delivery.to,
          body,
          reasoning: 'acknowledgement after the client declined the WhatsApp collection',
          agentInstanceId: client.agent_instance_id,
        });
        ids.push(row.id);
      }
      ackSent = true;
      deps.recordAudit({
        ...audit,
        actorType: 'system',
        action: 'send_decline_ack',
        detail: { clientName: client.name, emailId: ids[0], ...(ids.length > 1 ? { emailIds: ids } : {}), missingCount: (missing ?? []).length },
      });
    } else {
      logger.info('decline acknowledgement skipped', { clientId: client.id, reason: delivery.reason });
      deps.recordAudit({ ...audit, actorType: 'system', action: 'send_decline_ack', detail: { clientName: client.name, skipped: delivery.reason } });
    }
  } catch (err) {
    logger.error('decline acknowledgement failed', err, { clientId: client.id });
    deps.recordAudit({ ...audit, actorType: 'system', action: 'send_decline_ack', detail: { clientName: client.name, skipped: 'send failed' } });
  }

  try {
    await deps.sendDeclinedEmail(claimed, missing ?? missingDocumentNames(await deps.listDocuments(client.id)));
  } catch (err) {
    // The stop stands either way — the workspace shows the declined state.
    logger.error('decline notification failed', err, { clientId: client.id });
  }
  deps.publishClientUpdated(client.id);
  logger.info('client declined the whatsapp collection', { clientId: client.id, source, ackSent });
  return { handled: true, ackSent };
}
