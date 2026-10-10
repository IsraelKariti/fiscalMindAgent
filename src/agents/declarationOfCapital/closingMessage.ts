import type { ClientRow, UserRow } from '../../db/types.js';

/**
 * Whether the closing message can go out right now, and with what. Pure: the
 * caller passes the WhatsApp channel state and the instance's sender; a free-form
 * text needs an open 24h window, a sender and the client's number. Otherwise the
 * message is skipped (never replaced by a template) and the reason is recorded.
 */
export function closingMessageDelivery(
  client: Pick<ClientRow, 'name' | 'wa_phone'>,
  accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined,
  wa: { allowed: boolean; windowOpen: boolean },
  sender: { phone_number: string } | null,
): { send: true; from: string; to: string; body: string } | { send: false; reason: string } {
  if (!wa.allowed) return { send: false, reason: 'whatsapp not available for this client' };
  if (!wa.windowOpen) return { send: false, reason: '24h window closed' };
  if (!sender) return { send: false, reason: 'no whatsapp sender on the instance' };
  if (!client.wa_phone) return { send: false, reason: 'client has no whatsapp number' };
  return { send: true, from: sender.phone_number, to: client.wa_phone, body: closingMessageText(client, accountant) };
}

/**
 * The accountant's display name as the client hears it — the same chain the
 * planner prompt uses for `{{accountant_name}}`: admin-entered Hebrew name,
 * then the Google-synced name, then the login email, then a generic role.
 */
export function accountantDisplayName(accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined): string {
  return accountant?.hebrew_name?.trim() || accountant?.name?.trim() || accountant?.email || 'המטפל בתיק';
}

/** The client's first name as the persona addresses them; the whole name when it has no space. */
export function clientFirstName(client: Pick<ClientRow, 'name'>): string {
  const trimmed = client.name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/**
 * The fixed closing message sent once the capital-declaration goal completes
 * (openspec `declaration-completion`): thanks by first name, and the accountant
 * will contact the client if anything else is needed. Code-authored on purpose —
 * the goal_complete answer carries no message, and a fixed text needs no review
 * or scheduling once the goal-complete guards are in force.
 */
export function closingMessageText(client: Pick<ClientRow, 'name'>, accountant: Pick<UserRow, 'name' | 'email' | 'hebrew_name'> | null | undefined): string {
  const first = clientFirstName(client);
  const greeting = first ? `תודה רבה ${first}!` : 'תודה רבה!';
  const accountantName = accountantDisplayName(accountant);
  return `${greeting} קיבלנו את כל מה שצריך להצהרת ההון. אם יהיה צורך במשהו נוסף, רואה החשבון ${accountantName} ייצור איתך קשר.`;
}
