// A spreadsheet a client sends, rendered by code to the plain text the model
// reads (openspec `spreadsheet-files`). Gemini takes PDF, images and plain
// text inline — not office formats — so an Excel workbook or a CSV becomes one
// text block per sheet: a sheet-name line, then one line per non-empty row
// with the cells separated by a tab. The rendering is deterministic, so the
// injection screen, the classifier, the extractor and the admin's document
// pane all see exactly the same text.
//
// Bounded by design: the raw-size cap lives in isAnalyzable (5 MB); here the
// zip entries are size-checked before the workbook library inflates them, and
// the output stops at MAX_ROWS_PER_SHEET rows / MAX_CHARS characters. The
// rendering runs on the web process (file analysis happens in the inbound
// webhook), so nothing here may be unbounded in the input.

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_CONTENT_TYPE = 'text/csv';

/** Rows rendered per sheet before the rendering is cut. */
export const MAX_ROWS_PER_SHEET = 2_000;
/** Characters rendered in total before the rendering is cut. */
export const MAX_CHARS = 60_000;
/** A zip entry (one sheet's XML, the shared strings…) may not inflate past this. */
const MAX_ZIP_ENTRY_BYTES = 50 * 1024 * 1024;

export const CUT_LINE = '[… הקובץ נחתך כאן — ההמשך לא הוצג]';

const mimeOf = (contentType: string): string => (contentType.toLowerCase().split(';')[0] ?? '').trim();

/** True for the spreadsheet types the platform renders to text (xlsx and CSV). */
export function isSpreadsheetType(contentType: string): boolean {
  const mime = mimeOf(contentType);
  return mime === XLSX_CONTENT_TYPE || mime === CSV_CONTENT_TYPE;
}

/**
 * The plain-text rendering of a spreadsheet. Throws when the bytes are not a
 * spreadsheet of the given type or the workbook cannot be opened (damaged,
 * password-protected): the caller marks the file "failed".
 */
export async function renderSpreadsheetText(bytes: Buffer, contentType: string): Promise<string> {
  const mime = mimeOf(contentType);
  if (mime === CSV_CONTENT_TYPE) return renderRows([{ name: null, rows: parseCsv(bytes) }]);
  if (mime === XLSX_CONTENT_TYPE) return renderRows(await readWorkbook(bytes));
  throw new Error(`not a spreadsheet type: ${contentType}`);
}

interface RenderedSheet {
  /** null for a CSV (one nameless sheet). */
  name: string | null;
  /** Each row as its cell texts; trailing empty cells already dropped, empty rows already skipped. */
  rows: string[][];
}

function renderRows(sheets: RenderedSheet[]): string {
  const lines: string[] = [];
  let chars = 0;
  let cut = false;
  const push = (line: string): boolean => {
    if (chars + line.length + 1 > MAX_CHARS) {
      cut = true;
      return false;
    }
    lines.push(line);
    chars += line.length + 1;
    return true;
  };
  for (const sheet of sheets) {
    if (sheet.name !== null && !push(`--- sheet: ${sheet.name} ---`)) break;
    let rendered = 0;
    for (const row of sheet.rows) {
      if (rendered >= MAX_ROWS_PER_SHEET) {
        cut = true;
        break;
      }
      if (!push(row.join('\t'))) break;
      rendered++;
    }
    if (cut) break;
  }
  if (cut) lines.push(CUT_LINE);
  return lines.join('\n');
}

// ---------- xlsx ----------

async function readWorkbook(bytes: Buffer): Promise<RenderedSheet[]> {
  checkZipEntrySizes(bytes);
  // Loaded lazily: the library is large and only spreadsheet files need it.
  const { default: ExcelJS } = await import('exceljs');
  const reader = new ExcelJS.Workbook().xlsx;
  // exceljs ships its own (older) Buffer typing; the runtime value is a Node Buffer.
  const workbook = await reader.load(bytes as unknown as Parameters<typeof reader.load>[0]);
  const sheets: RenderedSheet[] = [];
  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
    // The library has already inflated the sheet (bounded by checkZipEntrySizes);
    // one row past the cap is enough to know the sheet was cut.
    for (let r = 1; r <= sheet.rowCount && rows.length <= MAX_ROWS_PER_SHEET; r++) {
      const cells = rowCells(sheet.getRow(r).values);
      if (cells.length > 0) rows.push(cells);
    }
    sheets.push({ name: sheet.name, rows });
  }
  return sheets;
}

