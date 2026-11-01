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

/** A file number as compared in the search (openspec `client-search`): no spaces or dashes, lowercase. */
export function normalizeFileNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\-–—]/g, '').toLowerCase();
}

/**
 * The sidebar search rule: the query (trimmed, lowercase) is a substring of the
 * name, the email, the contact line, or the file number with spaces and
 * dashes ignored on both sides. An empty query matches every client.
 */
export function clientMatchesQuery(
  client: { name: string; email_address: string; wa_phone: string | null; agent_fields?: { file_number?: string } },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (client.name.toLowerCase().includes(q) || client.email_address.toLowerCase().includes(q) || contactLabel(client).toLowerCase().includes(q)) return true;
  const digits = normalizeFileNumber(q);
  return digits !== '' && normalizeFileNumber(client.agent_fields?.file_number).includes(digits);
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

/**
 * The client declined the WhatsApp collection (openspec `client-decline`):
 * the agent stopped and handed the client off to the accountant.
 */
export function isDeclined(client: { goal_status: 'pending' | 'complete'; agent_fields: { declined_at?: string } }): boolean {
  return client.goal_status === 'pending' && typeof client.agent_fields?.declined_at === 'string';
}

/** The client dot's state (openspec `client-status-indicator`); the CSS class is the state with `_` → `-`. */
export type ClientDotState = 'refused' | 'done' | 'window_ended' | 'in_progress';

/**
 * One rule for the dot in the sidebar and the overview list: red when the
 * client refused, green when the agent is finished (goal complete, or the
 * collection window ended), yellow otherwise. Precedence refused > done >
 * window ended > in progress; a missing flag counts as false.
 */
export function clientDotState(client: { goal_status: 'pending' | 'complete'; overdueStopped?: boolean; declined?: boolean }): ClientDotState {
  if (client.declined === true && client.goal_status === 'pending') return 'refused';
  if (client.goal_status === 'complete') return 'done';
  if (client.overdueStopped === true) return 'window_ended';
  return 'in_progress';
}

export function clientDotClass(state: ClientDotState): string {
  return state.replace('_', '-');
}

/** The color the accountant sees for a dot state (openspec `client-search`, status control): the two greens fold together. */
export type DotColor = 'green' | 'yellow' | 'red';
/** The status control's choice: a color, or everyone. */
export type DotFilter = 'all' | DotColor;

export function dotColorOf(state: ClientDotState): DotColor {
  if (state === 'refused') return 'red';
  if (state === 'in_progress') return 'yellow';
  return 'green';
}

/** How many clients of the loaded list each control button stands for. */
export function countByDotColor(states: ClientDotState[]): Record<DotFilter, number> {
  const counts: Record<DotFilter, number> = { all: states.length, green: 0, yellow: 0, red: 0 };
  for (const s of states) counts[dotColorOf(s)] += 1;
  return counts;
}

/** "YYYY-MM-DD" → localized date, without a time-of-day. */
export function formatDateOnly(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(LOCALE, { dateStyle: 'medium' });
}

/** Human file size for attachment rows/chips; size_bytes arrives as a string from pg. */
export function formatFileSize(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
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

const PURPOSE_ACRONYMS = new Set(['llm', 'ocr', 'pdf', 'id', 'api']);

/** `injection_detection_llm` → "Injection Detection LLM" — the label of a stage key with no explicit entry. */
export function humanizePurpose(purpose: string): string {
  return purpose
    .split('_')
    .filter(Boolean)
    .map((w) => (PURPOSE_ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
