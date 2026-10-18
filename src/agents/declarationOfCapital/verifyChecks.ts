import { maskId } from '../shared/gateChecks.js';
import { EMPTY_SPOUSE, resolveDocumentOwners, type IdentityVerdict, type MaritalStatus, type PartyInput, type PartyTraceEntry, type SpouseOnFile } from './spouseIdentity.js';
import type { FieldKind, TypeField } from './documentTypes/types.js';

// The loose name rule lives with the identity rule (spouseIdentity.ts); kept
// exported from here for its historical importers (tests, evals).
export { namesLooselyMatch } from './spouseIdentity.js';

/**
 * The deterministic half of the verification pipeline: pure code checks over
 * the fields the extractor pulled from the file. No LLM here — an LLM verdict
 * alone must never be able to approve a document; these checks against known
 * ground truth (the client record, the valuation date) are what decide.
 * Failure reasons are Hebrew — they go to the planner prompt (which relays
 * them to the client) and to the workspace UI.
 *
 * This module is the shared library: the common answer shape, the check
 * helpers and the verdict. Which checks a document gets, its answer schema
 * and its prompt live in the type's own module (documentTypes/<type>.ts).
 */

/**
 * The part a person named on the document plays (openspec
 * `document-extraction`): `owner` holds the asset or owes the liability the
 * document proves (buyer, account holder, member, insured, borrower, heir,
 * registered owner); `counterparty` is the other side (seller, lending bank,
 * builder, giver); `other` is anyone else (witness, lawyer, guarantor, agent).
 * Only owners take part in the identity checks.
 */
export type PartyRole = 'owner' | 'counterparty' | 'other';

/** One person (or business) the document names, with the id printed beside that one name. */
export interface DocumentParty {
  /** The name exactly as printed beside this person. */
  name: string;
  /** This person's national id (ת"ז), digits only, as printed beside their name; null when none is printed for them. */
  id_number: string | null;
  role: PartyRole;
}

/** The most parties an answer keeps; a longer list is cut. */
export const MAX_PARTIES = 10;

/**
 * The common fields every extraction answer carries (a type alias, not an
 * interface, so a value of this type also satisfies ExtractedAnswer below).
 */
export type ExtractedFields = {
  /** The file's contents actually are a document of the expected type. */
  is_expected_type: boolean;
  /** What the document actually is, from its contents. */
  actual_kind: string;
  /** The issuing institution (bank, insurer, registry), if stated. */
  issuer: string | null;
  /** The people the document names, one entry per person (openspec `document-extraction`). */
  parties: DocumentParty[];
  /** The date the balances/holdings refer to, "YYYY-MM-DD", if stated. */
  as_of_date: string | null;
  /** The document's own validity ("בתוקף עד") date, "YYYY-MM-DD", if it carries one. */
  valid_until: string | null;
  legible: boolean;
  injection_suspected: boolean;
};



/**
 * The answer for a type with extra fields: the common fields plus one flat
 * key per declared field (openspec `document-extraction`). Type-field values
 * are read through typeFieldValue(), which normalises them by kind.
 */
export type ExtractedAnswer = ExtractedFields & { [typeFieldKey: string]: unknown };

/** A normalised type-field value: text/date as string, number/year as number, absent as null. */
export type TypeFieldValue = string | number | null;

/**
 * The value the model returned for one declared field, normalised by kind.
 * Models put "" or "/" where the schema says null (the harness tolerates the
 * same for dates), so an empty text is null; 0 stays 0.
 */
export function typeFieldValue(answer: ExtractedAnswer, field: Pick<TypeField, 'key' | 'kind'>): TypeFieldValue {
  const raw = answer[field.key];
  if (raw === null || raw === undefined) return null;
  if (field.kind === 'number' || field.kind === 'year') {
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
    return typeof raw === 'string' ? Number.NaN : null;
  }
  if (typeof raw !== 'string') return raw === undefined ? null : String(raw);
  const text = raw.trim();
  if (text === '' || text === '/') return null;
  return text;
}

export interface CheckContext {
  clientName: string;
  /** National id from client_portal_credentials, when on file (accountant-imported — trusted). */
  credentialIdNumber: string | null;
  /** Where credentialIdNumber came from — shown next to the expected value of id_matches_client. */
  credentialIdSource?: 'credentials' | 'monday_crm' | null;
  /** The one spouse on file (openspec `spouse-identity`); absent = nothing known. */
  spouse?: SpouseOnFile;
  /** The client's marital status from the questionnaire; null/absent = unknown. */
  maritalStatus?: MaritalStatus | null;
  taxYear: number;
  /** Verification time (kept for the trace; no check judges against it since `vehicle-license-valid-at-valuation-date`). */
  now: Date;
  /** The required document's name (checklist row) — the expected_type check's reference, when known. */
  documentName?: string | null;
}

