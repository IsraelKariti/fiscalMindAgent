import { googleApiGet } from '../../google/client.js';
import { phonesMatch } from './mondayData.js';

// Live Google reads for the customer-service agent: Docs (office knowledge)
// and Sheet rows scoped to one client's phone number. Like the monday
// fetchers, everything is fetched on every inbound message by design — no
// caching, answers always reflect the current file content.

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DOCS_BASE = 'https://docs.googleapis.com/v1/documents';

/** A1 reference to a whole tab (or its header row), safe for any tab name. */
function tabRange(sheetTitle: string, suffix = ''): string {
  return `'${sheetTitle.replace(/'/g, "''")}'${suffix}`;
}

export interface SpreadsheetMeta {
  title: string;
  /** Every tab with its header row (row 1) — what the phone/name column pickers offer. */
  sheets: { title: string; headers: string[] }[];
}

/** Tabs + header columns of one picked spreadsheet (settings mapping UI). */
export async function getSpreadsheetMeta(accessToken: string, spreadsheetId: string): Promise<SpreadsheetMeta> {
  const meta = await googleApiGet<{
    properties?: { title?: string };
    sheets?: { properties?: { title?: string } }[];
  }>(accessToken, `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`);
  const titles = (meta.sheets ?? [])
    .map((s) => s.properties?.title)
    .filter((t): t is string => typeof t === 'string' && t !== '');
  if (titles.length === 0) return { title: meta.properties?.title ?? spreadsheetId, sheets: [] };

  const ranges = titles.map((t) => `ranges=${encodeURIComponent(tabRange(t, '!1:1'))}`).join('&');
  const batch = await googleApiGet<{ valueRanges?: { values?: unknown[][] }[] }>(
    accessToken,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${ranges}`,
  );
  return {
    title: meta.properties?.title ?? spreadsheetId,
    sheets: titles.map((title, i) => ({
      title,
      headers: (batch.valueRanges?.[i]?.values?.[0] ?? []).map((h) => String(h).trim()).filter((h) => h !== ''),
    })),
  };
}

/** One configured sheet source (customer_service settings, `sheets` array). */
export interface SheetSourceConfig {
  spreadsheetId: string;
  sheetTitle: string;
  /** Header text of the column holding the client's phone number. */
  phoneColumn: string;
  /** Header text of the column holding the client's display name. */
  nameColumn?: string;
}

export interface SheetRows {
  sheetName: string;
  /** Display name of the first phone-verified row's name column (when configured). */
  clientName: string | null;
  /** Phone-verified rows, flattened to { header: cell text }. */
  rows: Record<string, string>[];
}

/** Hard cap on rows scanned per sheet per message, to keep one reply bounded. */
const MAX_SCANNED_ROWS = 5000;

/** Reads a whole tab (capped) and returns its trimmed header row + data rows. */
async function readTab(
  accessToken: string,
  spreadsheetId: string,
  sheetTitle: string,
): Promise<{ headers: string[]; values: unknown[][] }> {
  const range = encodeURIComponent(tabRange(sheetTitle, `!1:${MAX_SCANNED_ROWS + 1}`));
  const data = await googleApiGet<{ values?: unknown[][] }>(
    accessToken,
    `${SHEETS_BASE}/${encodeURIComponent(spreadsheetId)}/values/${range}`,
  );
  const values = data.values ?? [];
  return { headers: (values[0] ?? []).map((h) => String(h).trim()), values: values.slice(1) };
}

/** { header: cell text } for one raw row, skipping blank headers/cells. */
function flattenRow(headers: string[], raw: unknown[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, i) => {
    const text = String(raw[i] ?? '').trim();
    if (header && text) row[header] = text;
  });
  return row;
}

/**
 * Fetches the client's rows from one sheet tab. The whole tab is read and
 * every row verified in memory with the caller's matcher — the same boundary
 * pattern as monday boards; nothing that fails it leaves this function.
 */
export async function fetchSheetRowsMatching(
  accessToken: string,
  cfg: { spreadsheetId: string; sheetTitle: string; keyColumn: string; nameColumn?: string },
  matches: (cell: string) => boolean,
): Promise<SheetRows> {
  const { headers, values } = await readTab(accessToken, cfg.spreadsheetId, cfg.sheetTitle);
  const keyIndex = headers.indexOf(cfg.keyColumn);
  if (keyIndex === -1) {
    throw new Error(`key column "${cfg.keyColumn}" not found in sheet "${cfg.sheetTitle}"`);
  }
  const nameIndex = cfg.nameColumn ? headers.indexOf(cfg.nameColumn) : -1;

  const rows: Record<string, string>[] = [];
  const names: string[] = [];
  for (const raw of values) {
    const cell = String(raw[keyIndex] ?? '').trim();
    if (!cell || !matches(cell)) continue;
    rows.push(flattenRow(headers, raw));
    if (nameIndex !== -1) names.push(String(raw[nameIndex] ?? '').trim());
  }
  return {
    sheetName: cfg.sheetTitle,
    clientName: names.find((n) => n !== '') ?? null,
    rows,
  };
}

/** The customer-service form of fetchSheetRowsMatching: rows verified by phonesMatch. */
export async function fetchSheetRowsByPhone(
  accessToken: string,
  cfg: SheetSourceConfig,
  waPhone: string,
): Promise<SheetRows> {
  return fetchSheetRowsMatching(
    accessToken,
    { spreadsheetId: cfg.spreadsheetId, sheetTitle: cfg.sheetTitle, keyColumn: cfg.phoneColumn, nameColumn: cfg.nameColumn },
    (cell) => phonesMatch(cell, waPhone),
  );
}

/**
 * Every row of a tab (capped), flattened by header — for whole-sheet sweeps
 * like the debt collector's daily scan. Callers own the privacy question: the
 * entire tab content leaves this function.
 */
export async function fetchAllSheetRows(
  accessToken: string,
  cfg: { spreadsheetId: string; sheetTitle: string },
): Promise<{ sheetName: string; headers: string[]; rows: Record<string, string>[] }> {
  const { headers, values } = await readTab(accessToken, cfg.spreadsheetId, cfg.sheetTitle);
  return {
    sheetName: cfg.sheetTitle,
    headers,
    rows: values.map((raw) => flattenRow(headers, raw)).filter((row) => Object.keys(row).length > 0),
  };
}

export interface GoogleDocText {
  id: string;
  name: string;
  text: string;
}

/** Recursively collects the text of Docs structural elements (paragraphs, tables, nested cells). */
function collectDocText(elements: unknown[], out: string[]): void {
  for (const element of elements) {
    if (typeof element !== 'object' || element === null) continue;
    const el = element as {
      paragraph?: { elements?: { textRun?: { content?: string } }[] };
      table?: { tableRows?: { tableCells?: { content?: unknown[] }[] }[] };
    };
    if (el.paragraph?.elements) {
      const line = el.paragraph.elements
        .map((pe) => pe.textRun?.content ?? '')
        .join('')
        .replace(/\n$/, '');
      if (line.trim()) out.push(line);
    }
    if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        const cells: string[] = [];
        for (const cell of row.tableCells ?? []) {
          const cellLines: string[] = [];
          collectDocText(cell.content ?? [], cellLines);
          cells.push(cellLines.join(' '));
        }
        const line = cells.join(' | ').trim();
        if (line) out.push(line);
      }
    }
  }
}

/** Reads the attached Google Docs and flattens them to plain text. */
export async function fetchGoogleDocsText(
  accessToken: string,
  docs: { documentId: string; name: string }[],
): Promise<GoogleDocText[]> {
  return Promise.all(
    docs.map(async (doc) => {
      const data = await googleApiGet<{ title?: string; body?: { content?: unknown[] } }>(
        accessToken,
        `${DOCS_BASE}/${encodeURIComponent(doc.documentId)}`,
      );
      const lines: string[] = [];
      collectDocText(data.body?.content ?? [], lines);
      return { id: doc.documentId, name: data.title ?? doc.name, text: lines.join('\n') };
    }),
  );
}
