import { z } from 'zod';
import { CAPITAL_DOCUMENT_CATALOG } from './catalog.js';
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

export type FileAnalysis = z.infer<typeof FileAnalysisSchema> & { document_type?: string };

/** The subset of a checklist row the gate needs. */
export interface ClassifiableDocument {
  id: string;
  type_key: string | null;
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
   * `matched_type_agrees` (drop rules — these decide `result`), then
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
 *   3. suspected injection / illegible → quarantined (reported, never flipped).
 * The gate never changes document_type or a security verdict: it drops or
 * rejects, it does not make a "suspected" answer "clean".
 */
export function validateClassification(raw: FileAnalysis, requiredDocuments: ClassifiableDocument[]): ClassificationGateResult {
  const analysis: FileAnalysis = { ...raw };
  let result = true;
  let reason: string | null = null;
  let rejectedId: string | null = null;
  const checks: GateCheck[] = [];
  if (analysis.matched_document_id !== null) {
    const row = requiredDocuments.find((d) => d.id === analysis.matched_document_id);
    if (!row) {
      result = false;
      rejectedId = analysis.matched_document_id;
      reason = `matched id "${rejectedId}" is not in the required-documents list`;
      analysis.matched_document_id = null;
      checks.push(check('matched_id_known', false, reason));
    } else {
      checks.push(check('matched_id_known', true));
      if (analysis.document_type !== undefined && row.type_key !== null) {
        const agrees = row.type_key === analysis.document_type;
        if (!agrees) {
          result = false;
          rejectedId = analysis.matched_document_id;
          reason = `matched id "${rejectedId}" is of type "${row.type_key}" but the file was classified as "${analysis.document_type}"`;
          analysis.matched_document_id = null;
        }
        checks.push(check('matched_type_agrees', agrees, reason));
      }
    }
  }
  const quarantined = classificationQuarantined(analysis);
  const quarantineReason = !quarantined ? null : analysis.injection_suspected ? 'injection suspected' : 'illegible';
  checks.push(check('not_injection_suspected', analysis.injection_suspected !== true, 'injection suspected'));
  checks.push(check('legible', analysis.legible !== false, 'illegible'));
  return { analysis, result, reason, rejectedId, quarantined, quarantineReason, checks };
}