export interface CheckResult {
  key: string;
  /** true / false for a check that ran; null for a check of the type's list that did not apply (skipped). */
  passed: boolean | null;
  /** Hebrew failure reason, or the Hebrew skip reason for a skipped check; null when passed. */
  reason: string | null;
  /** The value the check inspected (also on a pass); ids masked to their last three digits. */
  observed: string | null;
  /** What `observed` was compared with, when the check has a reference. */
  expected: string | null;
}

export interface ChecksVerdict {
  passed: boolean;
  /** The failed checks' reasons, in order. */
  reasons: string[];
  /** The type's whole list in trace order, skipped entries included (`passed: null`). */
  checks: CheckResult[];
  /** Whom the document was accepted for (openspec `spouse-identity`); null when no owner matched. */
  subjectMatched: 'client' | 'spouse' | 'both' | null;
  /** An owner's printed id was adopted as the spouse's — the caller persists it before the next verification. */
  adoptSpouse: { idNumber: string; name: string | null } | null;
  /** Every party the extraction listed, with role, masked id and whom it was resolved as (for the trace row). */
  parties: PartyTraceEntry[];
}

/** Standard Israeli national-id check digit (9 digits, weights 1/2 alternating). */
export function isValidIsraeliId(id: string): boolean {
  const digits = normalizeIdNumber(id);
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

/**
 * Digits only, left-padded to the 9 digits of an Israeli id. Documents (and
 * CRM cards) often drop a leading zero; "12345543" and "012345543" are the
 * same person and must compare equal. Some banks (Hapoalim) print the id
 * zero-padded to a wider field ("0000000025699448"): surplus leading zeros
 * are dropped. More than 9 significant digits is returned as-is (not an id).
 */
export function normalizeIdNumber(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits === '') return digits;
  const significant = digits.replace(/^0+/, '');
  if (significant.length > 9) return digits;
  return significant.padStart(9, '0');
}

/** How many typed fields the audit row's observed value lists before "(+N)". */
const MAX_FIELDS_SHOWN = 6;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A production year below this is not a car on Israeli roads. */
const MIN_PLAUSIBLE_YEAR = 1950;

/** `יתרת עו"ש: 52,340.55` / `שנת ייצור: 2021` / `לא נמצא` — one type-field value as the trace shows it. */
function renderTypeFieldValue(value: TypeFieldValue, kind: FieldKind): string {
  if (value === null) return 'לא נמצא';
  if (typeof value === 'number') return Number.isFinite(value) && kind !== 'year' ? value.toLocaleString('en-US') : String(value);
  return value;
}

// ---------------------------------------------------------------------------
// The check helpers (openspec `document-extraction`, change
// `per-type-document-schemas`). Each document type's module lists which of
// these it runs, in order (documentTypes/<type>.ts · verify); nothing here
// decides from flags. Every helper returns the trace entry (or null when the
// check does not apply to this answer), and verdictOf() folds the list into
// the gate's verdict.

function entry(key: string, passed: boolean, reason: string, observed: string | null, expected: string | null = null): CheckResult {
  return { key, passed, reason: passed ? null : reason, observed, expected };
}

/**
 * A check of the type's list that did not apply to this document (openspec
 * `code-gates`, change `skipped-checks-in-trace`): listed at its position with
 * `passed: null` and the Hebrew reason it was skipped, so the trace shows the
 * whole list and never a silent gap. Never part of the verdict.
 */
function skipped(key: string, whyHe: string): CheckResult {
  return { key, passed: null, reason: whyHe, observed: null, expected: null };
}

/** The fixed skip reasons, one per conditional check (Hebrew, like the failure notes). */
export const SKIP_REASONS_HE = {
  noOwnerId: 'במסמך לא מודפס מספר תעודת זהות של בעלים',
  noClientIdOnFile: 'ללקוח אין מספר תעודת זהות רשום — דווח client_id_on_file במקום',
  clientIdOnFile: 'ללקוח רשום מספר תעודת זהות — דווח id_matches_client במקום',
  noSpouseAdopted: 'לא אומץ בן/בת זוג בבדיקה זו',
  noSubjectMatch: 'המסמך לא זוהה כשייך ללקוח או לבן/בת הזוג',
  noCoOwners: 'אין בעלים נוספים במסמך',
  periodNotRead: 'תאריכי התקופה לא נקראו במלואם',
} as const;

/** `legible` — the model's legibility verdict. Applies to every document. */
export function legibleCheck(answer: ExtractedAnswer): CheckResult {
  return entry('legible', answer.legible, 'הקובץ אינו קריא דיו כדי לאמת את תוכנו', answer.legible ? 'קריא' : 'לא קריא');
}

