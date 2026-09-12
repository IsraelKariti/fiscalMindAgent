/**
 * Step validate_injection_scan — the code check of the dedicated LLM scan's
 * verdict (injection_detection_llm) against its own proof. Pure: no llm/db/audit
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
 *
 * Checks reported (only the ones that ran): `clean_without_evidence` on a
 * clean verdict; `hit_has_evidence` on a hit, then `evidence_verbatim` when
 * the hit quoted something and the reviewed text was readable.
 */

import { check, type GateCheck } from './gateChecks.js';

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
  /** The checks that ran, for the audit row. */
  checks: GateCheck[];
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
    const reason = evidence === '' ? null : 'clean verdict carries evidence';
    return {
      suspected: false,
      evidence: null,
      result: reason === null,
      reason,
      verbatimChecked,
      checks: [check('clean_without_evidence', reason === null, reason)],
    };
  }
  if (evidence === '') {
    const reason = 'hit without evidence';
    return { suspected: true, evidence: null, result: false, reason, verbatimChecked, checks: [check('hit_has_evidence', false, reason)] };
  }
  const checks = [check('hit_has_evidence', true)];
  if (text !== null && !norm(text).includes(norm(evidence))) {
    const reason = 'evidence not found verbatim in the text under review';
    checks.push(check('evidence_verbatim', false, reason));
    return { suspected: true, evidence: null, result: false, reason, verbatimChecked, checks };
  }
  if (text !== null) checks.push(check('evidence_verbatim', true));
  return { suspected: true, evidence: evidence.slice(0, 500), result: true, reason: null, verbatimChecked, checks };
}
