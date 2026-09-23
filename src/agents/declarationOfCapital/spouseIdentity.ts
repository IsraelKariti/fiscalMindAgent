import { maskId } from '../shared/gateChecks.js';
import type { CheckResult } from './verifyChecks.js';

/**
 * The one spouse a declaration-of-capital client may have (openspec
 * `spouse-identity`): what the client record keeps about them, where a value
 * may come from, the trust order between sources, and the pure identity rule
 * document verification applies against client + spouse.
 *
 * Everything lives in `clients.agent_fields` (`spouse`, `marital_status`) —
 * no migration. The id is stored in full and masked (last three digits)
 * wherever it is shown: the trace, the workspace, the planner prompt (which
 * only ever learns whether an id is *known*).
 */

/** Where a spouse value came from, in descending trust. */
export type SpouseSource = 'questionnaire' | 'crm' | 'document';
export type MaritalStatus = 'married' | 'not_married';

export interface SpouseOnFile {
  name: string | null;
  /** The national id as stored — digits only when it came from a document, as typed when it came from a cell. */
  idNumber: string | null;
  nameSource: SpouseSource | null;
  idSource: SpouseSource | null;
}

export const EMPTY_SPOUSE: SpouseOnFile = { name: null, idNumber: null, nameSource: null, idSource: null };

const TRUST: Record<SpouseSource, number> = { questionnaire: 3, crm: 2, document: 1 };

function isSource(v: unknown): v is SpouseSource {
  return v === 'questionnaire' || v === 'crm' || v === 'document';
}

