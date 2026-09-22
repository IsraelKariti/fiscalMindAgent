import { INSTITUTIONS, type Institution } from './institutionsTable.js';

/**
 * Pure rules for recognising the company behind a document (openspec
 * `unlisted-files`): the issuer printed on a received file and the company a
 * list item names are both mapped to one key of the institutions table, so
 * code — not a model — decides whether a file may be tied to an item of an
 * institution-bound type. Hebrew and English forms of one company share a key.
 * No imports of llm/db/audit, so the tests run without a database.
 */

export type { Institution };

/** Niqqud / cantillation marks. */
const HEBREW_POINTS = new RegExp('[\\u0591-\\u05C7]', 'g');
/** Bidi overrides, zero-width chars, BOM. */
const INVISIBLE = new RegExp('[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]', 'g');
/** Everything that is not a Hebrew letter, a Latin letter or a digit separates words. */
const NOT_WORD = new RegExp('[^\\u05D0-\\u05EAa-z0-9]+', 'g');

/** Lower-case, unpointed, words separated by single spaces, padded with one space on each side. */
export function normalizeCompanyText(text: string): string {
  const words = text.toLowerCase().replace(INVISIBLE, '').replace(HEBREW_POINTS, '').replace(NOT_WORD, ' ').trim();
  return ` ${words} `;
}

interface AliasPattern {
  key: string;
  /** Matches the alias as a whole-word run; a Hebrew alias also after one or two prefix letters ("בהראל", "מבנק לאומי"). */
  pattern: RegExp;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildPatterns(table: readonly Institution[]): AliasPattern[] {
  const patterns: AliasPattern[] = [];
  for (const entry of table) {
    for (const alias of entry.aliases) {
      const normalized = normalizeCompanyText(alias).trim();
      if (normalized === '') continue;
      const hebrew = /^[א-ת]/.test(normalized);
      const prefix = hebrew ? '[בלמהושכ]{0,2}' : '';
      patterns.push({ key: entry.key, pattern: new RegExp(` ${prefix}${escapeRegex(normalized)}(?= )`, 'g') });
    }
  }
  return patterns;
}

const DEFAULT_PATTERNS = buildPatterns(INSTITUTIONS);

/**
 * The single company a text names, or null when it names none, or names two
 * different ones (ambiguous). An alias inside a longer matched alias does not
 * count ("לאומי" inside "הבנק הבינלאומי" is never a match: whole words only;
 * "מזרחי" inside "מזרחי טפחות" is the same key anyway).
 */
export function identifyInstitution(text: string | null | undefined, table?: readonly Institution[]): string | null {
  if (!text) return null;
  const haystack = normalizeCompanyText(text);
  const patterns = table ? buildPatterns(table) : DEFAULT_PATTERNS;
  const hits: { key: string; from: number; to: number }[] = [];
  for (const { key, pattern } of patterns) {
    pattern.lastIndex = 0;
    for (let m = pattern.exec(haystack); m !== null; m = pattern.exec(haystack)) {
      hits.push({ key, from: m.index, to: m.index + m[0].length });
      if (m[0].length === 0) pattern.lastIndex += 1;
    }
  }
  // A hit that lies inside a longer hit is part of that longer name.
  const outer = hits.filter((h) => !hits.some((o) => o !== h && o.from <= h.from && o.to >= h.to && o.to - o.from > h.to - h.from));
  const keys = new Set(outer.map((h) => h.key));
  return keys.size === 1 ? [...keys][0]! : null;
}

/** The table's display name of a key (English), or the key itself. */
export function institutionLabel(key: string, table: readonly Institution[] = INSTITUTIONS): string {
  return table.find((e) => e.key === key)?.name ?? key;
}

/** The table's Hebrew brand name of a key, for names shown to the accountant; the English name when it has none. */
export function institutionLabelHe(key: string, table: readonly Institution[] = INSTITUTIONS): string {
  const entry = table.find((e) => e.key === key);
  return entry?.nameHe ?? entry?.name ?? key;
}

export type CompanyComparison =
  | { verdict: 'same'; fileKey: string; itemKey: string }
  | { verdict: 'different'; fileKey: string; itemKey: string }
  | { verdict: 'file_unidentified'; fileKey: null; itemKey: string | null }
  | { verdict: 'item_unidentified'; fileKey: string; itemKey: null };

/** Compares the company printed on a file with the company a list item names. */
export function compareCompanies(issuerName: string | null | undefined, itemName: string, table?: readonly Institution[]): CompanyComparison {
  const fileKey = identifyInstitution(issuerName, table);
  const itemKey = identifyInstitution(itemName, table);
  if (fileKey === null) return { verdict: 'file_unidentified', fileKey, itemKey };
  if (itemKey === null) return { verdict: 'item_unidentified', fileKey, itemKey };
  return fileKey === itemKey ? { verdict: 'same', fileKey, itemKey } : { verdict: 'different', fileKey, itemKey };
}

/**
 * May a file be tied to this item of an institution-bound type (the file
 * check's gate and the planner's pairs share this rule)? Same company: yes.
 * Two identified, different companies: never. An item that names no company
 * the table knows (named after a person or a product, "קרן השתלמות ניב"): yes —
 * the callers already require the document types to agree. A file whose own
 * company cannot be identified: only on the client's quoted words.
 */
export function tieAllowedByCompany(comparison: CompanyComparison, hasEvidence: boolean): boolean {
  if (comparison.verdict === 'same' || comparison.verdict === 'item_unidentified') return true;
  if (comparison.verdict === 'different') return false;
  return hasEvidence;
}
