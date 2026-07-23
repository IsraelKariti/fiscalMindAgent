import { z } from 'zod';
import { getFreshGoogleAccessToken } from '../../api/googleOauth.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { fetchAllSheetRows } from '../customerService/googleData.js';
import { fetchAllBoardRows } from '../customerService/mondayData.js';
import { logger } from '../../util/logger.js';

/**
 * Client-source config shared by every agent that reads client rows from the
 * accountant's monday boards / Google Sheets (debt collector, doc collector,
 * annual-report assistant): each source is mapped by the column the client
 * email addresses live in, plus an optional display-name column.
 */
export const BoardSourceSchema = z
  .object({
    boardId: z.string().min(1),
    /** Column holding the client's email address — the row key. */
    emailColumnId: z.string().min(1),
    /** Column holding the client's display name; unset = the monday item name. */
    nameColumnId: z.string().min(1).optional(),
    /** Column holding the client's phone number — optional, free text. */
    phoneColumnId: z.string().min(1).optional(),
    /** Column holding the client's national ID (ת"ז) — tax-portal login, optional. */
    idNumberColumnId: z.string().min(1).optional(),
    /** Column holding the client's tax-authority permanent user code — optional. */
    taxUserCodeColumnId: z.string().min(1).optional(),
    /** Column listing the client's required documents (doc collector) — optional. */
    documentsColumnId: z.string().min(1).optional(),
    /** Display cache for the settings UI; the live fetch re-reads the real name. */
    boardName: z.string().optional(),
    /** Set by the settings UI on add; the UI shows "import now" until a scan clears it. */
    pendingImport: z.boolean().optional(),
  })
  .strict();

/** Google Sheets sources (Picker-granted via drive.file). */
export const SheetSourceSchema = z
  .object({
    spreadsheetId: z.string().min(1),
    /** Display cache for the settings UI. */
    spreadsheetName: z.string().optional(),
    /** The tab the client rows live in. */
    sheetTitle: z.string().min(1),
    /** Header text of the column holding client email addresses. */
    emailColumn: z.string().min(1),
    /** Header text of the column holding the client's display name. */
    nameColumn: z.string().min(1).optional(),
    /** Header text of the column holding the client's phone number — optional. */
    phoneColumn: z.string().min(1).optional(),
    /** Header text of the column holding the client's national ID (ת"ז) — optional. */
    idNumberColumn: z.string().min(1).optional(),
    /** Header text of the column holding the tax-authority permanent user code — optional. */
    taxUserCodeColumn: z.string().min(1).optional(),
    /** Header text of the column listing the client's required documents (doc collector) — optional. */
    documentsColumn: z.string().min(1).optional(),
    /** Set by the settings UI on add; the UI shows "import now" until a scan clears it. */
    pendingImport: z.boolean().optional(),
  })
  .strict();

export const ClientSourcesSchema = z
  .object({
    boards: z.array(BoardSourceSchema).max(10).default([]),
    sheets: z.array(SheetSourceSchema).max(10).default([]),
  })
  .strict();

export type ClientSources = z.infer<typeof ClientSourcesSchema>;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export function parseClientSources(raw: Record<string, unknown>): ClientSources {
  const parsed = ClientSourcesSchema.safeParse(raw);
  return parsed.success ? parsed.data : { boards: [], sheets: [] };
}

/** Tax-portal login pair mapped from a source row (both cells present). */
export interface PortalCredentials {
  idNumber: string;
  userCode: string;
}

/** One source's rows as a sweep sees them: each row keyed by its email cell. */
export interface ScanSourceRows {
  sourceName: string;
  rows: {
    email: string;
    name: string;
    phone: string;
    /** Raw text of the mapped documents column; '' when unmapped or empty. */
    documentsCell: string;
    credentials: PortalCredentials | null;
    row: Record<string, string>;
  }[];
}

/** Any configured source maps a per-row documents column. */
export function hasDocumentsColumn(settings: ClientSources): boolean {
  return settings.boards.some((b) => b.documentsColumnId) || settings.sheets.some((s) => s.documentsColumn);
}

/**
 * Document names from a source row's documents cell: split on newlines, commas
 * and semicolons, trimmed, deduped, clamped to the checklist limits (50 items,
 * 200 chars each — the DocCollectorSettingsSchema bounds).
 */
export function parseDocumentsCell(cell: string): string[] {
  const names: string[] = [];
  for (const part of cell.split(/[\n,;]+/)) {
    const name = part.trim().slice(0, 200);
    if (name !== '' && !names.includes(name)) names.push(name);
    if (names.length >= 50) break;
  }
  return names;
}

/** Both mapped cells non-empty, else no credentials for the row. */
function extractCredentials(idNumber: string | undefined, userCode: string | undefined): PortalCredentials | null {
  const id = (idNumber ?? '').trim();
  const code = (userCode ?? '').trim();
  return id !== '' && code !== '' ? { idNumber: id, userCode: code } : null;
}

/**
 * Every row (with a non-empty email cell) of every configured source — the
 * scans' sweep for rows that have no client yet. Rows without an email can
 * never be contacted, so they are dropped here. Each source fails
 * independently into failedSources.
 */
