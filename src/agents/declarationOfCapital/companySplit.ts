import { isInstitutionBound } from './catalog.js';
import { identifyInstitution, institutionLabelHe, type Institution } from './institutions.js';
import type { ClientDocumentRow, DocumentFileRow } from '../../db/types.js';

/**
 * Pure rule for the per-company split of a list item that names no company
 * (openspec `unlisted-files`): when the planner's cycle ties files of known
 * companies to such an item ("ביטוח מנהלים ניב"), the item is renamed after
 * the first company and every further company gets a sibling item, each
 * named "<item> — <company>" from the institutions table. The model proposes
 * nothing here — code divides an item the client already agreed to among the
 * companies of the files received for it. No imports of llm/db/audit, so the
 * tests run without a database.
 */

type SplitDocument = Pick<ClientDocumentRow, 'id' | 'name' | 'type_key'>;

export interface SplitPair {
  file_id: string;
  document_id: string;
}

/** The head row keeps its id and takes the first company's name. */
export interface CompanySplitRename {
  documentId: string;
  oldName: string;
  newName: string;
}

/** One sibling row to create for a further company, with the files it takes. */
export interface CompanySplitCreated {
  fromDocumentId: string;
  name: string;
  companyKey: string;
  /** In tie order; the first one is the row's evidence. */
  fileIds: string[];
  evidence: { source: 'file'; file_id: string; issuer: string };
}

export interface CompanySplitPlan<T extends SplitPair> {
  renames: CompanySplitRename[];
  created: CompanySplitCreated[];
  /** The input pairs minus those moved to a created row, in input order (the head keeps its own). */
  pairs: T[];
}

/** Longest issuer text stored as evidence. */
const MAX_ISSUER = 200;

function evidenceIssuer(issuer: string | null | undefined): string {
  return (issuer ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_ISSUER);
}

/**
 * Plans the split for one cycle's allowed pairs. Untouched: pairs to an item
 * of a type no institution issues, to an item that already names a company,
 * to an unknown item, and files whose company the table does not recognise
 * (they stay on the head, renamed or not). Companies are ordered by their
 * first tied file; files of one company share one row.
 */
export function planCompanySplit<T extends SplitPair>(
  pairs: readonly T[],
  fileById: ReadonlyMap<string, DocumentFileRow>,
  documents: readonly SplitDocument[],
  institutions?: readonly Institution[],
): CompanySplitPlan<T> {
  const docById = new Map(documents.map((d) => [d.id, d]));
  const byDocument = new Map<string, T[]>();
  for (const pair of pairs) {
    const list = byDocument.get(pair.document_id);
    if (list) list.push(pair);
    else byDocument.set(pair.document_id, [pair]);
  }

  const renames: CompanySplitRename[] = [];
  const created: CompanySplitCreated[] = [];
  const moved = new Set<T>();

  for (const [documentId, docPairs] of byDocument) {
    const doc = docById.get(documentId);
    if (!doc || !isInstitutionBound(doc.type_key)) continue;
    if (identifyInstitution(doc.name, institutions) !== null) continue;

    let headKey: string | null = null;
    const siblings = new Map<string, CompanySplitCreated>();
    for (const pair of docPairs) {
      const file = fileById.get(pair.file_id);
      const issuer = file?.analysis?.issuer_name ?? null;
      const key = identifyInstitution(issuer, institutions);
      if (key === null) continue; // unrecognised: stays on the head
      if (headKey === null) {
        headKey = key;
        renames.push({ documentId, oldName: doc.name, newName: `${doc.name} — ${institutionLabelHe(key, institutions)}` });
        continue;
      }
      if (key === headKey) continue; // same company as the head: stays on it
      const sibling = siblings.get(key);
      if (sibling) {
        sibling.fileIds.push(pair.file_id);
      } else {
        siblings.set(key, {
          fromDocumentId: documentId,
          name: `${doc.name} — ${institutionLabelHe(key, institutions)}`,
          companyKey: key,
          fileIds: [pair.file_id],
          evidence: { source: 'file', file_id: pair.file_id, issuer: evidenceIssuer(issuer) },
        });
      }
      moved.add(pair);
    }
    created.push(...siblings.values());
  }

  return { renames, created, pairs: pairs.filter((p) => !moved.has(p)) };
}
