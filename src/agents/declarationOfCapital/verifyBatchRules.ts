/**
 * The pure rules of "reply after verification" (openspec `verification-reply`):
 * a collecting answer (decision 'collect', decisionSchema.ts) carries no
 * message; the just-collected documents are verified as one batch, and one
 * follow-up planning cycle writes the reply. No I/O here — verifyDocument.ts
 * binds it.
 */

/** 'skipped' = no verdict was reached (kill switch, row no longer collected, already stalled, extraction hiccup). */
export type VerificationOutcome = 'approved' | 'reopened' | 'stalled' | 'skipped';

export interface VerificationTarget {
  documentId: string;
  fileId: string;
}

export interface VerificationResult extends VerificationTarget {
  /** 'error' = the verification threw; it never blocks the rest of the batch or the reply. */
  outcome: VerificationOutcome | 'error';
}

/** Verifies the targets one after the other; one throwing target does not stop the batch. */
export async function runVerificationBatch(
  targets: readonly VerificationTarget[],
  verifyOne: (target: VerificationTarget) => Promise<VerificationOutcome>,
  hooks: { beforeEach?: (target: VerificationTarget) => Promise<void>; onError?: (target: VerificationTarget, err: unknown) => void } = {},
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];
  for (const target of targets) {
    try {
      await hooks.beforeEach?.(target);
      results.push({ ...target, outcome: await verifyOne(target) });
    } catch (err) {
      hooks.onError?.(target, err);
      results.push({ ...target, outcome: 'error' });
    }
  }
  return results;
}
