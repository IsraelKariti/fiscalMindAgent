/**
 * Pure rules for the display name of a child file cut out of a multi-document
 * PDF (openspec `file-splitting`): a child that matches a document on the
 * client's list is shown under that document's name. The name comes from our
 * own list only — never from the model's free text or from the file itself.
 * No imports of llm/db/audit, so the tests run without a database.
 */

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

/** The file name a named child downloads under: `<label> (<original base> p<from>-<to>).pdf`. */
export function childDownloadName(label: string, parentFilename: string, pageFrom: number, pageTo: number): string {
  const base = clean(parentFilename).replace(/\.pdf$/i, '');
  const source = base === '' ? `p${pageFrom}-${pageTo}` : `${base} p${pageFrom}-${pageTo}`;
  return `${clean(label)} (${source}).pdf`.replace(ILLEGAL_IN_FILENAME, '-');
}
