import type { VerificationChecks } from './catalog.js';

/**
 * The deterministic half of the verification pipeline: pure code checks over
 * the fields the extractor pulled from the file. No LLM here — an LLM verdict
 * alone must never be able to approve a document; these checks against known
 * ground truth (the client record, the valuation date) are what decide.
 * Failure reasons are Hebrew — they go to the planner prompt (which relays
 * them to the client) and to the workspace UI.
 */

/** What the extraction Gemini call returns (schema in verifyDocument.ts). */
export interface ExtractedFields {
  /** The file's contents actually are a document of the expected type. */
  is_expected_type: boolean;
  /** What the document actually is, from its contents. */
  actual_kind: string;
  /** The issuing institution (bank, insurer, registry), if stated. */
  issuer: string | null;
  /** The person/business the document is about, as printed. */
  subject_name: string | null;
  /** The subject's national id (ת"ז), digits only, if printed. */
  subject_id_number: string | null;
  /** The date the balances/holdings refer to, "YYYY-MM-DD", if stated. */
  as_of_date: string | null;
  /** The document's main monetary values. */
  amounts: { label: string; value: number; currency: string }[];
  legible: boolean;
  injection_suspected: boolean;
}

export interface CheckContext {
  clientName: string;
  /** National id from client_portal_credentials, when on file (accountant-imported — trusted). */
  credentialIdNumber: string | null;
  taxYear: number;
  checks: VerificationChecks;
}

export interface CheckResult {
  key: string;
  passed: boolean;
  /** Hebrew failure reason; null when passed. */
  reason: string | null;
}

export interface ChecksVerdict {
  passed: boolean;
  /** The failed checks' reasons, in order. */
  reasons: string[];
  checks: CheckResult[];
}

/** Standard Israeli national-id check digit (9 digits, weights 1/2 alternating). */
export function isValidIsraeliId(id: string): boolean {
  const digits = id.replace(/\D/g, '');
  if (digits.length === 0 || digits.length > 9) return false;
  const padded = digits.padStart(9, '0');
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let value = Number(padded[i]) * (i % 2 === 0 ? 1 : 2);
    if (value > 9) value -= 9;
    sum += value;
  }
  return sum % 10 === 0;
}

/** Lowercase, strip punctuation/quotes, split to tokens of 2+ chars. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/["'`״׳.,()-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/**
 * Loose name comparison for "is this document about our client": true when the
 * two names share at least one real token. Deliberately forgiving — clients
 * appear as "ישראל ישראלי", "י. ישראלי" or with a spouse's name attached; the
 * check exists to catch a *different person's* document, not spelling drift.
 */
export function namesLooselyMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  return ta.some((t) => tb.has(t));
}

const MAX_SANE_AMOUNT = 1e12;

export function runChecks(fields: ExtractedFields, ctx: CheckContext): ChecksVerdict {
  const checks: CheckResult[] = [];
  const add = (key: string, passed: boolean, reason: string) =>
    checks.push({ key, passed, reason: passed ? null : reason });

  // Type + legibility apply to every document.
  add('legible', fields.legible, 'הקובץ אינו קריא דיו כדי לאמת את תוכנו');
  add(
    'expected_type',
    fields.is_expected_type,
    `הקובץ אינו המסמך הנדרש (זוהה: ${fields.actual_kind || 'לא ידוע'})`,
  );

  if (ctx.checks.subjectMatch) {
    const normalizedDocId = fields.subject_id_number?.replace(/\D/g, '') ?? '';
    const normalizedCredId = ctx.credentialIdNumber?.replace(/\D/g, '') ?? '';
    const idMatches = normalizedDocId !== '' && normalizedCredId !== '' && normalizedDocId === normalizedCredId;
    if (idMatches) {
      add('subject', true, '');
    } else if (fields.subject_name) {
      add(
        'subject',
        namesLooselyMatch(fields.subject_name, ctx.clientName),
        `המסמך רשום על שם "${fields.subject_name}" ואינו תואם את שם הלקוח`,
      );
    } else {
      add('subject', false, 'שם בעל המסמך אינו מופיע במסמך ולא ניתן לוודא שהוא שייך ללקוח');
    }
  }

  // An id printed on the document must be a real id, and must not contradict
  // the one on file — regardless of whether subjectMatch applies to the type.
  if (fields.subject_id_number) {
    const normalizedDocId = fields.subject_id_number.replace(/\D/g, '');
    add('id_checksum', isValidIsraeliId(normalizedDocId), 'מספר תעודת הזהות המופיע במסמך אינו תקין');
    const normalizedCredId = ctx.credentialIdNumber?.replace(/\D/g, '') ?? '';
    if (normalizedCredId !== '') {
      add(
        'id_matches_client',
        normalizedDocId === normalizedCredId,
        'מספר תעודת הזהות במסמך אינו תואם את זה הרשום ללקוח',
      );
    }
  }

  if (ctx.checks.asOfDate) {
    const expected = `${ctx.taxYear}-12-31`;
    add(
      'as_of_date',
      fields.as_of_date === expected,
      `המסמך מתייחס לתאריך ${fields.as_of_date ?? 'שאינו מצוין בו'} במקום ליום 31.12.${ctx.taxYear} (המועד הקובע)`,
    );
  }

  if (ctx.checks.amounts) {
    const sane =
      fields.amounts.length > 0 &&
      fields.amounts.every((a) => Number.isFinite(a.value) && a.value >= 0 && a.value < MAX_SANE_AMOUNT);
    add('amounts', sane, 'לא זוהו במסמך סכומים כספיים תקינים');
  }

  const failed = checks.filter((c) => !c.passed);
  return {
    passed: failed.length === 0,
    reasons: failed.map((c) => c.reason!),
    checks,
  };
}
