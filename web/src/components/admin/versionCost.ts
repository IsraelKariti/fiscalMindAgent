/**
 * Pure helpers of the admin versions page (openspec `cost-per-version`):
 * delta formatting, token formatting, paging and the remembered filters. The
 * figures themselves come from the server (src/analytics/versionCost.ts);
 * this module only renders them.
 */

export type ClientKind = 'all' | 'live' | 'test';
export const CLIENT_KINDS: ClientKind[] = ['all', 'live', 'test'];
export const STORAGE_KEY = 'fm.versions.filters';
export const PAGE_SIZE = 30;

export interface VersionFilters {
  agentInstanceId: string;
  clients: ClientKind;
}
export const DEFAULT_FILTERS: VersionFilters = { agentInstanceId: 'all', clients: 'all' };

/** `▼ 25%` for a decrease, `▲ 10%` for an increase, `0%` for no change; null → ''. */
export function formatDelta(delta: number | null): string {
  if (delta === null) return '';
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct === 0) return '0%';
  return `${delta < 0 ? '▼' : '▲'} ${pct}%`;
}

/** A decrease is an improvement (cheaper, fewer tokens); an increase a regression. */
export function deltaTone(delta: number | null): 'better' | 'worse' | 'same' | 'none' {
  if (delta === null) return 'none';
  const pct = Math.round(Math.abs(delta) * 100);
  if (pct === 0) return 'same';
  return delta < 0 ? 'better' : 'worse';
}

/** Whole tokens with thousands separators (22,000); null → '—'. */
export function formatTokens(value: number | null, locale = 'he-IL'): string {
  if (value === null) return '—';
  return Math.round(value).toLocaleString(locale);
}

/** `75%` from a share; null → '—'. */
export function formatShare(share: number | null): string {
  return share === null ? '—' : `${Math.round(share * 100)}%`;
}

/** The first `page` pages of the list and whether more remain. */
export function pageOf<T>(items: T[], page: number, size = PAGE_SIZE): { shown: T[]; more: boolean } {
  const end = Math.max(1, page) * size;
  return { shown: items.slice(0, end), more: items.length > end };
}

export function readStoredFilters(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): VersionFilters {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<VersionFilters>;
    return {
      agentInstanceId: typeof parsed.agentInstanceId === 'string' && parsed.agentInstanceId ? parsed.agentInstanceId : 'all',
      clients: CLIENT_KINDS.includes(parsed.clients as ClientKind) ? (parsed.clients as ClientKind) : 'all',
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function writeStoredFilters(filters: VersionFilters, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage unavailable (private window, blocked site data): the page keeps working with its defaults.
  }
}
