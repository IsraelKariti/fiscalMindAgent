import * as siteAccess from '../../../db/queries/siteAccess.js';
import { ACCESS_CATALOG, ACCESS_GROUPS, isBuilt, providerProductKeys, type AccessEntry, type AccessGroup } from './accessCatalog.js';
import { NO_DOCUMENTS_ERROR_PREFIX } from './types.js';

/**
 * The admin site-access report (openspec `admin-site-access`): the catalog
 * joined with the session aggregates (db/queries/siteAccess.ts) and the health
 * rule. `buildSiteAccessReport` is pure so the rule is unit-tested; the route
 * calls `loadSiteAccessReport`.
 */

export type SiteHealth = 'no_data' | 'healthy' | 'warning' | 'failing';
export type LastOutcome = 'delivered' | 'failed' | 'no_documents' | 'abandoned' | 'in_progress';

export interface SiteAccessCounts {
  total: number;
  today: number;
  last7: number;
  last30: number;
}

export interface SiteAccessEntryReport {
  site: string;
  product: string;
  nameHe: string;
  built: boolean;
  counts: SiteAccessCounts;
  health: SiteHealth;
  last: { sessionId: string; at: string; outcome: LastOutcome; error: string | null } | null;
}

export interface SiteAccessGroupReport {
  key: AccessGroup;
  size: number;
  builtCount: number;
  totalAccesses: number;
  entries: SiteAccessEntryReport[];
}

export interface SiteAccessReport {
  groups: SiteAccessGroupReport[];
}

export interface SiteAccessInputs {
  counts: siteAccess.SiteAccessCountRow[];
  recent: siteAccess.SiteAccessRecentRow[];
  last: siteAccess.SiteAccessLastRow[];
}

const entryKey = (site: string, product: string) => `${site}/${product}`;

/** Expands a provider × key row to the entry keys it belongs to (NULL key = every product the provider offers). */
function targetsOf(provider: string, documentKey: string | null): string[] {
  const keys = documentKey === null ? providerProductKeys(provider) : [documentKey];
  return keys.map((k) => entryKey(provider, k));
}

/** A "no documents on the site" failure reached the site and got an answer: a successful login. */
export const loginSucceeded = (row: { status: string; error: string | null }): boolean =>
  row.status === 'delivered' || (row.status === 'failed' && (row.error ?? '').startsWith(NO_DOCUMENTS_ERROR_PREFIX));

/** The spec's rule over the finished accesses, newest first. */
export function healthOf(finished: { status: string; error: string | null }[]): SiteHealth {
  const [newest, previous] = finished;
  if (!newest) return 'no_data';
  if (loginSucceeded(newest)) return 'healthy';
  if (previous && !loginSucceeded(previous)) return 'failing';
  return 'warning';
}

function outcomeOf(row: { status: string; error: string | null }): LastOutcome {
  if (row.status === 'delivered') return 'delivered';
  if (row.status === 'failed') return (row.error ?? '').startsWith(NO_DOCUMENTS_ERROR_PREFIX) ? 'no_documents' : 'failed';
  if (row.status === 'expired' || row.status === 'cancelled') return 'abandoned';
  return 'in_progress';
}

export function buildSiteAccessReport(inputs: SiteAccessInputs, catalog: readonly AccessEntry[] = ACCESS_CATALOG): SiteAccessReport {
  const counts = new Map<string, SiteAccessCounts>();
  for (const row of inputs.counts) {
    for (const key of targetsOf(row.provider, row.document_key)) {
      const c = counts.get(key) ?? { total: 0, today: 0, last7: 0, last30: 0 };
      c.total += row.total;
      c.today += row.today;
      c.last7 += row.last7;
      c.last30 += row.last30;
      counts.set(key, c);
    }
  }

  // Rows arrive newest first per bucket; a NULL-key bucket merges into each
  // product's list, so re-sort and keep the two newest per entry.
  const recent = new Map<string, siteAccess.SiteAccessRecentRow[]>();
  for (const row of inputs.recent) {
    for (const key of targetsOf(row.provider, row.document_key)) {
      recent.set(key, [...(recent.get(key) ?? []), row]);
    }
  }
  const finishedOf = (key: string) =>
    (recent.get(key) ?? []).sort((a, b) => b.updated_at.getTime() - a.updated_at.getTime()).slice(0, 2);

  const last = new Map<string, siteAccess.SiteAccessLastRow>();
  for (const row of inputs.last) {
    for (const key of targetsOf(row.provider, row.document_key)) {
      const cur = last.get(key);
      if (!cur || row.updated_at.getTime() > cur.updated_at.getTime()) last.set(key, row);
    }
  }

  const entries = catalog.map((e): SiteAccessEntryReport => {
    const key = entryKey(e.site, e.product);
    const lastRow = last.get(key);
    return {
      site: e.site,
      product: e.product,
      nameHe: e.nameHe,
      built: isBuilt(e),
      counts: counts.get(key) ?? { total: 0, today: 0, last7: 0, last30: 0 },
      health: healthOf(finishedOf(key)),
      last: lastRow ? { sessionId: lastRow.id, at: lastRow.updated_at.toISOString(), outcome: outcomeOf(lastRow), error: lastRow.error } : null,
    };
  });

  const groups = ACCESS_GROUPS.map((g): SiteAccessGroupReport => {
    const own = entries.filter((_, i) => catalog[i]?.group === g);
    return {
      key: g,
      size: own.length,
      builtCount: own.filter((e) => e.built).length,
      totalAccesses: own.reduce((n, e) => n + e.counts.total, 0),
      entries: own,
    };
  });
  return { groups };
}

export async function loadSiteAccessReport(): Promise<SiteAccessReport> {
  const [counts, recent, last] = await Promise.all([siteAccess.countAccesses(), siteAccess.recentFinished(), siteAccess.lastAccess()]);
  return buildSiteAccessReport({ counts, recent, last });
}
