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
  /** The document's main monetary values. */
  amounts: { label: string; value: number; currency: string }[];
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
  /** Verification time — the not_expired check is judged against this. */
  now: Date;
  /** The required document's name (checklist row) — the expected_type check's reference, when known. */
  documentName?: string | null;
}

export interface CheckResult {
  key: string;
  passed: boolean;
  /** Hebrew failure reason; null when passed. */
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

const MAX_SANE_AMOUNT = 1e12;
/** How many amounts the audit row's observed value lists before "(+N)". */
const MAX_AMOUNTS_SHOWN = 6;

/** `יתרת עו"ש 52,340.55 ILS` — one amount as the trace shows it. */
function renderAmount(a: { label: string; value: number; currency: string }): string {
  const value = Number.isFinite(a.value) ? a.value.toLocaleString('en-US') : String(a.value);
  return [a.label.trim(), value, a.currency.trim()].filter(Boolean).join(' ');
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** A production year below this is not a car on Israeli roads. */
const MIN_PLAUSIBLE_YEAR = 1950;

/** `יתרת עו"ש: 52,340.55` / `שנת ייצור: 2021` / `לא נמצא` — one type-field value as the trace shows it. */
function renderTypeFieldValue(value: TypeFieldValue, kind: FieldKind): string {
  if (value === null) return 'לא נמצא';
  if (typeof value === 'number') return Number.isFinite(value) && kind !== 'year' ? value.toLocaleString('en-US') : String(value);
  return value;
}

/** Local-time "YYYY-MM-DD" — comparable lexicographically with extracted dates. */
function localDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const checks: CheckResult[] = identity.checks.filter((c) => c.key === 'subject');
  const ownerIds = parties.filter((p) => p.role === 'owner' && p.printedId !== '');
  if (ownerIds.length > 0) {
    const invalid = ownerIds.find((p) => !p.printedIdValid);
    checks.push(
      entry(
        'id_checksum',
        invalid === undefined,
        `מספר תעודת הזהות ${invalid ? maskId(invalid.printedId) : ''} המופיע במסמך אינו תקין`,
        ownerIds.map((p) => maskId(p.printedId)).join(' · '),
      ),
    );
  }
  checks.push(...identity.checks.filter((c) => c.key !== 'subject'));
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
 * `not_expired` — a validity-dated document (vehicle license) must not be
 * expired at verification time. Judged only when a well-formed valid-until
 * date was actually extracted (null otherwise): sibling instances of the same
 * type without one (a purchase receipt, a cost declaration) are unaffected,
 * and a license whose validity field is unreadable is left to the
 * expected-type judgment (the catalog description says an expired license is
 * unacceptable).
 */
export function notExpiredCheck(answer: ExtractedAnswer, ctx: CheckContext): CheckResult | null {
  const validUntil = answer.valid_until && DATE_RE.test(answer.valid_until) ? answer.valid_until : null;
  if (!validUntil) return null;
  const today = localDateString(ctx.now);
  return entry(
    'not_expired',
    validUntil >= today,
    `המסמך בתוקף עד ${validUntil} — תוקפו פג; יש לשלוח עותק עדכני בתוקף`,
    validUntil,
    today,
  );
}

/** `amounts` — at least one sane monetary amount; the note names the exact failing amount and condition. */
export function amountsCheck(answer: ExtractedAnswer): CheckResult {
  const shown = answer.amounts.slice(0, MAX_AMOUNTS_SHOWN).map(renderAmount).join(' · ');
  const observed =
    answer.amounts.length === 0
      ? 'לא נמצאו סכומים'
      : answer.amounts.length > MAX_AMOUNTS_SHOWN
        ? `${shown} (+${answer.amounts.length - MAX_AMOUNTS_SHOWN})`
        : shown;
  let problem: string | null = null;
  if (answer.amounts.length === 0) {
    problem = 'לא זוהו במסמך סכומים כספיים';
  } else {
    const notNumber = answer.amounts.find((a) => !Number.isFinite(a.value));
    const negative = answer.amounts.find((a) => Number.isFinite(a.value) && a.value < 0);
    const tooLarge = answer.amounts.find((a) => Number.isFinite(a.value) && a.value >= MAX_SANE_AMOUNT);
    if (notNumber) problem = `הסכום "${notNumber.label}" אינו מספר`;
    else if (negative) problem = `הסכום "${negative.label}" (${renderAmount(negative)}) שלילי`;
    else if (tooLarge) problem = `הסכום "${tooLarge.label}" (${renderAmount(tooLarge)}) גדול מהתקרה הסבירה (${MAX_SANE_AMOUNT.toLocaleString('en-US')})`;
  }
  return entry('amounts', problem === null, problem ?? '', observed);
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
    .slice(0, MAX_AMOUNTS_SHOWN)
    .map(({ field, value }) => `${field.labelHe}: ${renderTypeFieldValue(value, field.kind)}`)
    .join(' · ');
  const observed = read.length > MAX_AMOUNTS_SHOWN ? `${shown} (+${read.length - MAX_AMOUNTS_SHOWN})` : shown;
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
 * formed (null otherwise) — a missing required date already fails type_fields.
 */
export function periodCoversValuationDateCheck(
  answer: ExtractedAnswer,
  ctx: CheckContext,
  fields: readonly TypeField[],
  fromKey: string,
  toKey: string,
): CheckResult | null {
  const valueOf = (key: string) => {
    const field = fields.find((f) => f.key === key);
    return field ? typeFieldValue(answer, field) : null;
  };
  const from = valueOf(fromKey);
  const to = valueOf(toKey);
  if (typeof from !== 'string' || !DATE_RE.test(from) || typeof to !== 'string' || !DATE_RE.test(to)) return null;
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
 * The gate's verdict over a type's ordered check list (nulls are checks that
 * did not apply). client_id_on_file is informational: listed, never enforced.
 */
export function verdictOf(checks: readonly (CheckResult | null)[], identity: IdentityVerdict): ChecksVerdict {
  const ran = checks.filter((c): c is CheckResult => c !== null);
  const failed = ran.filter((c) => !c.passed && c.key !== 'client_id_on_file');
  return {
    passed: failed.length === 0,
    reasons: failed.map((c) => c.reason!),
    checks: ran,
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
