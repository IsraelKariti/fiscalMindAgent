/**
 * Step validate_injection_scan — the code check of the dedicated LLM scan's
 * verdict (injection_screen) against its own proof. Pure: no llm/db/audit
 * imports, so the tests and the evals harness run without an API key.
 *
 * Decision table:
 *   clean + no evidence            → consistent (result true)
 *   clean + evidence               → result false: a clean verdict carries no evidence (stays clean)
 *   hit + no evidence              → result false: hit without evidence (stays a hit, evidence null)
 *   hit + evidence not verbatim    → result false: proof rejected (stays a hit, evidence null)
 *   hit + verbatim evidence        → consistent (result true, evidence kept)
 * A rejected proof NEVER flips a hit to clean — the verdict is a security
 * signal and fails closed; only the evidence is dropped.
 */

export interface InjectionScanRaw {
  suspected_injection: boolean;
  evidence: string | null;
}

export interface InjectionScanGateResult {
  suspected: boolean;
  /** The accepted quote (capped), or null when there is none / it was rejected. */
  evidence: string | null;
  /** true = verdict and proof are consistent. */
  result: boolean;
  reason: string | null;
  /** false when the reviewed text was unavailable (image, thin PDF text layer): the verbatim check was skipped. */
  verbatimChecked: boolean;
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

/**
 * @param text the exact text the scan reviewed, or null when code could not
 *   read it (an image, a PDF without a usable text layer) — then a quote is
 *   still required for a hit, but cannot be checked verbatim.
 */
export function validateInjectionScan(raw: InjectionScanRaw, text: string | null): InjectionScanGateResult {
  const evidence = raw.evidence?.trim() ?? '';
  const verbatimChecked = text !== null;
  if (!raw.suspected_injection) {
    if (evidence === '') return { suspected: false, evidence: null, result: true, reason: null, verbatimChecked };
    return { suspected: false, evidence: null, result: false, reason: 'clean verdict carries evidence', verbatimChecked };
  }
  if (evidence === '') return { suspected: true, evidence: null, result: false, reason: 'hit without evidence', verbatimChecked };
  if (text !== null && !norm(text).includes(norm(evidence))) {
    return {
      suspected: true,
      evidence: null,
      result: false,
      reason: 'evidence not found verbatim in the text under review',
      verbatimChecked,
    };
  }
  return { suspected: true, evidence: evidence.slice(0, 500), result: true, reason: null, verbatimChecked };
}