/** `expected_type` — what the model saw the document as, against the checklist row's name. Applies to every document. */
export function expectedTypeCheck(answer: ExtractedAnswer, ctx: CheckContext): CheckResult {
  return entry(
    'expected_type',
    answer.is_expected_type,
    `הקובץ אינו המסמך הנדרש (זוהה: ${answer.actual_kind || 'לא ידוע'})`,
    answer.actual_kind || 'לא ידוע',
    ctx.documentName ?? null,
  );
}

/**
 * Whom the document is about — judged over its owner parties against the
 * client and the one spouse on file (spouseIdentity.ts, openspec
 * `spouse-identity`): `subject` (when the type requires it), then
 * `id_checksum` (every owner's printed id must be a real id, whatever the
 * type), then the id entries. The other roles' ids are not ours to check.
 * Returns the ordered entries and the identity verdict verdictOf() needs.
 */
export function identityChecks(
  answer: ExtractedAnswer,
  ctx: CheckContext,
  opts: { subjectMatch: boolean },
): { checks: CheckResult[]; identity: IdentityVerdict } {
  const parties = partyInputs(answer.parties);
  const identity = resolveDocumentOwners(parties, {
    clientName: ctx.clientName,
    clientId: normalizeIdNumber(ctx.credentialIdNumber),
    clientIdSource: ctx.credentialIdSource ?? null,
    spouse: ctx.spouse ?? EMPTY_SPOUSE,
    maritalStatus: ctx.maritalStatus ?? null,
    subjectMatch: opts.subjectMatch,
  });
  const judged = new Map(identity.checks.map((c) => [c.key, c]));
  const ownerIds = parties.filter((p) => p.role === 'owner' && p.printedId !== '');
  if (ownerIds.length > 0) {
    const invalid = ownerIds.find((p) => !p.printedIdValid);
    judged.set(
      'id_checksum',
      entry(
        'id_checksum',
        invalid === undefined,
        `מספר תעודת הזהות ${invalid ? maskId(invalid.printedId) : ''} המופיע במסמך אינו תקין`,
        ownerIds.map((p) => maskId(p.printedId)).join(' · '),
      ),
    );
  }
  // The type's identity list, in trace order; an entry the rule did not judge
  // is listed as skipped with the reason its condition did not hold. `subject`
  // is not in the list of a type that does not require the client as owner.
  const skipReason: Record<string, string> = {
    id_checksum: SKIP_REASONS_HE.noOwnerId,
    id_matches_client: ownerIds.length === 0 ? SKIP_REASONS_HE.noOwnerId : SKIP_REASONS_HE.noClientIdOnFile,
    client_id_on_file: ownerIds.length === 0 ? SKIP_REASONS_HE.noOwnerId : SKIP_REASONS_HE.clientIdOnFile,
    spouse_adopted: SKIP_REASONS_HE.noSpouseAdopted,
    co_owners: identity.matched === null ? SKIP_REASONS_HE.noSubjectMatch : SKIP_REASONS_HE.noCoOwners,
  };
  const order = [...(opts.subjectMatch ? ['subject'] : []), 'id_checksum', 'id_matches_client', 'client_id_on_file', 'spouse_adopted', 'co_owners'];
  const checks = order.map((key) => judged.get(key) ?? skipped(key, skipReason[key]!));
  return { checks, identity };
}

/** `as_of_date` — the balances must refer to 31.12 of the tax year exactly. */
export function asOfDateCheck(answer: ExtractedAnswer, ctx: CheckContext): CheckResult {
  const expected = `${ctx.taxYear}-12-31`;
  return entry(
    'as_of_date',
    answer.as_of_date === expected,
    `המסמך מתייחס לתאריך ${answer.as_of_date ?? 'שאינו מצוין בו'} במקום ליום 31.12.${ctx.taxYear} (המועד הקובע)`,
    answer.as_of_date ?? 'לא מצוין',
    expected,
  );
}


/**
 * `type_fields` — every required field read and well formed, and at least
 * one of the "any of" group. Observed lists every field as `label: value`.
 */
