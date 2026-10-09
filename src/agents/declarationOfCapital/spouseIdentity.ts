import { maskId } from '../shared/gateChecks.js';
import type { CheckResult, PartyRole } from './verifyChecks.js';

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

/** One party of the document as the extraction listed it, normalised for the rule. */
export interface PartyInput {
  /** The printed name beside this person; null when blank. */
  name: string | null;
  /** This person's printed id, normalised (digits, 9 wide) — '' when none printed. */
  printedId: string;
  /** The printed id passes the Israeli checksum (only meaningful when printedId !== ''). */
  printedIdValid: boolean;
  role: PartyRole;
}

/** Whom one party is, by the per-person rule (chart B of the approval flow). */
export type PartyKind = 'client' | 'spouse' | 'adoptable' | 'nobody';

export interface ResolvedParty {
  party: PartyInput;
  kind: PartyKind;
  /**
   * The party's id could not be compared (no client id on file and not the
   * spouse's id): the name alone decided `kind`, and the id entries go on the
   * informational client_id_on_file path.
   */
  idUncompared: boolean;
  /** Why an id-bearing party is nobody (Hebrew); null for a name-only mismatch. */
  reason: string | null;
}

/** One party as the trace row records it (ids masked). */
export interface PartyTraceEntry {
  name: string | null;
  role: PartyRole;
  maskedId: string | null;
  /** Whom the party was resolved as; `none` for non-owners and for owners that matched nobody on a rejected document. */
  resolved: 'client' | 'spouse' | 'adopted' | 'co_owner' | 'uncompared' | 'none';
}

