import type { DocumentFileRow } from '../../db/types.js';

/**
 * Evidence rules for LLM-driven state transitions that hang off received files.
 * The planning LLM proposes; these checks — based only on each file's isolated
 * ingestion-time analysis (which never saw the conversation) — decide what the
 * proposal may actually change. A persuaded planner can therefore no longer
 * flip 'collected' state without a real, readable, non-suspicious file.
 */

/**
 * The file's content analysis is untrustworthy: the injection screen blocked
 * the file, the analyzer flagged instruction-like content addressed at an AI,
 * or it couldn't read the file.
 * Quarantined files never count as evidence and are surfaced as suspicious.
 */
export function isQuarantined(file: DocumentFileRow): boolean {
  // The injection screen blocked it before classification (054).
  if (file.analysis_status === 'blocked') return true;
  // 'not_needed' (platform-fetched, 057) and 'split' (the parent of a cut
  // multi-document PDF, 058) are neither quarantined nor evidence: they fall
  // through the `!== 'done'` checks below and in the helpers after.
  if (file.analysis_status !== 'done' || !file.analysis) return false;
  return file.analysis.injection_suspected === true || !file.analysis.legible;
}

/**
 * The parent of a multi-document PDF that was cut into one child per document
 * (058). It is kept only as the original the client sent: never evidence and
 * never filed under a document — its children are, each on its own.
 */
export function isSplitParent(file: DocumentFileRow): boolean {
  return file.analysis_status === 'split';
}

/**
 * The planner's file↔document pairs that may be applied at all: both ids are
 * known, and the file is not a split parent. (Quarantined files stay in the
 * list — they never count as evidence and are skipped at filing time.)
 */
export function applicableFilePairs<T extends { file_id: string; document_id: string }>(
  pairs: readonly T[],
  fileById: ReadonlyMap<string, DocumentFileRow>,
  documentIds: ReadonlySet<string>,
): T[] {
  return pairs.filter((m) => {
    const file = fileById.get(m.file_id);
    return file !== undefined && documentIds.has(m.document_id) && !isSplitParent(file);
  });
}

/**
 * Strong evidence: the isolated analyzer itself matched this file to the
 * document (it saw only the file bytes and the required list, never the
 * conversation). Enough to auto-mark the document collected. A file already
 * filed under another document is evidence for that one only — e.g. a Clal
 * child the classifier matched to "ביטוח מנהלים ניב" and the per-company
 * split then filed under the Clal item (openspec `unlisted-files`) no longer
 * backs the renamed Harel item its stored analysis still names.
 */
export function fileMatchesDocument(file: DocumentFileRow, documentId: string): boolean {
  return (
    file.analysis_status === 'done' &&
    file.analysis !== null &&
    !isQuarantined(file) &&
    file.analysis.matched_document_id === documentId &&
    (file.client_document_id === null || file.client_document_id === documentId)
  );
}

/**
 * Medium evidence: a real, readable, non-suspicious file whose kind the
 * planner judged to satisfy a document the analyzer didn't (or couldn't)
 * match — e.g. a document row created after the file arrived. Enough to
 * auto-collect when the planner explicitly paired file and document.
 */
export function isVerifiedLegibleFile(file: DocumentFileRow): boolean {
  return file.analysis_status === 'done' && file.analysis !== null && !isQuarantined(file);
}