type CellValue = import('exceljs').CellValue;

/** The row's cell texts in column order (exceljs indexes values from 1), trailing empties dropped. */
function rowCells(values: CellValue[] | { [key: string]: CellValue }): string[] {
  const list = Array.isArray(values) ? values : [];
  const cells: string[] = [];
  for (let c = 1; c < list.length; c++) cells.push(cellText(list[c]));
  while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
  return cells.some((cell) => cell !== '') ? cells : [];
}

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return clean(value);
  if (typeof value === 'number') return numberText(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return dateText(value);
  if ('richText' in value) return clean(value.richText.map((part) => part.text).join(''));
  if ('hyperlink' in value) return clean(value.text);
  if ('error' in value) return value.error;
  if ('result' in value || 'formula' in value || 'sharedFormula' in value) {
    const result = (value as { result?: number | string | boolean | Date | { error: string } }).result;
    if (result === undefined || result === null) return '';
    if (typeof result === 'object' && 'error' in result) return result.error;
    return cellText(result as CellValue);
  }
  return '';
}

function numberText(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  // Trim float noise (0.1 + 0.2) without turning a real fraction into an integer.
  return String(Number(n.toFixed(10)));
}

/** dd.mm.yyyy — exceljs reads a workbook date as a UTC instant of that calendar day. */
function dateText(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

/** Cell text on one line: tabs and newlines inside a cell would break the row/column layout. */
function clean(s: string): string {
  return s.replace(/[\t\r\n]+/g, ' ').trim();
}

/**
 * Walks the zip's central directory (the index at the end of every zip) and
 * refuses an entry whose declared inflated size is past the cap, before the
 * workbook library inflates anything. A file without a readable central
 * directory is not a workbook and is refused too.
 */
export function checkZipEntrySizes(bytes: Buffer): void {
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd < 0) throw new Error('not a zip file (no central directory)');
  const entries = bytes.readUInt16LE(eocd + 10);
  let offset = bytes.readUInt32LE(eocd + 16);
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('damaged zip central directory');
    const uncompressed = bytes.readUInt32LE(offset + 24);
    if (uncompressed > MAX_ZIP_ENTRY_BYTES) throw new Error(`zip entry too large when inflated (${uncompressed} bytes)`);
    const nameLen = bytes.readUInt16LE(offset + 28);
    const extraLen = bytes.readUInt16LE(offset + 30);
    const commentLen = bytes.readUInt16LE(offset + 32);
    offset += 46 + nameLen + extraLen + commentLen;
  }
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65535 bytes, at the very end.
  const min = Math.max(0, bytes.length - 22 - 65_535);
  for (let i = bytes.length - 22; i >= min; i--) {
    if (bytes.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

// ---------- csv ----------

/**
 * A small CSV reader: UTF-8 (BOM dropped), fields in double quotes may hold
 * the delimiter, newlines and doubled quotes; the delimiter is a comma unless
 * the first line holds more semicolons than commas (Hebrew Excel exports).
 */
export function parseCsv(bytes: Buffer): string[][] {
  let text = bytes.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = count(firstLine, ';') > count(firstLine, ',') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const endField = () => {
    row.push(clean(field));
    field = '';
  };
  const endRow = () => {
    endField();
    while (row.length > 0 && row[row.length - 1] === '') row.pop();
    if (row.some((cell) => cell !== '')) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n') endRow();
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}

function count(s: string, ch: string): number {
  let n = 0;
  for (const c of s) if (c === ch) n++;
  return n;
}
