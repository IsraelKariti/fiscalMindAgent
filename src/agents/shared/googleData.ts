import { googleApiGet } from '../../google/client.js';

// Live Google Sheets reads for the client-import sources: spreadsheet
// metadata for the settings mapping UI and whole-tab sweeps for the import
// scan. Fetched on demand by design — no caching.

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

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
 * Every row of a tab (capped), flattened by header — the client-import scan's
 * whole-sheet sweep. Callers own the privacy question: the entire tab content
 * leaves this function.
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
