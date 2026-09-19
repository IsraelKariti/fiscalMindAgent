import { isInstitutionBound } from './catalog.js';
import { compareCompanies, tieAllowedByCompany, type Institution } from './institutions.js';
import { isSplitParent, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import type { ClientDocumentRow, DocumentFileRow } from '../../db/types.js';

/**
 * Pure rules for the ties the planner proposes between a received file and a
 * list item (openspec `unlisted-files`). The model proposes; code decides:
 *  - a tie to an item of an institution-bound type passes the company check
 *    (same company, or the client's quoted words when a company cannot be
 *    identified; two identified, different companies never);
 *  - a file named for an item created in this cycle is attached only when it is
 *    a real, readable, unattached file of the item's type.
 * No imports of llm/db/audit, so the tests run without a database.
 */

type TieDocument = Pick<ClientDocumentRow, 'id' | 'name' | 'type_key'>;

/** Why code refused a tie; shown in the step detail. */
export type TieRefusal =
  | 'companies_differ'
  | 'company_unidentified_no_client_quote'
  | 'unknown_file'
  | 'split_parent'
  | 'not_verified_legible'
  | 'already_attached'
  | 'type_differs'
  | 'file_already_taken'
  | 'row_not_pending';

/** The company check of one tie; null = allowed. Items of other types are never refused here. */
export function companyRefusal(
  file: DocumentFileRow,
  doc: TieDocument,
  hasEvidence: boolean,
  /** The institutions table; the tests pass a small one. */
  institutions?: readonly Institution[],
): TieRefusal | null {
  if (!isInstitutionBound(doc.type_key)) return null;
  const comparison = compareCompanies(file.analysis?.issuer_name, doc.name, institutions);
  if (tieAllowedByCompany(comparison, hasEvidence)) return null;
  return comparison.verdict === 'different' ? 'companies_differ' : 'company_unidentified_no_client_quote';
}

export interface RefusedTie {
  file_id: string;
  document_id: string;
  reason: TieRefusal;
}

/** Splits the planner's pairs into the ones the company check lets through and the refused ones. */
export function filterPairsByCompany<T extends { file_id: string; document_id: string; evidence: unknown | null }>(
  pairs: readonly T[],
  fileById: ReadonlyMap<string, DocumentFileRow>,
  documents: readonly TieDocument[],
  institutions?: readonly Institution[],
): { allowed: T[]; refused: RefusedTie[] } {
  const docById = new Map(documents.map((d) => [d.id, d]));
  const allowed: T[] = [];
  const refused: RefusedTie[] = [];
  for (const pair of pairs) {
    const file = fileById.get(pair.file_id);
    const doc = docById.get(pair.document_id);
    const reason = file && doc ? companyRefusal(file, doc, pair.evidence !== null, institutions) : null;
    if (reason) refused.push({ file_id: pair.file_id, document_id: pair.document_id, reason });
    else allowed.push(pair);
  }
  return { allowed, refused };
}

/** One row created in this cycle on the client's quoted words, with the files the model named for it. */
export interface NewRowFiles {
  row: Pick<ClientDocumentRow, 'id' | 'name' | 'type_key' | 'status'>;
  fileIds: readonly string[];
}

/**
 * Which named files the rows created in this cycle may take. A file goes to at
 * most one row (the first that names it), a row takes at most one file, and a
 * row born 'claimed' takes none. The row's own evidence is the client's words,
 * so an unidentified company does not block the tie — two identified,
 * different companies still do.
 */
export function assignFilesToNewRows(
  created: readonly NewRowFiles[],
  fileById: ReadonlyMap<string, DocumentFileRow>,
  institutions?: readonly Institution[],
): { pairs: { file_id: string; document_id: string }[]; refused: RefusedTie[] } {
  const taken = new Set<string>();
  const pairs: { file_id: string; document_id: string }[] = [];
  const refused: RefusedTie[] = [];
  for (const { row, fileIds } of created) {
    let attached = false;
    for (const fileId of fileIds) {
      if (attached) break;
      const refuse = (reason: TieRefusal): void => void refused.push({ file_id: fileId, document_id: row.id, reason });
      const file = fileById.get(fileId);
      if (!file) refuse('unknown_file');
      else if (row.status !== 'pending') refuse('row_not_pending');
      else if (isSplitParent(file)) refuse('split_parent');
      else if (!isVerifiedLegibleFile(file)) refuse('not_verified_legible');
      else if (file.client_document_id !== null) refuse('already_attached');
      else if (row.type_key === null || file.analysis?.document_type !== row.type_key) refuse('type_differs');
      else if (taken.has(fileId)) refuse('file_already_taken');
      else {
        const company = companyRefusal(file, row, true, institutions);
        if (company) refuse(company);
        else {
          taken.add(fileId);
          pairs.push({ file_id: fileId, document_id: row.id });
          attached = true;
        }
      }
    }
  }
  return { pairs, refused };
}