export function typeFieldsCheck(
  answer: ExtractedAnswer,
  ctx: CheckContext,
  fields: readonly TypeField[],
  anyOf: readonly string[] = [],
): CheckResult {
  const read = fields.map((field) => ({ field, value: typeFieldValue(answer, field) }));
  const shown = read
    .slice(0, MAX_FIELDS_SHOWN)
    .map(({ field, value }) => `${field.labelHe}: ${renderTypeFieldValue(value, field.kind)}`)
    .join(' · ');
  const observed = read.length > MAX_FIELDS_SHOWN ? `${shown} (+${read.length - MAX_FIELDS_SHOWN})` : shown;
  let problem: string | null = null;
  for (const { field, value } of read) {
    if (value === null) {
      if (field.required) problem = `השדה "${field.labelHe}" לא נמצא במסמך`;
    } else if (field.kind === 'date') {
      if (typeof value !== 'string' || !DATE_RE.test(value)) problem = `השדה "${field.labelHe}" אינו תאריך בפורמט YYYY-MM-DD (${value})`;
    } else if (field.kind === 'year') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value < MIN_PLAUSIBLE_YEAR || value > ctx.taxYear + 1) {
        problem = `השדה "${field.labelHe}" אינו שנה סבירה (${value})`;
      }
    } else if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) problem = `השדה "${field.labelHe}" אינו מספר`;
      else if (field.min !== undefined && value < field.min) {
        problem =
          field.min === 0
            ? `השדה "${field.labelHe}" שלילי (${renderTypeFieldValue(value, field.kind)})`
            : `השדה "${field.labelHe}" קטן מ-${field.min.toLocaleString('en-US')} (${renderTypeFieldValue(value, field.kind)})`;
      }
    } else if (field.pattern && (typeof value !== 'string' || !field.pattern.test(value))) {
      problem = field.patternHintHe ?? `השדה "${field.labelHe}" אינו בפורמט הנדרש (${value})`;
    }
    if (problem) break;
  }
  if (problem === null && anyOf.length > 0 && read.every(({ field, value }) => !anyOf.includes(field.key) || value === null)) {
    const labels = anyOf.map((key) => fields.find((f) => f.key === key)?.labelHe ?? key);
    problem = `אף אחד מהשדות ${labels.map((l) => `"${l}"`).join(' / ')} לא נמצא במסמך`;
  }
  return entry('type_fields', problem === null, problem ?? '', observed);
}

/**
 * `period_covers_valuation_date` — the declared period (two date fields) must
 * contain 31.12 of the tax year. Judged only when both dates were read well
 * formed (skipped otherwise) — a missing required date already fails type_fields.
 */
export function periodCoversValuationDateCheck(
  answer: ExtractedAnswer,
  ctx: CheckContext,
  fields: readonly TypeField[],
  fromKey: string,
  toKey: string,
): CheckResult {
  const valueOf = (key: string) => {
    const field = fields.find((f) => f.key === key);
    return field ? typeFieldValue(answer, field) : null;
  };
  const from = valueOf(fromKey);
  const to = valueOf(toKey);
  if (typeof from !== 'string' || !DATE_RE.test(from) || typeof to !== 'string' || !DATE_RE.test(to)) {
    return skipped('period_covers_valuation_date', SKIP_REASONS_HE.periodNotRead);
  }
  const expected = `${ctx.taxYear}-12-31`;
  return entry(
    'period_covers_valuation_date',
    from <= expected && expected <= to,
    `תקופת הפוליסה ${from} – ${to} אינה כוללת את יום 31.12.${ctx.taxYear} (המועד הקובע)`,
    `${from} – ${to}`,
    expected,
  );
}

/**
 * The gate's verdict over a type's ordered check list. Skipped entries
 * (`passed: null`) stay in `checks` for the trace but take no part in the
 * verdict; client_id_on_file is informational: listed, never enforced.
 */
export function verdictOf(checks: readonly CheckResult[], identity: IdentityVerdict): ChecksVerdict {
  const failed = checks.filter((c) => c.passed === false && c.key !== 'client_id_on_file');
  return {
    passed: failed.length === 0,
    reasons: failed.map((c) => c.reason!),
    checks: [...checks],
    subjectMatched: identity.matched,
    adoptSpouse: identity.adopt,
    parties: identity.parties,
  };
}

/**
 * The extraction's parties as the identity rule reads them: the name trimmed
 * (blank → null), the id normalised and checksum-judged, the list cut to
 * MAX_PARTIES. A garbled entry (not an object) is dropped.
 */
export function partyInputs(parties: readonly DocumentParty[] | null | undefined): PartyInput[] {
  return (parties ?? [])
    .filter((p): p is DocumentParty => typeof p === 'object' && p !== null)
    .slice(0, MAX_PARTIES)
    .map((p) => {
      const printedId = normalizeIdNumber(p.id_number);
      const name = typeof p.name === 'string' && p.name.trim() !== '' ? p.name.trim() : null;
      const role: PartyRole = p.role === 'owner' || p.role === 'counterparty' || p.role === 'other' ? p.role : 'other';
      return { name, printedId, printedIdValid: printedId !== '' && isValidIsraeliId(printedId), role };
    });
}
