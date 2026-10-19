import { isEmployerBound, isInstitutionBound } from './catalog.js';
import { identifyInstitution, type Institution } from './institutions.js';
import { isSplitParent, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import { sharedNameTokens, type SpouseOnFile } from './spouseIdentity.js';
import { cleanEmployer, companySuffixedName, employerSuffixedName } from './splitChildNames.js';
import type { DocumentFileRow } from '../../db/types.js';

/**
 * A received file that proves its own list item (openspec `unlisted-files`,
 * change `self-evident-file-adds-item`): a report of a bank, fund or insurer
 * the institutions table knows, read with high confidence, listing accounts
 * whose every printed holder is the client or the spouse on file. The planner
 * may cite such a file (`proven_by_file_id`) instead of a client quote when
 * it settles the row of that type as needed or adds an item under it — the
 * document answers "is this yours and does it belong in the declaration?"
 * by itself. Everything here is decided by code from stored data; the model
 * never judges identity.
 */
export interface SelfEvidentFile {
  /** The file's analysed catalog type — the only row type it may settle or add to. */
  typeKey: string;
  /** The institutions-table key of the issuing company. */
  institutionKey: string;
  /** The issuer as printed on the file (the classifier's text) — audit only, never a name. */
  issuer: string;
  /** The holder names as printed, every one matched to the client or the spouse. */
  holders: string[];
  /** Whom the holders matched: the client when any holder is the client, else the spouse. */
  matched: 'client' | 'spouse';
  /** The cleaned employer printed on a fund report; null when none (or the type is not employer-bound). */
  employer: string | null;
}

/** The evidence stored on a row created from a self-evident file (also in `ResolutionEvidence`, db/types.ts). */
export interface SelfEvidentFileEvidence {
  source: 'self_evident_file';
  file_id: string;
  issuer: string;
  holders: string[];
  matched: 'client' | 'spouse';
  employer?: string;
}

/** The people a holder name may match: the client, and the one spouse on file (openspec `spouse-identity`). */
export interface PeopleOnFile {
  clientName: string;
  spouse: SpouseOnFile;
}

/** A holder is the client (or the spouse) when the names share this many tokens — first and last name, not a surname alone. */
const MIN_SHARED_NAME_TOKENS = 2;

/**
 * Whether one stored file proves its own item, and what it proves. Null
 * unless every condition holds: an institution-bound type, a complete and
 * readable analysis that is not quarantined, not a split original, attached
 * to no item, matched to no document, confidence high, the issuer recognised
 * as exactly one known company, at least one account listed (and the list
 * not partial), and every holder printed and sharing first and last name
 * with the client or the spouse on file. A file with one client holder and
 * one stranger is not self-evident; one with the client and the spouse is
 * (matched: client).
 */
export function selfEvidentFileOf(file: DocumentFileRow, people: PeopleOnFile, institutions?: readonly Institution[]): SelfEvidentFile | null {
  const a = file.analysis;
  if (!a || !isVerifiedLegibleFile(file) || isSplitParent(file)) return null;
  if (file.client_document_id !== null || a.matched_document_id !== null) return null;
  if (a.confidence !== 'high') return null;
  const typeKey = a.document_type ?? null;
  if (!isInstitutionBound(typeKey) || typeKey === null) return null;
  const institutionKey = identifyInstitution(a.issuer_name, institutions);
  if (institutionKey === null) return null;
  const holdings = a.holdings ?? [];
  if (holdings.length === 0 || a.holdings_partial === true) return null;
  const spouseName = people.spouse.name;
  let matchedClient = false;
  let matchedSpouse = false;
  const holders: string[] = [];
  for (const h of holdings) {
    const name = h.holder_name?.trim() ?? '';
    if (name === '') return null;
    // Closer than the loose identity rule: first AND last name (two shared
    // tokens), so a relative of the same surname is not "the client". The
    // closer of the client and the spouse wins; the client on a tie.
    const withClient = sharedNameTokens(name, people.clientName);
    const withSpouse = spouseName === null ? 0 : sharedNameTokens(name, spouseName);
    if (withClient < MIN_SHARED_NAME_TOKENS && withSpouse < MIN_SHARED_NAME_TOKENS) return null;
    if (withSpouse > withClient) matchedSpouse = true;
    else matchedClient = true;
    holders.push(name);
  }
  if (!matchedClient && !matchedSpouse) return null;
  return {
    typeKey,
    institutionKey,
    issuer: a.issuer_name ?? '',
    holders,
    matched: matchedClient ? 'client' : 'spouse',
    employer: isEmployerBound(typeKey) ? cleanEmployer(a.employer_name) : null,
  };
}

/** The pool `proven_by_file_id` may cite for a row of the file's type: every self-evident file of the client, by file id. */
export function selfEvidentFilesOf(
  files: readonly DocumentFileRow[],
  people: PeopleOnFile,
  institutions?: readonly Institution[],
): Map<string, SelfEvidentFile> {
  const out = new Map<string, SelfEvidentFile>();
  for (const file of files) {
    const proof = selfEvidentFileOf(file, people, institutions);
    if (proof) out.set(file.id, proof);
  }
  return out;
}

/** The evidence a row created from a self-evident file carries. */
export function selfEvidentEvidenceOf(fileId: string, proof: SelfEvidentFile): SelfEvidentFileEvidence {
  return {
    source: 'self_evident_file',
    file_id: fileId,
    issuer: proof.issuer,
    holders: proof.holders,
    matched: proof.matched,
    ...(proof.employer ? { employer: proof.employer } : {}),
  };
}

/**
 * The name of the item a self-evident file creates: the planner's name with
 * the table's Hebrew company name appended when the name does not already
 * carry a known company, and the cleaned employer appended for an
 * employer-bound type — the pattern the per-company split uses, so a later
 * file of another company never matches this item. The issuer as the model
 * wrote it is only looked up, never used as text.
 */
export function selfEvidentItemName(name: string, proof: SelfEvidentFile, institutions?: readonly Institution[]): string {
  const withCompany = companySuffixedName(name, proof.issuer, proof.typeKey, institutions);
  return employerSuffixedName(withCompany, proof.employer, proof.typeKey);
}

/** The marker the planner's file line carries for a self-evident file (code's own text, never file text). */
export function selfEvidentMarker(proof: SelfEvidentFile): string {
  const who = proof.matched === 'client' ? "in the client's name" : "in the spouse's name";
  return `self-evident: ${who} — may be added without asking (cite this file id in proven_by_file_id)`;
}
