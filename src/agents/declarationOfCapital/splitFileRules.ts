import { z } from 'zod';
import { check, type GateCheck } from '../shared/gateChecks.js';
import type { PageRange } from './pdfPages.js';

/**
 * Pure rules of the file_splitting stage: the response schema and the code gate
 * (validate_file_split) that checks the model's page ranges before anything is
 * cut. No imports of llm/db/audit, so the tests and the evals harness run
 * without an API key or a database.
 */

/** The most documents one file may be cut into; a larger answer is rejected whole. */
export const MAX_SPLIT_DOCUMENTS = 20;

/** The model's answer: the documents it sees in the file, each a run of consecutive pages (1-based, inclusive). */
export const FileSplitSchema = z.object({
  documents: z.array(
    z.object({
      first_page: z.number().int(),
      last_page: z.number().int(),
      /** A few words naming what the pages look like. Audit-only: no code path branches on it. */
      kind: z.string(),
    }),
  ),
});

export type FileSplit = z.infer<typeof FileSplitSchema>;

export interface FileSplitGateResult {
  /** true = the ranges were accepted (one accepted document means "do not cut"). */
  result: boolean;
  reason: string | null;
  /** The accepted ranges in page order; empty when the answer was rejected. */
  ranges: PageRange[];
  /** The ranges as the model proposed them, for the audit row. */
  proposed: PageRange[];
  /**
   * The checks that ran, for the audit row: `document_count_within_cap`, then
   * `ranges_inside_file`, `ranges_ordered_no_overlap`, `all_pages_covered`.
   * A failed check ends the list — the checks after it did not run.
   */
  checks: GateCheck[];
}

const rangeText = (range: PageRange): string => `${range.from}-${range.to}`;

/**
 * Step validate_file_split. The model (which just read attacker-controlled
 * bytes) proposes page ranges; code accepts them only when:
 *   1. the number of documents is between 1 and MAX_SPLIT_DOCUMENTS;
 *   2. every range lies inside the file and its first page is not after its last;
 *   3. the ranges are in ascending order and share no page;
 *   4. every page of the file belongs to a range, so no page is dropped.
 * A rejected answer cuts nothing — the caller classifies the whole file.
 */
export function validateFileSplit(raw: FileSplit, pageCount: number): FileSplitGateResult {
  const proposed: PageRange[] = raw.documents.map((d) => ({ from: d.first_page, to: d.last_page }));
  const checks: GateCheck[] = [];
  const rejected = (reason: string): FileSplitGateResult => ({ result: false, reason, ranges: [], proposed, checks });

  const count = proposed.length;
  const countOk = count >= 1 && count <= MAX_SPLIT_DOCUMENTS;
  const countReason = count === 0 ? 'the answer lists no documents' : `the answer lists ${count} documents, above the cap of ${MAX_SPLIT_DOCUMENTS}`;
  checks.push(check('document_count_within_cap', countOk, countReason, { observed: String(count), expected: String(MAX_SPLIT_DOCUMENTS) }));
  if (!countOk) return rejected(countReason);

  const observedRanges = proposed.map(rangeText).join(', ');

  const outside = proposed.find((r) => r.from < 1 || r.to > pageCount || r.from > r.to);
  const outsideReason = outside
    ? outside.from > outside.to
      ? `range ${rangeText(outside)} has its first page after its last page`
      : `range ${rangeText(outside)} is outside the file (${pageCount} pages)`
    : null;
  checks.push(check('ranges_inside_file', !outside, outsideReason, { observed: observedRanges, expected: String(pageCount) }));
  if (outsideReason) return rejected(outsideReason);

  let orderReason: string | null = null;
  for (let i = 1; i < proposed.length; i += 1) {
    const previous = proposed[i - 1]!;
    const current = proposed[i]!;
    if (current.from <= previous.to) {
      orderReason =
        current.to < previous.from
          ? `ranges ${rangeText(previous)} and ${rangeText(current)} are not in ascending order`
          : `ranges ${rangeText(previous)} and ${rangeText(current)} share a page`;
      break;
    }
  }
  checks.push(check('ranges_ordered_no_overlap', orderReason === null, orderReason, { observed: observedRanges }));
  if (orderReason) return rejected(orderReason);

  const covered = new Set<number>();
  for (const range of proposed) for (let page = range.from; page <= range.to; page += 1) covered.add(page);
  const missing: number[] = [];
  for (let page = 1; page <= pageCount; page += 1) if (!covered.has(page)) missing.push(page);
  const missingReason = missing.length > 0 ? `pages that belong to no range: ${missing.join(', ')}` : null;
  checks.push(check('all_pages_covered', missing.length === 0, missingReason, { observed: missing.length > 0 ? missing.join(', ') : 'none', expected: 'none' }));
  if (missingReason) return rejected(missingReason);

  return { result: true, reason: null, ranges: proposed, proposed, checks };
}
