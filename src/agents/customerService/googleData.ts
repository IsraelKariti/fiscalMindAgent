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

/**
 * Fetches the client's rows from one sheet tab. The whole tab is read and
 * verified in memory with the same phonesMatch boundary as monday boards —
 * nothing that fails it leaves this module.
 */
export async function fetchSheetRowsByPhone(
  accessToken: string,
  cfg: SheetSourceConfig,
  waPhone: string,
): Promise<SheetRows> {
  const range = encodeURIComponent(tabRange(cfg.sheetTitle, `!1:${MAX_SCANNED_ROWS + 1}`));
  const data = await googleApiGet<{ values?: unknown[][] }>(
    accessToken,
    `${SHEETS_BASE}/${encodeURIComponent(cfg.spreadsheetId)}/values/${range}`,
  );
  const values = data.values ?? [];
  const headers = (values[0] ?? []).map((h) => String(h).trim());
  const phoneIndex = headers.indexOf(cfg.phoneColumn);
  if (phoneIndex === -1) {
    throw new Error(`phone column "${cfg.phoneColumn}" not found in sheet "${cfg.sheetTitle}"`);
  }
  const nameIndex = cfg.nameColumn ? headers.indexOf(cfg.nameColumn) : -1;

  const rows: Record<string, string>[] = [];
  const names: string[] = [];
  for (const raw of values.slice(1)) {
    const cell = String(raw[phoneIndex] ?? '').trim();
    if (!cell || !phonesMatch(cell, waPhone)) continue;
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      const text = String(raw[i] ?? '').trim();
      if (header && text) row[header] = text;
    });
    rows.push(row);
    if (nameIndex !== -1) names.push(String(raw[nameIndex] ?? '').trim());
  }
  return {
    sheetName: cfg.sheetTitle,
    clientName: names.find((n) => n !== '') ?? null,
    rows,
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
