import type { Accountant, WhitelistEntry } from '../../api';
import { useT } from '../../i18n';

/** Display names for the pickable model ids (brand names, not translated). */
export const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash (Preview)',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (Preview)',
};

/**
 * One row per person: a whitelist entry, the signed-up user account behind it,
 * or both. Emails are the join key (whitelist entries are stored lowercase).
 */
export interface AccountantRow {
  email: string;
  name: string | null;
  /** Admin-entered Hebrew name of the accountant/firm — the name agents sign with. */
  hebrewName: string | null;
  whitelisted: boolean;
  user: Accountant | null;
}

export function buildAccountantRows(accountants: Accountant[], whitelist: WhitelistEntry[]): AccountantRow[] {
  const byEmail = new Map<string, AccountantRow>();
  for (const entry of whitelist) {
    byEmail.set(entry.email, {
      email: entry.email,
      name: entry.name,
      hebrewName: entry.hebrewName,
      whitelisted: true,
      user: null,
    });
  }
  for (const user of accountants) {
    const key = user.email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.user = user;
      existing.name = existing.name ?? user.name;
      existing.hebrewName = existing.hebrewName ?? user.hebrewName;
    } else {
      byEmail.set(key, { email: key, name: user.name, hebrewName: user.hebrewName, whitelisted: user.whitelisted, user });
    }
  }
  return [...byEmail.values()];
}

export type RowStatus = 'active' | 'invited' | 'none';

export function rowStatus(row: AccountantRow): RowStatus {
  if (!row.whitelisted) return 'none';
  // Invited accounts have a user row from the moment of activation (so the
  // admin can configure their agents) — "active" means they actually signed in.
  return row.user?.signedIn ? 'active' : 'invited';
}

/**
 * Selectable tax years: the current year (computed at render time) back 3
 * years, plus the already-configured year when it falls outside that window —
 * the select must always be able to display the stored value.
 */
export function taxYearOptions(configured: number | null): { value: string; label: string }[] {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
  if (configured !== null && !years.includes(configured)) years.push(configured);
  return years.sort((a, b) => b - a).map((year) => ({ value: String(year), label: String(year) }));
}

export function StatusBadge({ row }: { row: AccountantRow }) {
  const { t } = useT();
  const status = rowStatus(row);
  if (status === 'none') {
    return (
      <span className="badge badge-pending" title={t.noAccessTitle}>
        {t.noAccessBadge}
      </span>
    );
  }
  return status === 'active' ? (
    <span className="badge badge-success">{t.activeBadge}</span>
  ) : (
    <span className="badge badge-neutral" title={t.invitedTitle}>
      {t.invitedBadge}
    </span>
  );
}

