import type { Accountant, AccountTier, WhitelistEntry } from '../../api';
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
  whitelisted: boolean;
  /** Null when not whitelisted (the tier lives on the whitelist entry). */
  tier: AccountTier | null;
  user: Accountant | null;
}

export function buildAccountantRows(accountants: Accountant[], whitelist: WhitelistEntry[]): AccountantRow[] {
  const byEmail = new Map<string, AccountantRow>();
  for (const entry of whitelist) {
    byEmail.set(entry.email, { email: entry.email, name: entry.name, whitelisted: true, tier: entry.tier, user: null });
  }
  for (const user of accountants) {
    const key = user.email.toLowerCase();
    const existing = byEmail.get(key);
    if (existing) {
      existing.user = user;
      existing.name = existing.name ?? user.name;
    } else {
      byEmail.set(key, { email: key, name: user.name, whitelisted: user.whitelisted, tier: user.tier, user });
    }
  }
  return [...byEmail.values()];
}

export type RowStatus = 'active' | 'invited' | 'none';

export function rowStatus(row: AccountantRow): RowStatus {
  if (!row.whitelisted) return 'none';
  return row.user ? 'active' : 'invited';
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

export function TierBadge({ row }: { row: AccountantRow }) {
  const { t } = useT();
  return row.tier === 'premium' ? <span className="badge badge-premium">{t.tierPremium}</span> : null;
}
