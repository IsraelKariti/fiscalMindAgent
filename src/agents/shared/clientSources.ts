import { z } from 'zod';
import { normalizeE164 } from '../../util/phone.js';
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
    /** Column holding the client's email address — the row key (email-keyed agents; optional for WhatsApp-only agents, which key by phone). */
    emailColumnId: z.string().min(1).optional(),
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
    /** Status column the agent writes its progress labels to (mondayStatusSync) — optional. */
    statusColumnId: z.string().min(1).optional(),
    /** Connect-boards column linking to the client's CRM item (phone/name/ID live there) — declaration of capital. */
    crmLinkColumnId: z.string().min(1).optional(),
    /** Connect-boards column linking to the client's submitted intake-questionnaire item — declaration of capital. */
    formLinkColumnId: z.string().min(1).optional(),
    /** Column holding the client's tax-office file number (מס' תיק) — declaration of capital. */
    fileNumberColumnId: z.string().min(1).optional(),
    /** Column holding the row's declaration year (שנת הצהרת הון) — declaration of capital. */
    yearColumnId: z.string().min(1).optional(),
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
    /** Header text of the column holding client email addresses — the row key (optional for WhatsApp-only agents, which key by phone). */
    emailColumn: z.string().min(1).optional(),
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
export type BoardSource = z.infer<typeof BoardSourceSchema>;

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
    /** The monday row's identity — null for sheet rows; persisted so the agent can write back (status sync). */
    mondayItem: { boardId: string; itemId: string } | null;
    row: Record<string, string>;
  }[];
}

/** Any configured source maps a per-row documents column. */
export function hasDocumentsColumn(settings: ClientSources): boolean {
  return settings.boards.some((b) => b.documentsColumnId) || settings.sheets.some((s) => s.documentsColumn);
}

/** Any configured source maps a phone column — the row key of WhatsApp-only agents. */
export function hasPhoneColumn(settings: ClientSources): boolean {
  return settings.boards.some((b) => b.phoneColumnId) || settings.sheets.some((s) => s.phoneColumn);
}

/**
 * Any configured board maps a CRM connect-boards column (declaration of
 * capital): the client's phone arrives by following that link at kickoff time,
 * so such a config is enrollable even without a phone column of its own.
 */
export function hasCrmLinkColumn(settings: ClientSources): boolean {
  return settings.boards.some((b) => b.crmLinkColumnId);
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
 * Every row (with a non-empty email or phone cell) of every configured source —
 * the scans' sweep for rows that have no client yet. Rows carrying neither key
 * can never be contacted on any channel, so they are dropped here; which key
 * actually matters is the caller's choice (collectCandidates keyKind). Each
 * source fails independently into failedSources.
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
              email: (board.emailColumnId ? (item.cells[board.emailColumnId] ?? '') : '').trim().toLowerCase(),
              name: (board.nameColumnId ? (item.cells[board.nameColumnId] ?? '') : '').trim() || item.itemName.trim(),
              phone: (board.phoneColumnId ? (item.cells[board.phoneColumnId] ?? '') : '').trim(),
              documentsCell: (board.documentsColumnId ? (item.cells[board.documentsColumnId] ?? '') : '').trim(),
              credentials: extractCredentials(
                board.idNumberColumnId ? item.cells[board.idNumberColumnId] : undefined,
                board.taxUserCodeColumnId ? item.cells[board.taxUserCodeColumnId] : undefined,
              ),
              mondayItem: { boardId: board.boardId, itemId: item.itemId },
              row: item.row,
            }))
            .filter((r) => r.email !== '' || r.phone !== ''),
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
              email: (sheet.emailColumn ? (row[sheet.emailColumn] ?? '') : '').trim().toLowerCase(),
              name: (sheet.nameColumn ? (row[sheet.nameColumn] ?? '') : '').trim(),
              phone: (sheet.phoneColumn ? (row[sheet.phoneColumn] ?? '') : '').trim(),
              documentsCell: (sheet.documentsColumn ? (row[sheet.documentsColumn] ?? '') : '').trim(),
              credentials: extractCredentials(
                sheet.idNumberColumn ? row[sheet.idNumberColumn] : undefined,
                sheet.taxUserCodeColumn ? row[sheet.taxUserCodeColumn] : undefined,
              ),
              mondayItem: null,
              row,
            }))
            .filter((r) => r.email !== '' || r.phone !== ''),
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
  /** The candidate's monday row (first board row that carried the key); null for sheet-only candidates. */
  mondayItem: { boardId: string; itemId: string } | null;
  /** One "[source] header: value | …" line per row the email appeared in (LLM screening / logs). */
  lines: string[];
}

/**
 * Rows merged across sources into one candidate per key; first non-empty
 * name/phone/credentials win. The key is the map key AND the dedupe identity:
 * - 'email' (default): a valid, lowercased email address.
 * - 'phone' (WhatsApp-only agents): the E.164-normalized phone number — rows
 *   whose phone cell doesn't normalize are dropped (they can't be messaged).
 */
export function collectCandidates(sources: ScanSourceRows[], keyKind: 'email' | 'phone' = 'email'): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  for (const source of sources) {
    for (const row of source.rows) {
      let key: string;
      if (keyKind === 'phone') {
        const normalized = normalizeE164(row.phone);
        if (!normalized) continue;
        key = normalized;
      } else {
        if (!EMAIL_SHAPE.test(row.email)) continue;
        key = row.email;
      }
      const line = `[${source.sourceName}] ${Object.entries(row.row)
        .map(([header, value]) => `${header}: ${value}`)
        .join(' | ')}`;
      const existing = candidates.get(key);
      if (existing) {
        existing.lines.push(line);
        if (!existing.name) existing.name = row.name;
        if (!existing.email) existing.email = row.email;
        if (!existing.phone) existing.phone = row.phone;
        if (!existing.documentsCell) existing.documentsCell = row.documentsCell;
        if (!existing.credentials) existing.credentials = row.credentials;
        if (!existing.mondayItem) existing.mondayItem = row.mondayItem;
      } else {
        candidates.set(key, {
          email: row.email,
          name: row.name,
          phone: row.phone,
          documentsCell: row.documentsCell,
          credentials: row.credentials,
          mondayItem: row.mondayItem,
          lines: [line],
        });
      }
    }
  }
  return candidates;
}
