import type { DocumentFileRow } from '../../db/types.js';

/**
 * Evidence rules for LLM-driven state transitions that hang off received files.
 * The planning LLM proposes; these checks — based only on each file's isolated
 * ingestion-time analysis (which never saw the conversation) — decide what the
 * proposal may actually change. A persuaded planner can therefore no longer
 * flip 'collected' state without a real, readable, non-suspicious file.
 */

/**
 * The file's content analysis is untrustworthy: the analyzer flagged
 * instruction-like content addressed at an AI, or couldn't read the file.
 * Quarantined files never count as evidence and are surfaced as suspicious.
 */
export function isQuarantined(file: DocumentFileRow): boolean {
  if (file.analysis_status !== 'done' || !file.analysis) return false;
  return file.analysis.injection_suspected === true || !file.analysis.legible;
}

/**
 * Strong evidence: the isolated analyzer itself matched this file to the
 * document (it saw only the file bytes and the required list, never the
 * conversation). Enough to auto-mark the document collected.
 */
export function fileMatchesDocument(file: DocumentFileRow, documentId: string): boolean {
  return (
    file.analysis_status === 'done' &&
    file.analysis !== null &&
    !isQuarantined(file) &&
    file.analysis.matched_document_id === documentId
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
