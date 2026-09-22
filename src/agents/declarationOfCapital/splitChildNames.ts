/**
 * Pure rules for the display name of a child file cut out of a multi-document
 * PDF (openspec `file-splitting`): a child that matches a document on the
 * client's list is shown under that document's name; a child that matches
 * nothing is shown under its document type and the company on it. The words
 * come from our own lists only (the client's documents, the catalog, the
 * institutions table) — never from the model's free text or from the file.
 * No imports of llm/db/audit, so the tests run without a database.
 */

import { getCatalogType, isInstitutionBound } from './catalog.js';
import { identifyInstitution, institutionLabelHe } from './institutions.js';
import type { Institution } from './institutionsTable.js';

/** Longest display name stored on a file row. */
export const MAX_CHILD_DISPLAY_NAME = 150;

/** Bidi overrides, zero-width chars, BOM and control chars: never part of a name. */
const UNPRINTABLE = new RegExp('[\\u0000-\\u001F\\u007F\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');

/** Characters no file system accepts in a file name. */
const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|]/g;

function clean(text: string): string {
  return text.replace(UNPRINTABLE, ' ').replace(/\s+/g, ' ').trim();
}

/** The label of a child matched to the list document `documentName`; null when nothing usable is left. */
export function childDisplayName(documentName: string | null | undefined): string | null {
  const name = clean(documentName ?? '');
  if (name === '') return null;
  return name.length > MAX_CHILD_DISPLAY_NAME ? `${name.slice(0, MAX_CHILD_DISPLAY_NAME - 1).trimEnd()}…` : name;
}

/**
 * The name an item of an institution-bound type gets once a file of a known
 * company is tied to it while the item itself names no company the table
 * knows ("ביטוח מנהלים ניב" + a Harel file → "ביטוח מנהלים ניב — הראל"). The
 * same string names the tied child and the item it ends under (openspec
 * `unlisted-files`, per-company split). Any other case returns the item's
 * name unchanged: an item that already names a company, an item of another
 * type, a file whose company is not recognised. The company word is the
 * table's Hebrew name — never the issuer as the model wrote it.
 */
export function companySuffixedName(
  itemName: string,
  issuerName: string | null | undefined,
  typeKey: string | null | undefined,
  institutions?: readonly Institution[],
): string {
  if (!isInstitutionBound(typeKey)) return itemName;
  if (identifyInstitution(itemName, institutions) !== null) return itemName;
  const companyKey = identifyInstitution(issuerName, institutions);
  if (companyKey === null) return itemName;
  return `${itemName} — ${institutionLabelHe(companyKey, institutions)}`;
}

/** What the classifier gate left of a child's verdict; all a name may be built from. */
export interface ChildLabelInput {
  /** Name of the list document the child matched; null/undefined when no match survived the gate. */
  matchedDocumentName?: string | null;
  /** The matched list document's catalog type; the company suffix applies to institution-bound types only. */
  matchedDocumentTypeKey?: string | null;
  /** The closed type value of the analysis: a catalog key or 'other'. */
  documentType?: string | null;
  /** The company as the model wrote it. Only looked up in the institutions table, never shown. */
  issuerName?: string | null;
  quarantined: boolean;
}

/**
 * The label of a child file: the matched list document's name (plus the
 * file's company when that document names none — `companySuffixedName`);
 * with no match, the catalog's short type name plus the table's name of the
 * company on the file when it names exactly one known company. Null for a
 * quarantined child and for the catch-all 'other' type — those keep the
 * page-range file name.
 */
export function childLabel(input: ChildLabelInput, institutions?: readonly Institution[]): string | null {
  if (input.quarantined) return null;
  const matchedName = clean(input.matchedDocumentName ?? '');
  if (matchedName !== '') {
    return childDisplayName(companySuffixedName(matchedName, input.issuerName, input.matchedDocumentTypeKey, institutions));
  }
  const type = input.documentType ? getCatalogType(input.documentType) : undefined;
  if (!type) return null;
  const companyKey = identifyInstitution(input.issuerName, institutions);
  const company = companyKey === null ? null : institutionLabelHe(companyKey, institutions);
  return childDisplayName(company === null ? type.shortNameHe : `${type.shortNameHe} — ${company}`);
}

/** The file name a named child downloads under: `<label> (<original base> p<from>-<to>).pdf`. */
export function childDownloadName(label: string, parentFilename: string, pageFrom: number, pageTo: number): string {
  const base = clean(parentFilename).replace(/\.pdf$/i, '');
  const source = base === '' ? `p${pageFrom}-${pageTo}` : `${base} p${pageFrom}-${pageTo}`;
  return `${clean(label)} (${source}).pdf`.replace(ILLEGAL_IN_FILENAME, '-');
}