export interface IdentityVerdict {
  /** Whom the document was accepted for; null when no owner matched. */
  matched: 'client' | 'spouse' | 'both' | null;
  /** Set when an owner's printed id is adopted as the spouse's — the caller persists it before the next verification. */
  adopt: { idNumber: string; name: string | null } | null;
  /** The subject / id_matches_client / spouse_adopted / co_owners / client_id_on_file entries, in order. */
  checks: CheckResult[];
  /** Every party the extraction listed, as the trace shows it. */
  parties: PartyTraceEntry[];
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
  if (digits === '') return digits;
  const significant = digits.replace(/^0+/, '');
  if (significant.length > 9) return digits;
  return significant.padStart(9, '0');
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
const NOT_STATED_HE = 'לא מצוין';
/** How many parties a check value lists before "(+N)". */
const MAX_PARTIES_SHOWN = 6;

/**
 * Chart B for one person: whom this party is, against the client and the
 * one spouse on file (openspec `spouse-identity`):
 *
 *   printed id present, client id on file:
 *     1. equals the client            → client
 *     2. equals the spouse on file    → spouse
 *     3. checksum fails               → nobody (id_checksum fails elsewhere)
 *     4. a spouse id is on file       → nobody: third person
 *     5. registered as not married    → nobody
 *     6. contradicts the spouse name  → nobody
 *     7. otherwise                    → adoptable (chooseSpouseToAdopt decides)
 *   printed id present, no client id on file: only step 2; otherwise the id
 *   is uncompared and the name decides (a stranger and the client are
 *   indistinguishable without the client's own id); never adoptable.
 *   no printed id: the name, loosely, against the client's and the spouse's.
 */
export function resolveParty(party: PartyInput, ctx: IdentityContext): ResolvedParty {
  const spouseId = normalizeId(ctx.spouse.idNumber);
  const spouseName = ctx.spouse.name;
  const printed = normalizeId(party.printedId);
  const byName = (): PartyKind =>
    party.name && namesLooselyMatch(party.name, ctx.clientName)
      ? 'client'
      : party.name && spouseName && namesLooselyMatch(party.name, spouseName)
        ? 'spouse'
        : 'nobody';

  if (printed === '') return { party, kind: byName(), idUncompared: false, reason: null };
  if (ctx.clientId !== '' && printed === ctx.clientId) return { party, kind: 'client', idUncompared: false, reason: null };
  if (spouseId !== '' && printed === spouseId) return { party, kind: 'spouse', idUncompared: false, reason: null };
  if (ctx.clientId === '') return { party, kind: byName(), idUncompared: true, reason: null };

  const nobody = (reason: string): ResolvedParty => ({ party, kind: 'nobody', idUncompared: false, reason });
  if (!party.printedIdValid) return nobody('מספר תעודת הזהות במסמך אינו של הלקוח ואינו של בן/בת הזוג הרשומים');
  if (spouseId !== '') return nobody('מספר תעודת הזהות במסמך אינו של הלקוח ואינו של בן/בת הזוג הרשומים — המסמך שייך לאדם אחר');
  if (ctx.maritalStatus === 'not_married') return nobody('מספר תעודת הזהות במסמך אינו של הלקוח, והלקוח רשום כלא נשוי');
  if (spouseName && (!party.name || !namesLooselyMatch(party.name, spouseName))) {
    return nobody(`המסמך רשום על שם "${party.name ?? NOT_STATED_HE}" ואינו תואם את שם בן/בת הזוג הרשומים ("${spouseName}")`);
  }
  return { party, kind: 'adoptable', idUncompared: false, reason: null };
}

/**
 * Which adoptable owner, if any, becomes the spouse (openspec
 * `spouse-identity`): exactly one candidate, and either the document has one
 * owner (today's rule) or a spouse name is on file that the candidate's own
 * printed name matches — the only way to tell the spouse from a sibling, a
 * parent or a partner on a joint document. The stored name is the name on
 * file when there is one, else that one party's printed name.
 */
export function chooseSpouseToAdopt(owners: readonly ResolvedParty[], ctx: IdentityContext): { idNumber: string; name: string | null } | null {
  const candidates = owners.filter((o) => o.kind === 'adoptable');
  if (candidates.length !== 1) return null;
  const candidate = candidates[0]!;
  const spouseName = ctx.spouse.name;
  const allowed = owners.length === 1 || (!!spouseName && !!candidate.party.name && namesLooselyMatch(candidate.party.name, spouseName));
  if (!allowed) return null;
  return { idNumber: normalizeId(candidate.party.printedId), name: spouseName ?? candidate.party.name };
}

/** `תמיר מיכל (••••••973)` — one party as a check value shows it. */
function renderParty(p: PartyInput): string {
  const name = p.name ?? NOT_STATED_HE;
  return p.printedId !== '' ? `${name} (${maskId(normalizeId(p.printedId))})` : name;
}

function renderParties(parties: readonly PartyInput[]): string {
  const shown = parties.slice(0, MAX_PARTIES_SHOWN).map(renderParty).join(' · ');
  return parties.length > MAX_PARTIES_SHOWN ? `${shown} (+${parties.length - MAX_PARTIES_SHOWN})` : shown;
}

/**
 * Whom a verified document is about (openspec `spouse-identity`, design D2):
 * the owner parties are resolved one by one with resolveParty, then the
 * document belongs to the household when at least one owner is the client or
 * the spouse (by id or by name) or is adopted as the spouse now. Other owners
 * are co-owners: listed, never a reason to reject. Counterparties and others
 * take no part.
 */
export function resolveDocumentOwners(parties: readonly PartyInput[], ctx: IdentityContext): IdentityVerdict {
  const checks: CheckResult[] = [];
  const add = (key: string, passed: boolean, reason: string, observed: string | null, expected: string | null = null) =>
    checks.push({ key, passed, reason: passed ? null : reason, observed, expected });

  const spouseId = normalizeId(ctx.spouse.idNumber);
  const spouseName = ctx.spouse.name;
  const owners = parties.filter((p) => p.role === 'owner').map((p) => resolveParty(p, ctx));
  const adopt = chooseSpouseToAdopt(owners, ctx);
  const adoptedOwner = adopt ? owners.find((o) => o.kind === 'adoptable' && normalizeId(o.party.printedId) === adopt.idNumber) ?? null : null;

  const clientHit = owners.some((o) => o.kind === 'client');
  const spouseHit = owners.some((o) => o.kind === 'spouse') || adopt !== null;
  const matched: IdentityVerdict['matched'] = clientHit && spouseHit ? 'both' : clientHit ? 'client' : spouseHit ? 'spouse' : null;
  const coOwners = matched !== null ? owners.filter((o) => o.kind === 'nobody' || (o.kind === 'adoptable' && o !== adoptedOwner)) : [];

  const ownerInputs = owners.map((o) => o.party);
  const withId = owners.filter((o) => o.party.printedId !== '');
  const onFileDescription = (): string =>
    [
      ctx.clientId !== '' ? describePerson('client', ctx.clientId, ctx.clientIdSource) : null,
      spouseId !== '' ? describePerson('spouse', spouseId, ctx.spouse.idSource) : null,
    ]
      .filter((s): s is string => s !== null)
      .join(' / ');
  const spouseAcceptedName = spouseName ?? adopt?.name ?? SPOUSE_LABEL_HE;
  const acceptedFor =
    matched === 'both' ? `${ctx.clientName} / ${spouseAcceptedName}` : matched === 'client' ? ctx.clientName : matched === 'spouse' ? spouseAcceptedName : null;
  const expectedOnFile = spouseName ? `${ctx.clientName} / ${spouseName}` : ctx.clientName;

  // --- subject -------------------------------------------------------------
  if (ctx.subjectMatch) {
    if (owners.length === 0) {
      add('subject', false, 'שם בעל המסמך אינו מופיע במסמך ולא ניתן לוודא שהוא שייך ללקוח', NOT_STATED_HE, expectedOnFile);
    } else if (matched !== null) {
      add('subject', true, '', renderParties(ownerInputs), acceptedFor);
    } else {
      const contradicted = owners.find((o) => o.reason !== null);
      const named = owners.map((o) => o.party.name ?? NOT_STATED_HE).join(', ');
      add(
        'subject',
        false,
        contradicted
          ? `המסמך רשום על שם "${named}" עם תעודת זהות שאינה של הלקוח ואינה של בן/בת הזוג`
          : `המסמך רשום על שם "${named}" ואינו תואם את שם הלקוח${spouseName ? ' או את שם בן/בת הזוג' : ''}`,
        renderParties(ownerInputs),
        expectedOnFile,
      );
    }
  }

  // --- id_matches_client / spouse_adopted / co_owners / client_id_on_file ---
  if (withId.length > 0) {
    const observedIds = withId.map((o) => maskId(normalizeId(o.party.printedId))).join(' · ');
    const comparable = withId.some((o) => !o.idUncompared);
    if (matched !== null && comparable) {
      const matchedBy: string[] = [];
      if (clientHit) matchedBy.push(describePerson('client', ctx.clientId, ctx.clientIdSource));
      if (adopt) matchedBy.push(describePerson('spouse', adopt.idNumber, 'document'));
      else if (spouseHit) matchedBy.push(describePerson('spouse', spouseId, ctx.spouse.idSource));
      add('id_matches_client', true, '', observedIds, matchedBy.join(' / '));
      if (adopt) add('spouse_adopted', true, '', maskId(adopt.idNumber), adopt.name ?? 'name unknown');
    } else if (ctx.clientId !== '') {
      const reason =
        withId.find((o) => o.reason !== null)?.reason ??
        (owners.length > 1 && withId.some((o) => o.kind === 'adoptable')
          ? 'המסמך רשום על שם כמה בעלים, ואין שם בן/בת זוג רשום שלפיו ניתן לזהות מי מהם בן/בת הזוג'
          : 'מספר תעודת הזהות במסמך אינו תואם את זה הרשום ללקוח');
      add('id_matches_client', false, reason, observedIds, onFileDescription());
    } else {
      // Nothing to compare against: reported so the trace shows why, but it
      // never decides the verdict (verifyChecks filters it) — an accountant's
      // CRM card without an id must not stall every document.
      add(
        'client_id_on_file',
        false,
        'ללקוח אין מספר תעודת זהות רשום — לא בפרטי הכניסה לרשות המסים ולא בכרטיס ה-CRM ב-monday — ולכן לא ניתן היה להשוות את המספרים שבמסמך',
        'none',
      );
    }
  }
  if (coOwners.length > 0) add('co_owners', true, '', renderParties(coOwners.map((o) => o.party)));

  // --- the parties as the trace shows them ---------------------------------
  const resolvedOf = (p: PartyInput): PartyTraceEntry['resolved'] => {
    const owner = owners.find((o) => o.party === p);
    if (!owner) return 'none';
    if (owner === adoptedOwner) return 'adopted';
    if (owner.kind === 'client' || owner.kind === 'spouse') return owner.kind;
    if (coOwners.includes(owner)) return 'co_owner';
    return owner.idUncompared ? 'uncompared' : 'none';
  };
  const traceParties: PartyTraceEntry[] = parties.map((p) => ({
    name: p.name,
    role: p.role,
    maskedId: p.printedId !== '' ? maskId(normalizeId(p.printedId)) : null,
    resolved: resolvedOf(p),
  }));

  return { matched, adopt, checks, parties: traceParties };
}