export async function loadAllRows(
  accountantId: string,
  settings: ClientSources,
): Promise<{ sources: ScanSourceRows[]; failedSources: string[] }> {
  const sources: ScanSourceRows[] = [];
  const failedSources: string[] = [];

  if (settings.boards.length > 0) {
    const token = await mondayOauthTokens.getByUserId(accountantId);
    if (!token) failedSources.push('monday (not connected)');
    else {
      const results = await Promise.allSettled(
        settings.boards.map((board) => fetchAllBoardRows(token.access_token, board.boardId)),
      );
      results.forEach((result, i) => {
        const board = settings.boards[i]!;
        if (result.status === 'rejected') {
          logger.warn('client-source scan: board fetch failed', { boardId: board.boardId, reason: String(result.reason) });
          failedSources.push(`board ${board.boardName ?? board.boardId}`);
          return;
        }
        sources.push({
          sourceName: `monday board "${result.value.boardName}"`,
          rows: result.value.rows
            .map((item) => ({
              email: (item.cells[board.emailColumnId] ?? '').trim().toLowerCase(),
              name: (board.nameColumnId ? (item.cells[board.nameColumnId] ?? '') : '').trim() || item.itemName.trim(),
              phone: (board.phoneColumnId ? (item.cells[board.phoneColumnId] ?? '') : '').trim(),
              documentsCell: (board.documentsColumnId ? (item.cells[board.documentsColumnId] ?? '') : '').trim(),
              credentials: extractCredentials(
                board.idNumberColumnId ? item.cells[board.idNumberColumnId] : undefined,
                board.taxUserCodeColumnId ? item.cells[board.taxUserCodeColumnId] : undefined,
              ),
              row: item.row,
            }))
            .filter((r) => r.email !== ''),
        });
      });
    }
  }

  if (settings.sheets.length > 0) {
    let token: string | null = null;
    try {
      token = await getFreshGoogleAccessToken(accountantId);
      if (!token) failedSources.push('Google (not connected)');
    } catch (err) {
      logger.warn('client-source scan: google token refresh failed', { accountantId, reason: String(err) });
      failedSources.push('Google (connection failed)');
    }
    if (token) {
      const results = await Promise.allSettled(
        settings.sheets.map((sheet) =>
          fetchAllSheetRows(token, { spreadsheetId: sheet.spreadsheetId, sheetTitle: sheet.sheetTitle }),
        ),
      );
      results.forEach((result, i) => {
        const sheet = settings.sheets[i]!;
        if (result.status === 'rejected') {
          logger.warn('client-source scan: sheet fetch failed', {
            spreadsheetId: sheet.spreadsheetId,
            reason: String(result.reason),
          });
          failedSources.push(`spreadsheet ${sheet.spreadsheetName ?? sheet.spreadsheetId}`);
          return;
        }
        sources.push({
          sourceName: `spreadsheet "${sheet.spreadsheetName ?? result.value.sheetName}" / tab "${result.value.sheetName}"`,
          rows: result.value.rows
            .map((row) => ({
              email: (row[sheet.emailColumn] ?? '').trim().toLowerCase(),
              name: (sheet.nameColumn ? (row[sheet.nameColumn] ?? '') : '').trim(),
              phone: (sheet.phoneColumn ? (row[sheet.phoneColumn] ?? '') : '').trim(),
              documentsCell: (sheet.documentsColumn ? (row[sheet.documentsColumn] ?? '') : '').trim(),
              credentials: extractCredentials(
                sheet.idNumberColumn ? row[sheet.idNumberColumn] : undefined,
                sheet.taxUserCodeColumn ? row[sheet.taxUserCodeColumn] : undefined,
              ),
              row,
            }))
            .filter((r) => r.email !== ''),
        });
      });
    }
  }

  return { sources, failedSources };
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface Candidate {
  email: string;
  name: string;
  /** Free-text phone number; '' when no source row carried one. */
  phone: string;
  /** Raw documents-column text; '' when no source row carried one. */
  documentsCell: string;
  /** Tax-portal login pair; null when no source row carried both cells. */
  credentials: PortalCredentials | null;
  /** One "[source] header: value | …" line per row the email appeared in (LLM screening / logs). */
  lines: string[];
}

/** Rows keyed by (valid, lowercased) email, merged across sources; first non-empty name/phone/credentials win. */
export function collectCandidates(sources: ScanSourceRows[]): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  for (const source of sources) {
    for (const row of source.rows) {
      if (!EMAIL_SHAPE.test(row.email)) continue;
      const line = `[${source.sourceName}] ${Object.entries(row.row)
        .map(([header, value]) => `${header}: ${value}`)
        .join(' | ')}`;
      const existing = candidates.get(row.email);
      if (existing) {
        existing.lines.push(line);
        if (!existing.name) existing.name = row.name;
        if (!existing.phone) existing.phone = row.phone;
        if (!existing.documentsCell) existing.documentsCell = row.documentsCell;
        if (!existing.credentials) existing.credentials = row.credentials;
      } else {
        candidates.set(row.email, {
          email: row.email,
          name: row.name,
          phone: row.phone,
          documentsCell: row.documentsCell,
          credentials: row.credentials,
          lines: [line],
        });
      }
    }
  }
  return candidates;
}
