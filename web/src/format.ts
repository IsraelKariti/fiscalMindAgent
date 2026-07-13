/** UI locale for dates and times — the app is Hebrew-only. */
export const LOCALE = 'he-IL';

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

/** E.164 → local Israeli format (+972506839593 → 050-683-9593); other countries stay E.164. */
export function formatPhoneForDisplay(e164: string): string {
  const m = /^\+972(\d{8,9})$/.exec(e164);
  if (!m) return e164;
  const local = `0${m[1]}`;
  return local.length === 10
    ? `${local.slice(0, 3)}-${local.slice(3, 6)}-${local.slice(6)}` // mobile: 050-683-9593
    : `${local.slice(0, 2)}-${local.slice(2, 5)}-${local.slice(5)}`; // landline: 03-683-9359
}

/**
 * Auto-enrolled WhatsApp clients keep their raw E.164 number as their name
 * until a board match (or the accountant) renames them — render those in
 * local format too. Anything that isn't a bare phone number passes through.
 */
export function displayClientName(name: string): string {
  return /^\+\d{9,15}$/.test(name) ? formatPhoneForDisplay(name) : name;
}

/**
 * What identifies the client to the accountant. WhatsApp-only clients
 * (auto-enrolled by inbound-only agents) carry a synthetic
 * `wa-<digits>@wa.invalid` mailbox — show their phone number instead.
 */
export function contactLabel(client: { email_address: string; wa_phone: string | null }): string {
  if (client.email_address.endsWith('@wa.invalid') && client.wa_phone) return formatPhoneForDisplay(client.wa_phone);
  return client.email_address;
}

/**
 * The doc-collector agent stopped chasing because the collection due date
 * passed and handed the client off to the accountant.
 */
export function isOverdueStopped(client: {
  goal_status: 'pending' | 'complete';
  agent_fields: { overdue_stopped_at?: string };
}): boolean {
  return client.goal_status === 'pending' && typeof client.agent_fields?.overdue_stopped_at === 'string';
}

/** "YYYY-MM-DD" → localized date, without a time-of-day. */
export function formatDateOnly(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(LOCALE, { dateStyle: 'medium' });
}

/** Compact USD amount for LLM costs, which range from fractions of a cent upward. */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.0001) return '<$0.0001';
  return `$${value.toFixed(value >= 1 ? 2 : 4)}`;
}

/** Compact count for token totals (1.3K / 4.2M), localized. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
