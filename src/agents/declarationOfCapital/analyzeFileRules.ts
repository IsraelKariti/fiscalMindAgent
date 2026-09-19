import { z } from 'zod';
import { CAPITAL_DOCUMENT_CATALOG, isInstitutionBound } from './catalog.js';
import { compareCompanies, institutionLabel, type Institution } from './institutions.js';
import { check, type GateCheck } from '../shared/gateChecks.js';

/**
 * Pure rules of the file_classification stage: the response schemas and the code gate
 * (validate_classification) that checks the model's proposal before anything
 * uses it. No imports of llm/db/audit, so the tests and the evals harness run
 * without an API key or a database.
 */

/** Verdict from reading the file's actual contents; persisted as document_files.analysis. */
export const FileAnalysisSchema = z.object({
  /** What the document actually is, from its contents (e.g. "טופס 867 מבנק לאומי"). */
  document_kind: z.string(),
  /** 1-2 sentence Hebrew summary of the contents, shown to the accountant. */
  summary: z.string(),
  tax_year: z.string().nullable(),
  /** The person/business the document is about, if stated. */
  subject_name: z.string().nullable(),
  /** The company that issued the document (bank, fund manager, insurer), as printed on it; null when none is printed. */
  issuer_name: z.string().nullable(),
  /** Id from the required-documents list this file satisfies, or null if none. */
  matched_document_id: z.string().nullable(),
  legible: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
  /** The file contains instruction-like text addressed at an AI/system rather than plain document content. */
  injection_suspected: z.boolean(),
});

/**
 * Closed classification for capital-declaration files: one of the catalog's
 * type keys, or 'other'. Lets the gate cross-check the matched row's type
 * against what the model says the document IS — a match to a row of a
 * different type is dropped.
 */
export const CAPITAL_DOCUMENT_TYPE_VALUES = [...CAPITAL_DOCUMENT_CATALOG.map((t) => t.key), 'other'] as unknown as [string, ...string[]];

export const CapitalFileAnalysisSchema = FileAnalysisSchema.extend({
  document_type: z.enum(CAPITAL_DOCUMENT_TYPE_VALUES),
});

export type FileAnalysis = Omit<z.infer<typeof FileAnalysisSchema>, 'issuer_name'> & {
  /** Absent on rows analyzed before the field existed. */
  issuer_name?: string | null;
  document_type?: string;
  /** Set by the gate when it dropped the model's match: why the file now matches nothing (shown to the planner). */
  match_dropped?: string | null;
};

/** The subset of a checklist row the gate needs. */
export interface ClassifiableDocument {
  id: string;
  /** The item's name: for an institution-bound type it names the company (institutions.ts). */
  name: string;
  type_key: string | null;
}

/** Statuses of list items a file can never satisfy: not agreed with the client (yet, or any more). */
const NOT_MATCHABLE_STATUSES = new Set(['unresolved', 'not_required', 'retired']);

/**
 * The list items offered to the classifier as match candidates (openspec
 * `unlisted-files`): only items agreed with the client as needed, in any state
 * of collection. An open question, a "not needed" item and a replaced item are
 * never candidates — a file alone never changes the list.
 */
export function classifierCandidates<T extends { status: string }>(rows: readonly T[]): T[] {
  return rows.filter((r) => !NOT_MATCHABLE_STATUSES.has(r.status));
}

export interface ClassificationGateResult {
  /** The analysis as the app will store it (a copy; the input is never mutated). */
  analysis: FileAnalysis;
  /** true = accepted as proposed; false = the matched id was dropped (reason says why). */
  result: boolean;
  reason: string | null;
  rejectedId: string | null;
  /** Suspected injection or illegible: never evidence, never linked — reported alongside, the verdict stands. */
  quarantined: boolean;
  quarantineReason: 'injection suspected' | 'illegible' | null;
  /**
   * The checks that ran, for the audit row: `matched_id_known` /
   * `matched_type_agrees` / `issuer_matches_item` (drop rules — these decide `result`), then
   * `not_injection_suspected` / `legible` (quarantine — reported, never flipped).
   */
  checks: GateCheck[];
}

