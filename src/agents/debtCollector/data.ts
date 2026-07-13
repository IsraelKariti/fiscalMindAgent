import { getFreshGoogleAccessToken } from '../../api/googleOauth.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import {
  fetchAllSheetRows,
  fetchSheetRowsMatching,
  type SheetRows,
} from '../customerService/googleData.js';
import {
  fetchAllBoardRows,
  fetchRowsMatching,
  type MondayBoardRows,
} from '../customerService/mondayData.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { DebtCollectorSettings } from './settings.js';

/**
 * THE privacy boundary of the debt collector's per-client fetches: only rows
 * whose email column matches the client's address may reach the LLM. Client
 * addresses are stored lowercased; cells are compared case-insensitively.
 */
export function emailsMatch(cellValue: string, clientEmail: string): boolean {
  const cell = cellValue.trim().toLowerCase();
  return cell !== '' && cell === clientEmail.trim().toLowerCase();
}

/** Everything the planning prompt gets about the client's financial rows. */
export interface DebtData {
  boardRows: MondayBoardRows[];
  sheetRows: SheetRows[];
  /** Sources that were configured but could not be read this cycle. */
  failedSources: string[];
  configuredSources: number;
}

/**
 * Fetches the client's rows live from every configured monday board and Google
 * Sheet (CS pattern: fresh on every planning cycle, no caching — the analysis
 * always reflects the accountant's current data). Each source fails
 * independently into failedSources.
 */
export async function loadDebtData(ctx: AgentContext, settings: DebtCollectorSettings): Promise<DebtData> {
  const email = ctx.client.email_address;
  const data: DebtData = {
    boardRows: [],
    sheetRows: [],
    failedSources: [],
    configuredSources: settings.boards.length + settings.sheets.length,
  };

  await Promise.all([loadMondayRows(ctx, settings, email, data), loadSheetRows(ctx, settings, email, data)]);
  return data;
}

async function loadMondayRows(
  ctx: AgentContext,
  settings: DebtCollectorSettings,
  email: string,
  data: DebtData,
): Promise<void> {
  if (settings.boards.length === 0) return;

  const token = await mondayOauthTokens.getByUserId(ctx.accountant!.id);
  if (!token) {
    logger.warn('debt collector: monday boards configured but no token', { instanceId: ctx.instance!.id });
    data.failedSources.push('monday (not connected)');
    return;
  }

  const results = await Promise.allSettled(
    settings.boards.map((board) =>
      fetchRowsMatching(
        token.access_token,
        board.boardId,
        board.emailColumnId,
        { searchTerm: email, matches: (cell) => emailsMatch(cell, email) },
        board.nameColumnId,
      ),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') data.boardRows.push(result.value);
    else {
      logger.warn('debt collector: board fetch failed', {
        boardId: settings.boards[i]?.boardId,
        reason: String(result.reason),
      });
      data.failedSources.push(`board ${settings.boards[i]?.boardName ?? settings.boards[i]?.boardId}`);
    }
  });
}

async function loadSheetRows(
  ctx: AgentContext,
  settings: DebtCollectorSettings,
  email: string,
  data: DebtData,
): Promise<void> {
  if (settings.sheets.length === 0) return;

  const token = await getGoogleToken(ctx, data);
  if (!token) return;

  const results = await Promise.allSettled(
    settings.sheets.map((sheet) =>
      fetchSheetRowsMatching(
        token,
        {
          spreadsheetId: sheet.spreadsheetId,
          sheetTitle: sheet.sheetTitle,
          keyColumn: sheet.emailColumn,
          nameColumn: sheet.nameColumn,
        },
        (cell) => emailsMatch(cell, email),
      ),
    ),
  );
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') data.sheetRows.push(result.value);
    else {
      logger.warn('debt collector: sheet fetch failed', {
        spreadsheetId: settings.sheets[i]?.spreadsheetId,
        reason: String(result.reason),
      });
      data.failedSources.push(
        `spreadsheet ${settings.sheets[i]?.spreadsheetName ?? settings.sheets[i]?.spreadsheetId}`,
      );
    }
  });
}

/** Google token with the CS degrade semantics: dead grant / not connected → failed source, not a throw. */
async function getGoogleToken(ctx: AgentContext, data: { failedSources: string[] }): Promise<string | null> {
  let token: string | null;
  try {
    token = await getFreshGoogleAccessToken(ctx.accountant!.id);
  } catch (err) {
    logger.warn('debt collector: google token refresh failed', { instanceId: ctx.instance!.id, reason: String(err) });
    data.failedSources.push('Google (connection failed)');
    return null;
  }
  if (!token) {
    logger.warn('debt collector: google sheets configured but not connected', { instanceId: ctx.instance!.id });
    data.failedSources.push('Google (not connected)');
    return null;
  }
  return token;
}

/** One source's rows as the daily scan sees them: each row keyed by its email cell. */
export interface ScanSourceRows {
  sourceName: string;
  rows: { email: string; name: string; row: Record<string, string> }[];
}

/**
 * Every row (with a non-empty email cell) of every configured source — the
 * daily scan's sweep for debtors that have no client yet. Rows without an
 * email can never be contacted, so they are dropped here.
 */
export async function loadAllRows(
  accountantId: string,
  settings: DebtCollectorSettings,
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
          logger.warn('debt scan: board fetch failed', { boardId: board.boardId, reason: String(result.reason) });
          failedSources.push(`board ${board.boardName ?? board.boardId}`);
          return;
        }
        sources.push({
          sourceName: `monday board "${result.value.boardName}"`,
          rows: result.value.rows
            .map((item) => ({
              email: (item.cells[board.emailColumnId] ?? '').trim().toLowerCase(),
              name: (board.nameColumnId ? (item.cells[board.nameColumnId] ?? '') : '').trim() || item.itemName.trim(),
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
      logger.warn('debt scan: google token refresh failed', { accountantId, reason: String(err) });
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
          logger.warn('debt scan: sheet fetch failed', {
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
              row,
            }))
            .filter((r) => r.email !== ''),
        });
      });
    }
  }

  return { sources, failedSources };
}
