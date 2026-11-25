import type { ClientDocumentRow } from '../../../db/types.js';
import { getCatalogType, papersOf } from '../catalog.js';
import { institutionLabelHe } from '../institutions.js';
import type { FetchDocumentType, FetchProviderSpec } from './providers.js';
import { typeOwnsFetched } from './providers.js';
import type { FetchedDocument } from './types.js';

/**
 * One checklist row to create at delivery for a fetched kind the list lacked
 * (openspec `phoenix-fetch`, requirement "A fetched kind with no Phoenix row
 * creates its own checklist row"). `resolve` settles the client's still-open
 * (or not-needed) catalog row as needed; `add` inserts a sibling under an
 * already-settled row of the type.
 */
export interface FetchedRowPlan {
  kind: string;
  catalogTypeKey: string;
  action: 'resolve' | 'add';
  /** The row to settle (`resolve`) or the anchor to add next to (`add`). */
  targetRowId: string;
  name: string;
  description: string;
  paperKey: string | null;
  /** Indexes into the delivery's document list — every fetched file of this kind. */
  docIndexes: number[];
}

/** Rows the fetched files must never reuse or anchor on. */
const DEAD: ReadonlySet<ClientDocumentRow['status']> = new Set(['retired', 'not_required']);

/**
 * Which fetched kinds need a row of their own, and how to make it. Pure, so
 * the delivery's decisions are unit-testable (tests/fetchedRows.test.ts).
 *
 * For each document type of a `takesAllDocuments` provider that has fetched
 * files in this delivery:
 * - a live row that already names the provider (`matchesRequiredDocument`,
 *   status other than retired / not needed) → nothing to create, the files
 *   attach to it as today;
 * - else the client's catalog row of the type still `unresolved` or settled as
 *   `not_required` → `resolve` it as needed with the provider's name;
 * - else any row of the type that left `unresolved` → `add` a sibling to it;
 * - else (the client has no row of that type at all — ad-hoc lists) → nothing;
 *   the files fall back to the session's primary document as before.
 *
 * The name is the catalog row name for the tax year with the provider's
 * Hebrew name appended (the same joiner the per-company split uses); the
 * site's own report titles stay on the files, never on the row.
 */
export function planFetchedRows(
  spec: Pick<FetchProviderSpec, 'id' | 'documents' | 'takesAllDocuments'>,
  docs: readonly FetchedDocument[],
  clientDocs: readonly ClientDocumentRow[],
  taxYear: number,
): FetchedRowPlan[] {
  if (!spec.takesAllDocuments) return [];
  const plans: FetchedRowPlan[] = [];
  for (const type of spec.documents) {
    const typeKey = type.catalogTypeKey;
    if (!typeKey) continue;
    const docIndexes = docs.flatMap((doc, i) => (typeOwnsFetched(type, doc) ? [i] : []));
    if (docIndexes.length === 0) continue;
    if (clientDocs.some((row) => !DEAD.has(row.status) && type.matchesRequiredDocument(row))) continue;

    const ofType = clientDocs.filter((row) => row.type_key === typeKey);
    const openRow = ofType.find((row) => row.status === 'unresolved' || row.status === 'not_required');
    const anchor = openRow ? null : ofType.find((row) => row.status !== 'unresolved');
    const target = openRow ?? anchor;
    if (!target) continue;

    const catalog = getCatalogType(typeKey);
    if (!catalog) continue;
    const year = String(taxYear);
    const papers = papersOf(typeKey);
    plans.push({
      kind: type.key,
      catalogTypeKey: typeKey,
      action: openRow ? 'resolve' : 'add',
      targetRowId: target.id,
      name: `${catalog.nameHe.replaceAll('{{tax_year}}', year)} — ${institutionLabelHe(spec.id)}`,
      description: catalog.descriptionHe.replaceAll('{{tax_year}}', year),
      paperKey: papers.length === 1 ? papers[0]!.key : null,
      docIndexes,
    });
  }
  return plans;
}

/**
 * The document-type keys a fetch will actually cover: the client-agreed set
 * (per-document consent) intersected with what is still pending; falls back to
 * every pending type when the caller passed nothing (e.g. a single-type provider
 * whose LLM omitted the field). A provider that takes every document it finds
 * (`takesAllDocuments`, openspec `phoenix-fetch`) ignores both: the session
 * always covers every key the provider offers, so the runner downloads the
 * kinds the list lacks too and delivery creates their rows.
 */
export function effectiveFetchKeys(
  agreedKeys: string[] | null,
  pendingKeys: string[],
  spec: Pick<FetchProviderSpec, 'documents' | 'takesAllDocuments'>,
): string[] {
  if (spec.takesAllDocuments) return spec.documents.map((t) => t.key);
  const chosen = agreedKeys && agreedKeys.length > 0 ? agreedKeys.filter((k) => pendingKeys.includes(k)) : pendingKeys;
  return chosen.length > 0 ? chosen : pendingKeys;
}

/** The document type of a provider that owns this fetched file, if any. */
export function owningType(spec: Pick<FetchProviderSpec, 'documents'>, doc: FetchedDocument): FetchDocumentType | undefined {
  return spec.documents.find((t) => typeOwnsFetched(t, doc));
}