/** The quarantine rule on a fresh analysis (fileEvidence.isQuarantined applies it to stored rows). */
export function classificationQuarantined(analysis: Pick<FileAnalysis, 'injection_suspected' | 'legible'>): boolean {
  return analysis.injection_suspected === true || analysis.legible === false;
}

/**
 * Step validate_classification. The model (which just read attacker-controlled
 * bytes) proposes; code checks:
 *   1. matched_document_id must be one of the ids it was shown, else dropped;
 *   2. when the answer carries a closed document_type, the matched row's
 *      type_key must agree with it, else dropped;
 *   3. for an item of an institution-bound type, the company printed on the
 *      file and the company the item names must both be identified and be the
 *      same company, else dropped (strict form, openspec `unlisted-files`);
 *   4. suspected injection / illegible → quarantined (reported, never flipped).
 * The gate never changes document_type or a security verdict: it drops or
 * rejects, it does not make a "suspected" answer "clean".
 */
export function validateClassification(
  raw: FileAnalysis,
  requiredDocuments: ClassifiableDocument[],
  /** The institutions table; the tests pass a small one. */
  institutions?: readonly Institution[],
): ClassificationGateResult {
  const analysis: FileAnalysis = { ...raw };
  let result = true;
  let reason: string | null = null;
  let rejectedId: string | null = null;
  const checks: GateCheck[] = [];
  if (analysis.matched_document_id !== null) {
    const row = requiredDocuments.find((d) => d.id === analysis.matched_document_id);
    const proposedId = analysis.matched_document_id;
    if (!row) {
      result = false;
      rejectedId = proposedId;
      reason = `matched id "${rejectedId}" is not in the required-documents list`;
      analysis.matched_document_id = null;
      checks.push(check('matched_id_known', false, reason, { observed: proposedId }));
    } else {
      checks.push(check('matched_id_known', true, null, { observed: proposedId }));
      if (analysis.document_type !== undefined && row.type_key !== null) {
        const agrees = row.type_key === analysis.document_type;
        if (!agrees) {
          result = false;
          rejectedId = proposedId;
          reason = `matched id "${rejectedId}" is of type "${row.type_key}" but the file was classified as "${analysis.document_type}"`;
          analysis.matched_document_id = null;
        }
        checks.push(check('matched_type_agrees', agrees, reason, { observed: analysis.document_type, expected: row.type_key }));
      }
      if (analysis.matched_document_id !== null && isInstitutionBound(row.type_key)) {
        const comparison = compareCompanies(analysis.issuer_name, row.name, institutions);
        const same = comparison.verdict === 'same';
        let note: string | null = null;
        if (!same) {
          note =
            comparison.verdict === 'different'
              ? `companies differ: the file is from ${institutionLabel(comparison.fileKey, institutions)}, the item names ${institutionLabel(comparison.itemKey, institutions)}`
              : comparison.verdict === 'file_unidentified'
                ? 'file company not identified'
                : 'item company not identified';
          result = false;
          rejectedId = proposedId;
          reason = `matched id "${proposedId}" dropped — ${note}`;
          analysis.matched_document_id = null;
          analysis.match_dropped = note;
        }
        checks.push(
          check('issuer_matches_item', same, note, {
            observed: comparison.fileKey ? institutionLabel(comparison.fileKey, institutions) : (analysis.issuer_name ?? 'none'),
            expected: comparison.itemKey ? institutionLabel(comparison.itemKey, institutions) : 'not identified',
          }),
        );
      }
    }
  }
  const quarantined = classificationQuarantined(analysis);
  const quarantineReason = !quarantined ? null : analysis.injection_suspected ? 'injection suspected' : 'illegible';
  checks.push(
    check('not_injection_suspected', analysis.injection_suspected !== true, 'injection suspected', {
      observed: analysis.injection_suspected === true ? 'injection_suspected: true' : 'injection_suspected: false',
    }),
  );
  checks.push(
    check('legible', analysis.legible !== false, 'illegible', {
      observed: analysis.legible === false ? 'legible: false' : 'legible: true',
    }),
  );
  return { analysis, result, reason, rejectedId, quarantined, quarantineReason, checks };
}