function nonEmpty(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** The spouse stored on the client; tolerant of a missing or garbled field (→ empty). */
export function readSpouse(agentFields: Record<string, unknown> | null | undefined): SpouseOnFile {
  const raw = agentFields?.['spouse'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_SPOUSE;
  const r = raw as Record<string, unknown>;
  const name = nonEmpty(r['name']);
  const idNumber = nonEmpty(r['id_number']);
  return {
    name,
    idNumber,
    nameSource: name && isSource(r['name_source']) ? r['name_source'] : null,
    idSource: idNumber && isSource(r['id_source']) ? r['id_source'] : null,
  };
}

/** The marital status stored on the client; null when unknown or garbled. */
export function readMaritalStatus(agentFields: Record<string, unknown> | null | undefined): MaritalStatus | null {
  const raw = agentFields?.['marital_status'];
  return raw === 'married' || raw === 'not_married' ? raw : null;
}

/** The JSON shape written to `agent_fields.spouse`. */
export function spouseToStored(s: SpouseOnFile): Record<string, unknown> {
  return { name: s.name, id_number: s.idNumber, name_source: s.nameSource, id_source: s.idSource };
}

/**
 * Merges a value found in `source` into the spouse on file: a present value
 * is replaced only by one from a source of strictly higher trust
 * (questionnaire > crm > document); an absent incoming value never clears
 * what is on file. Name and id are merged independently.
 */
export function mergeSpouse(
  current: SpouseOnFile,
  incoming: { name?: string | null; idNumber?: string | null },
  source: SpouseSource,
): SpouseOnFile {
  const next = { ...current };
  const name = nonEmpty(incoming.name);
  if (name && (!current.name || !current.nameSource || TRUST[source] > TRUST[current.nameSource])) {
    next.name = name;
    next.nameSource = source;
  }
  const id = nonEmpty(incoming.idNumber);
  if (id && (!current.idNumber || !current.idSource || TRUST[source] > TRUST[current.idSource])) {
    next.idNumber = id;
    next.idSource = source;
  }
  return next;
}

export function sameSpouse(a: SpouseOnFile, b: SpouseOnFile): boolean {
  return a.name === b.name && a.idNumber === b.idNumber && a.nameSource === b.nameSource && a.idSource === b.idSource;
}

// ---------------------------------------------------------------------------
// The identity rule of document verification.
// ---------------------------------------------------------------------------

/** Where the client's own id on file came from (taxFetch/clientId.ts) — shown next to the expected value. */
export type ClientIdSource = 'credentials' | 'monday_crm';

export interface IdentityContext {
  clientName: string;
  /** The client's national id on file, normalised (digits, 9 wide) — '' when none. */
  clientId: string;
  clientIdSource: ClientIdSource | null;
  spouse: SpouseOnFile;
  maritalStatus: MaritalStatus | null;
  /** The catalog type requires the document to name the client (or the spouse). */
  subjectMatch: boolean;
}

export interface IdentityFields {
  /** The printed subject name, as extracted. */
  subjectName: string | null;
  /** The printed id, normalised (digits, 9 wide) — '' when none printed. */
  printedId: string;
  /** The printed id passes the Israeli checksum (only meaningful when printedId !== ''). */
  printedIdValid: boolean;
}

export interface IdentityVerdict {
  /** Whom the document was accepted for; null when it matched nobody. */
  matched: 'client' | 'spouse' | null;
  /** Set when the printed id is adopted as the spouse's — the caller persists it before the next verification. */
  adopt: { idNumber: string; name: string | null } | null;
  /** The subject / id_matches_client / spouse_adopted / client_id_on_file entries, in order. */
  checks: CheckResult[];
}

const SOURCE_HE: Record<ClientIdSource | SpouseSource, string> = {
  credentials: 'credentials',
  monday_crm: 'monday CRM',
  questionnaire: 'questionnaire',
  crm: 'monday CRM',
  document: 'document',
};

/** `client ••••••448 (monday CRM)` / `spouse ••••••821 (document)` — one person as the trace names them. */
export function describePerson(who: 'client' | 'spouse', id: string, source: ClientIdSource | SpouseSource | null): string {
  return `${who} ${maskId(id)}${source ? ` (${SOURCE_HE[source]})` : ''}`;
}

/** Digits only, left-padded to the 9 digits of an Israeli id (same rule as verifyChecks.normalizeIdNumber). */
function normalizeId(raw: string | null | undefined): string {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits === '' || digits.length > 9) return digits;
  return digits.padStart(9, '0');
}

/** Lowercase, strip punctuation/quotes, split to tokens of 2+ chars. */
function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/["'`״׳.,()-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

/** Loose name comparison: true when the two names share at least one real token. */
export function namesLooselyMatch(a: string, b: string): boolean {
  const ta = nameTokens(a);
  const tb = new Set(nameTokens(b));
  return ta.some((t) => tb.has(t));
}

const SPOUSE_LABEL_HE = 'בן/בת זוג';

/**
 * Whom a verified document is about, decided against the client and the one
 * spouse on file (openspec `spouse-identity`, design D3):
 *
 *   printed id present, client id on file:
 *     1. equals the client            → client
 *     2. equals the spouse on file    → spouse
 *     3. checksum fails               → nobody (id_checksum fails elsewhere; no adoption)
 *     4. a spouse id is on file       → nobody: third person
 *     5. registered as not married    → nobody
 *     6. contradicts the spouse name  → nobody
 *     7. otherwise                    → spouse, ADOPTED from this document
 *   printed id present, no client id on file: only step 2; otherwise the
 *   informational client_id_on_file entry and no adoption (a stranger and the
 *   client are indistinguishable without the client's own id).
 *   no printed id: the name, loosely, against the client's and the spouse's.
 *
 * `subject` passes iff someone matched; a contradicting id (3–6) fails it
 * too — a name cannot vouch against an id.
 */
export function resolveSubjectIdentity(fields: IdentityFields, ctx: IdentityContext): IdentityVerdict {
  const checks: CheckResult[] = [];
  const add = (key: string, passed: boolean, reason: string, observed: string | null, expected: string | null = null) =>
    checks.push({ key, passed, reason: passed ? null : reason, observed, expected });

  const spouseId = normalizeId(ctx.spouse.idNumber);
  const spouseName = ctx.spouse.name;
  const printed = normalizeId(fields.printedId);

  /** Whom the printed id identified — drives the id entries. */
  let matched: 'client' | 'spouse' | null = null;
  /** Whom the printed name identified when no id could decide — drives `subject` only. */
  let subjectByName: 'client' | 'spouse' | null = null;
  let adopt: IdentityVerdict['adopt'] = null;
  let idNote: string | null = null;
  /** The person named in `expected` of a passed id_matches_client. */
  let matchedDescription: string | null = null;

  const onFileDescription = (): string =>
    [
      ctx.clientId !== '' ? describePerson('client', ctx.clientId, ctx.clientIdSource) : null,
      spouseId !== '' ? describePerson('spouse', spouseId, ctx.spouse.idSource) : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' / ');

  if (printed !== '') {
    if (ctx.clientId !== '' && printed === ctx.clientId) {
      matched = 'client';
      matchedDescription = describePerson('client', ctx.clientId, ctx.clientIdSource);
    } else if (spouseId !== '' && printed === spouseId) {
      matched = 'spouse';
      matchedDescription = describePerson('spouse', spouseId, ctx.spouse.idSource);
    } else if (ctx.clientId !== '') {
      if (!fields.printedIdValid) {
        idNote = 'מספר תעודת הזהות במסמך אינו של הלקוח ואינו של בן/בת הזוג הרשומים';
      } else if (spouseId !== '') {
        idNote = 'מספר תעודת הזהות במסמך אינו של הלקוח ואינו של בן/בת הזוג הרשומים — המסמך שייך לאדם אחר';
      } else if (ctx.maritalStatus === 'not_married') {
        idNote = 'מספר תעודת הזהות במסמך אינו של הלקוח, והלקוח רשום כלא נשוי';
      } else if (spouseName && (!fields.subjectName || !namesLooselyMatch(fields.subjectName, spouseName))) {
        idNote = `המסמך רשום על שם "${fields.subjectName ?? 'לא מצוין'}" ואינו תואם את שם בן/בת הזוג הרשומים ("${spouseName}")`;
      } else {
        matched = 'spouse';
        adopt = { idNumber: printed, name: spouseName ?? fields.subjectName };
        matchedDescription = describePerson('spouse', printed, 'document');
      }
    }
  }

  // --- subject -------------------------------------------------------------
  if (ctx.subjectMatch) {
    const acceptedFor = matched === 'client' ? ctx.clientName : matched === 'spouse' ? (spouseName ?? adopt?.name ?? SPOUSE_LABEL_HE) : null;
    if (matched !== null) {
      const observed =
        printed !== ''
          ? `ת"ז ${maskId(printed)} תואמת ${matched === 'client' ? 'ללקוח' : 'לבן/בת הזוג'}`
          : (fields.subjectName ?? 'לא מצוין');
      add('subject', true, '', observed, acceptedFor);
    } else if (printed !== '' && idNote !== null) {
      // A contradicting id: the name cannot vouch for the document.
      add(
        'subject',
        false,
        `המסמך רשום על שם "${fields.subjectName ?? 'לא מצוין'}" עם תעודת זהות שאינה של הלקוח ואינה של בן/בת הזוג`,
        fields.subjectName ?? 'לא מצוין',
        expectedNames(ctx.clientName, spouseName),
      );
    } else if (fields.subjectName) {
      const byName = namesLooselyMatch(fields.subjectName, ctx.clientName)
        ? 'client'
        : spouseName && namesLooselyMatch(fields.subjectName, spouseName)
          ? 'spouse'
          : null;
      // A name may vouch for the document only when no id was printed; a
      // printed id that could not be compared (no client id on file) keeps the
      // id entries on the client_id_on_file path.
      if (byName && printed === '') matched = byName;
      else if (byName) subjectByName = byName;
      add(
        'subject',
        byName !== null,
        `המסמך רשום על שם "${fields.subjectName}" ואינו תואם את שם הלקוח${spouseName ? ' או את שם בן/בת הזוג' : ''}`,
        fields.subjectName,
        byName === 'client' ? ctx.clientName : byName === 'spouse' ? spouseName : expectedNames(ctx.clientName, spouseName),
      );
    } else {
      add('subject', false, 'שם בעל המסמך אינו מופיע במסמך ולא ניתן לוודא שהוא שייך ללקוח', 'לא מצוין', expectedNames(ctx.clientName, spouseName));
    }
  } else if (matched === null && printed === '' && fields.subjectName && spouseName && namesLooselyMatch(fields.subjectName, spouseName)) {
    matched = 'spouse';
  }

  // --- id_matches_client / spouse_adopted / client_id_on_file ---------------
  if (printed !== '') {
    if (matched !== null) {
      add('id_matches_client', true, '', maskId(printed), matchedDescription);
      if (adopt) add('spouse_adopted', true, '', maskId(printed), adopt.name ?? 'name unknown');
    } else if (ctx.clientId !== '') {
      add('id_matches_client', false, idNote ?? 'מספר תעודת הזהות במסמך אינו תואם את זה הרשום ללקוח', maskId(printed), onFileDescription());
    } else {
      // Nothing to compare against: reported so the trace shows why, but it
      // never decides the verdict (verifyChecks filters it) — an accountant's
      // CRM card without an id must not stall every document.
      add(
        'client_id_on_file',
        false,
        'ללקוח אין מספר תעודת זהות רשום — לא בפרטי הכניסה לרשות המסים ולא בכרטיס ה-CRM ב-monday — ולכן לא ניתן היה להשוות את המספר שבמסמך',
        'none',
      );
    }
  }

  return { matched: matched ?? subjectByName, adopt, checks };
}

function expectedNames(clientName: string, spouseName: string | null): string {
  return spouseName ? `${clientName} / ${spouseName}` : clientName;
}
