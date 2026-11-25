import type { DocumentCostClient } from '../api';

/**
 * Pure helpers of the admin documents tab (openspec
 * `document-cost-analytics`): the remembered filters and the client-side
 * sort. The figures themselves come from the server
 * (src/analytics/documentCost.ts); this module only arranges them.
 */

export type DocumentCostClientKind = 'live' | 'test' | 'all';
export type DocumentCostSort = 'cost' | 'costPerFile' | 'costPerItem' | 'itemsFile' | 'itemsConversation';
export const DOCUMENT_COST_SORTS: DocumentCostSort[] = ['cost', 'costPerFile', 'costPerItem', 'itemsFile', 'itemsConversation'];
export const STORAGE_KEY = 'fm.documentCost';

export interface DocumentCostFilters {
  clients: DocumentCostClientKind;
  completed: boolean;
  sort: DocumentCostSort;
}

export const DEFAULT_FILTERS: DocumentCostFilters = { clients: 'live', completed: false, sort: 'cost' };

export function readStoredFilters(): DocumentCostFilters {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<DocumentCostFilters>;
    return {
      clients: parsed.clients === 'test' || parsed.clients === 'all' ? parsed.clients : 'live',
      completed: parsed.completed === true,
      sort: DOCUMENT_COST_SORTS.includes(parsed.sort as DocumentCostSort) ? (parsed.sort as DocumentCostSort) : 'cost',
    };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function writeStoredFilters(filters: DocumentCostFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // Storage blocked (private mode): the tab still works with the defaults.
  }
}

/** Descending by the chosen column; clients whose value is undefined come last, ties keep the server's cost order. */
export function sortClients(clients: readonly DocumentCostClient[], sort: DocumentCostSort): DocumentCostClient[] {
  const value = (c: DocumentCostClient): number | null => c[sort];
  return [...clients].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });
}
