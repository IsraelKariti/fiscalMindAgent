import type { ClientRow, UserRow, WaTemplateRow } from '../../db/types.js';
import { isBlockedLocalDate } from '../shared/sendAtGuard.js';
import { logger } from '../../util/logger.js';
import { accountantDisplayName, clientFirstName } from './closingMessage.js';

/**
 * The handoff notice (openspec `handoff-notice`): the one fixed WhatsApp
 * template a client receives on the business morning after the agent stopped
 * at the end of the collection window. This file holds the pure parts — who
 * the notice names, its variables, whether it can go out, and the send and scan
 * routines with their dependencies passed in. The database and provider wiring
 * is handoffNoticeSend.ts (kept apart so tests load no Redis or Postgres).
 */

type Accountant = Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined;

/** How far back a stop may lie and still get the notice: longer than any holiday stretch, short enough that old stops stay silent. */
export const HANDOFF_NOTICE_MAX_AGE_DAYS = 7;

/**
 * Who the notice names: the tax advisor stored on the client when that advisor
 * has an email (matched to the staff list or not), otherwise the accountant —
 * display name as the client already hears it, and the sign-in email.
 */
export function handoffNoticeAdvisor(client: Pick<ClientRow, 'agent_fields'>, accountant: Accountant): { name: string; email: string } {
  const stored = client.agent_fields['tax_advisor'];
  if (stored && typeof stored === 'object') {
    const { name, email } = stored as { name?: unknown; email?: unknown };
    if (typeof name === 'string' && name.trim() && typeof email === 'string' && email.trim()) {
      return { name: name.trim(), email: email.trim() };
    }
  }
  return { name: accountantDisplayName(accountant), email: accountant?.email?.trim() ?? '' };
}

/** The template's three variables, in order: client first name, advisor name, advisor email. */
export function handoffNoticeVariables(client: Pick<ClientRow, 'name' | 'agent_fields'>, accountant: Accountant): string[] {
  const advisor = handoffNoticeAdvisor(client, accountant);
  return [clientFirstName(client), advisor.name, advisor.email];
}

/** The template text with {{1}}..{{n}} filled in, for the timeline. */
export function renderTemplateBody(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (slot, n: string) => variables[Number(n) - 1] ?? slot);
}

export type HandoffNoticeDelivery =
  | { send: true; from: string; to: string; contentSid: string; variables: string[]; renderedBody: string }
  | { send: false; reason: string };

/**
 * Whether the notice can go out, and with what. Always the approved template,
 * open 24h window or not. Skipped (and tried again the next business morning)
 * when nothing can carry it or a variable would be empty — Meta rejects an
 * empty variable.
 */
export function handoffNoticeDelivery(
  client: Pick<ClientRow, 'name' | 'wa_phone' | 'agent_fields'>,
  accountant: Accountant,
  sender: { phone_number: string } | null,
  template: Pick<WaTemplateRow, 'content_sid' | 'body' | 'variable_count'> | null,
): HandoffNoticeDelivery {
  if (!template) return { send: false, reason: 'no handoff template registered' };
  if (!sender) return { send: false, reason: 'no whatsapp sender on the instance' };
  if (!client.wa_phone) return { send: false, reason: 'client has no whatsapp number' };
  const variables = handoffNoticeVariables(client, accountant);
  if (template.variable_count !== variables.length) {
    return { send: false, reason: `handoff template expects ${template.variable_count} variables, the notice has ${variables.length}` };
  }
  if (variables.some((v) => !v.trim())) return { send: false, reason: 'a notice variable is empty (client name or advisor contact)' };
  return {
    send: true,
    from: sender.phone_number,
    to: client.wa_phone,
    contentSid: template.content_sid,
    variables,
    renderedBody: renderTemplateBody(template.body, variables),
  };
}

const DAY_MS = 86_400_000;

/** The oldest stop that still gets a notice, as the ISO string the marker is compared with. */
export function handoffNoticeSince(now: Date): string {
  return new Date(now.getTime() - HANDOFF_NOTICE_MAX_AGE_DAYS * DAY_MS).toISOString();
}

export type HandoffNoticeOutcome = { sent: true } | { sent: false; reason: string };

export interface HandoffNoticeSendDeps {
  adminPaused: (client: ClientRow) => Promise<boolean>;
  /** The delivery for this client: sender, template and accountant resolved. */
  resolveDelivery: (client: ClientRow) => Promise<HandoffNoticeDelivery>;
  claim: (clientId: string, sinceIso: string) => Promise<ClientRow | null>;
  release: (clientId: string) => Promise<void>;
  send: (client: ClientRow, delivery: Extract<HandoffNoticeDelivery, { send: true }>) => Promise<void>;
  published: (clientId: string) => void;
}

/**
 * Sends the handoff notice to one stopped client, at most once per stop
 * (docs/pipeline.md). Skips before claiming leave no mark, so the next
 * business morning tries again. The claim is a conditional UPDATE: it fails
 * when the accountant resumed the client or set a new due date since the
 * listing. A send the provider refused gives the claim back.
 */
export async function sendHandoffNoticeWith(client: ClientRow, now: Date, deps: HandoffNoticeSendDeps): Promise<HandoffNoticeOutcome> {
  if (await deps.adminPaused(client)) return skipped(client, 'admin paused communications');
  const delivery = await deps.resolveDelivery(client);
  if (!delivery.send) return skipped(client, delivery.reason);
  const claimed = await deps.claim(client.id, handoffNoticeSince(now));
  if (!claimed) return skipped(client, 'no longer stopped, or already notified');
  try {
    await deps.send(claimed, delivery);
  } catch (err) {
    await deps.release(client.id);
    logger.error('handoff notice failed, will retry next business morning', err, { clientId: client.id });
    return { sent: false, reason: 'send failed' };
  }
  deps.published(client.id);
  logger.info('handoff notice sent', { clientId: client.id });
  return { sent: true };
}

function skipped(client: ClientRow, reason: string): HandoffNoticeOutcome {
  logger.info('handoff notice skipped', { clientId: client.id, reason });
  return { sent: false, reason };
}

export interface HandoffNoticeScanDeps {
  killSwitchOn: () => Promise<boolean>;
  listDue: (sinceIso: string) => Promise<ClientRow[]>;
  sendOne: (client: ClientRow, now: Date) => Promise<HandoffNoticeOutcome>;
}

/**
 * The 09:00 job (openspec `handoff-notice`): on a business day, tells every
 * client the agent stopped at the end of the collection window, and not yet
 * told, that the conversation ended. On Friday, Saturday, a chag or an erev
 * chag it does nothing — the first later run on an allowed day is "the next
 * business morning", so no send date is stored anywhere.
 */
export async function runHandoffNoticeScanWith(now: Date, timeZone: string, deps: HandoffNoticeScanDeps): Promise<{ due: number; sent: number }> {
  if (await deps.killSwitchOn()) {
    logger.warn('platform kill switch on, skipping handoff notice scan');
    return { due: 0, sent: 0 };
  }
  if (isBlockedLocalDate(now, timeZone)) {
    logger.info('handoff notice scan: not a business day, nothing sent');
    return { due: 0, sent: 0 };
  }
  const due = await deps.listDue(handoffNoticeSince(now));
  let sent = 0;
  for (const client of due) {
    try {
      if ((await deps.sendOne(client, now)).sent) sent += 1;
    } catch (err) {
      logger.error('handoff notice failed', err, { clientId: client.id });
    }
  }
  logger.info('handoff notice scan finished', { due: due.length, sent });
  return { due: due.length, sent };
}
