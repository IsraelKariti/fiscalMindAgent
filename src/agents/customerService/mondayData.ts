import { mondayGraphQL } from '../../monday/client.js';
import { normalizeE164 } from '../../util/phone.js';

// Live monday reads for the customer-service agent: workdocs (office
// knowledge) and board rows scoped to one client's phone number. Fetched on
// every inbound message by design — no caching, answers always reflect the
// current monday content.

export interface MondayDocMeta {
  id: string;
  name: string;
}

export interface MondayBoardMeta {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
}

const TEXT_TYPES = new Set(['text', 'long_text']);

/**
 * Workdocs the accountant can attach as knowledge sources (settings picker).
 * Deliberately no `workspace { name }` — that field needs the extra
 * workspaces:read scope and errors the whole query without it.
 */
export async function listDocs(accessToken: string): Promise<MondayDocMeta[]> {
  const data = await mondayGraphQL<{
    docs: ({ id: string; name: string } | null)[] | null;
  }>(accessToken, 'query { docs (limit: 100, order_by: used_at) { id name } }');
  return (data.docs ?? [])
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((d) => ({ id: d.id, name: d.name }));
}

export interface MondayDocText {
  id: string;
  name: string;
  text: string;
}

/** Recursively collects every "insert" string of a doc block's delta-format content JSON. */
function collectInserts(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectInserts(entry, out);
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  for (const [key, nested] of Object.entries(value)) {
    if (key === 'insert' && typeof nested === 'string') out.push(nested);
    else collectInserts(nested, out);
  }
}

/** Reads the attached workdocs' blocks and flattens them to plain text. */
export async function fetchDocsText(accessToken: string, docIds: string[]): Promise<MondayDocText[]> {
  if (docIds.length === 0) return [];
  const data = await mondayGraphQL<{
    docs:
      | ({ id: string; name: string; blocks: ({ content: string | null } | null)[] | null } | null)[]
      | null;
  }>(accessToken, 'query ($ids: [ID!]) { docs (ids: $ids) { id name blocks (limit: 500) { content } } }', {
    ids: docIds,
  });
  return (data.docs ?? [])
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .map((doc) => {
      const lines: string[] = [];
      for (const block of doc.blocks ?? []) {
        if (!block?.content) continue;
        // One malformed block must not lose the rest of the doc.
        try {
          const parts: string[] = [];
          collectInserts(JSON.parse(block.content), parts);
          const line = parts.join('').trim();
          if (line) lines.push(line);
        } catch {
          /* skip unparseable block */
        }
      }
      return { id: doc.id, name: doc.name, text: lines.join('\n') };
    });
}

/** Default board filter: has a column that could hold a phone number. */
const PHONE_CAPABLE = (type: string): boolean => type === 'phone' || TEXT_TYPES.has(type);

/** Board filter for agents matching clients by email column instead of phone. */
export const EMAIL_CAPABLE = (type: string): boolean => type === 'email' || TEXT_TYPES.has(type);

/** Boards the accountant can attach for per-client rows: must have a column the key value could live in. */
export async function listBoards(
  accessToken: string,
  columnTypeOk: (type: string) => boolean = PHONE_CAPABLE,
): Promise<MondayBoardMeta[]> {
  const data = await mondayGraphQL<{
    boards: ({ id: string; name: string; type: string; columns: MondayBoardMeta['columns'] } | null)[] | null;
  }>(accessToken, 'query { boards (limit: 200, order_by: used_at) { id name type columns { id title type } } }');
  return (data.boards ?? [])
    .filter((b): b is NonNullable<typeof b> => b !== null)
    .filter((b) => b.type === 'board' && b.columns.some((c) => columnTypeOk(c.type)))
    .map(({ id, name, columns }) => ({ id, name, columns }));
}

/**
 * THE privacy boundary of the customer-service agent: only rows whose phone
 * column matches the sender's number may reach the LLM. Every fetched item is
 * re-verified here in memory, regardless of how monday answered the filtered
 * query — nothing that fails phonesMatch leaves this module.
 */

/** Digits that identify the line: strips formatting, an international 00 prefix, or a local trunk 0. */
function significantDigits(raw: string): string {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

/** Minimum matching digits: an Israeli subscriber number (no trunk 0 / country code) is 9. */
const MIN_MATCH_DIGITS = 9;

/**
 * Does a board cell hold the sender's number? Exact E.164 equality when the
 * cell normalizes ("+972 50-123 4567", "050-1234567"); otherwise the shorter
 * significant-digit string must be a suffix of the longer one and still ≥9
 * digits — covering cells stored without a country code against the E.164
 * wa_phone (501234567 ⊂ 972501234567) without ever matching a different line.
 */
export function phonesMatch(cellValue: string, waPhone: string): boolean {
  const cellE164 = normalizeE164(cellValue);
  if (cellE164) return cellE164 === waPhone;
  const cell = significantDigits(cellValue);
  const wa = significantDigits(waPhone);
  const [shorter, longer] = cell.length <= wa.length ? [cell, wa] : [wa, cell];
  return shorter.length >= MIN_MATCH_DIGITS && longer.endsWith(shorter);
}

export interface MondayBoardRows {
  boardName: string;
  /** Display name of the first phone-verified row: the configured name column, else the item name. */
  clientName: string | null;
  /** Phone-verified items, flattened to { column title: cell text }. */
  rows: Record<string, string>[];
}

interface RawItem {
  name: string;
  column_values: { id: string; text: string | null; phone?: string | null }[];
}

interface RawItemsPage {
  cursor: string | null;
  items: RawItem[];
}

interface RawBoard {
  name: string;
  columns: { id: string; title: string }[];
  items_page: RawItemsPage;
}

const ITEM_FIELDS = 'items { name column_values { id text ... on PhoneValue { phone } } }';
const PAGE_SIZE = 500;
/** Hard cap on rows scanned per board per message, to keep one reply bounded. */
const MAX_SCANNED_ITEMS = 2000;

/** First non-blank item name among the verified rows. */
function firstName(names: string[]): string | null {
  return names.map((n) => n.trim()).find((n) => n !== '') ?? null;
}

function cellText(item: RawItem, columnId: string): string {
  const cell = item.column_values.find((cv) => cv.id === columnId);
  return (cell?.phone ?? cell?.text ?? '').trim();
}

/**
 * How a board row is recognized as the client's: `matches` is the in-memory
 * verification every item must pass (the privacy boundary), `searchTerm` seeds
 * monday's filtered fast path (contains_text) — its semantics may be loose,
 * which is fine because `matches` re-verifies everything.
 */
export interface CellMatcher {
  searchTerm: string;
  matches(cell: string): boolean;
}

/** Keeps only matcher-verified items and flattens them for the prompt. */
function verifyAndFlatten(
  items: RawItem[],
  columns: { id: string; title: string }[],
  keyColumnId: string,
  matcher: CellMatcher,
  nameColumnId?: string,
): { rows: Record<string, string>[]; names: string[] } {
  const titles = new Map(columns.map((c) => [c.id, c.title]));
  const rows: Record<string, string>[] = [];
  const names: string[] = [];
  for (const item of items) {
    const cell = cellText(item, keyColumnId);
    if (!cell || !matcher.matches(cell)) continue;
    const row: Record<string, string> = { שם: item.name };
    for (const cv of item.column_values) {
      const text = (cv.phone ?? cv.text ?? '').trim();
      if (text) row[titles.get(cv.id) ?? cv.id] = text;
    }
    rows.push(row);
    // The configured name column, with the item name as fallback for unset config or empty cells.
    names.push((nameColumnId ? cellText(item, nameColumnId) : '') || item.name);
  }
  return { rows, names };
}

/**
 * Fetches the client's rows from one board. Fast path: a filtered items_page
 * (contains_text on the key column with the matcher's search term). Because
 * that filter's semantics aren't guaranteed for every column type, a filter
 * error — or zero verified hits — falls back to a full cursor scan (capped)
 * with the same in-memory verification.
 */
export async function fetchRowsMatching(
  accessToken: string,
  boardId: string,
  keyColumnId: string,
  matcher: CellMatcher,
  nameColumnId?: string,
): Promise<MondayBoardRows> {
  const { searchTerm } = matcher;

  let filtered: RawBoard | null | undefined;
  try {
    filtered = (
      await mondayGraphQL<{ boards: (RawBoard | null)[] | null }>(
        accessToken,
        `query ($ids: [ID!], $limit: Int!, $rules: [ItemsQueryRule!]) {
           boards (ids: $ids) { name columns { id title }
             items_page (limit: $limit, query_params: { rules: $rules }) { cursor ${ITEM_FIELDS} } } }`,
        {
          ids: [boardId],
          limit: PAGE_SIZE,
          rules: [{ column_id: keyColumnId, compare_value: searchTerm, operator: 'contains_text' }],
        },
      )
    ).boards?.[0];
  } catch {
    filtered = null;
  }

  if (filtered) {
    const { rows, names } = verifyAndFlatten(filtered.items_page.items, filtered.columns, keyColumnId, matcher, nameColumnId);
    if (rows.length > 0) return { boardName: filtered.name, clientName: firstName(names), rows };
  }

  // Full scan fallback — also confirms a genuine "no rows for this client".
  const first = (
    await mondayGraphQL<{ boards: (RawBoard | null)[] | null }>(
      accessToken,
      `query ($ids: [ID!], $limit: Int!) {
         boards (ids: $ids) { name columns { id title } items_page (limit: $limit) { cursor ${ITEM_FIELDS} } } }`,
      { ids: [boardId], limit: PAGE_SIZE },
    )
  ).boards?.[0];
  if (!first) return { boardName: filtered?.name ?? boardId, clientName: null, rows: [] };

  const { rows, names } = verifyAndFlatten(first.items_page.items, first.columns, keyColumnId, matcher, nameColumnId);
  let cursor = first.items_page.cursor;
  let scanned = first.items_page.items.length;
  while (cursor && scanned < MAX_SCANNED_ITEMS) {
    const page = (
      await mondayGraphQL<{ next_items_page: RawItemsPage }>(
        accessToken,
        `query ($cursor: String!, $limit: Int!) { next_items_page (cursor: $cursor, limit: $limit) { cursor ${ITEM_FIELDS} } }`,
        { cursor, limit: PAGE_SIZE },
      )
    ).next_items_page;
    const verified = verifyAndFlatten(page.items, first.columns, keyColumnId, matcher, nameColumnId);
    rows.push(...verified.rows);
    names.push(...verified.names);
    scanned += page.items.length;
    cursor = page.cursor;
  }
  return { boardName: first.name, clientName: firstName(names), rows };
}

/** The customer-service form of fetchRowsMatching: rows verified by phonesMatch. */
export async function fetchRowsByPhone(
  accessToken: string,
  boardId: string,
  phoneColumnId: string,
  waPhone: string,
  nameColumnId?: string,
): Promise<MondayBoardRows> {
  return fetchRowsMatching(
    accessToken,
    boardId,
    phoneColumnId,
    { searchTerm: significantDigits(waPhone).slice(-MIN_MATCH_DIGITS), matches: (cell) => phonesMatch(cell, waPhone) },
    nameColumnId,
  );
}

/** One board item as the daily debt scan sees it: raw cells by column id plus the flattened prompt row. */
export interface BoardScanRow {
  itemName: string;
  /** Cell text keyed by column id — for key-column lookups (email/name). */
  cells: Record<string, string>;
  /** Cell text keyed by column title — the shape the prompts consume. */
  row: Record<string, string>;
}

/**
 * Every row of a board (capped at MAX_SCANNED_ITEMS), unfiltered — for
 * whole-board sweeps like the debt collector's daily scan. Callers own the
 * privacy question: the entire board content leaves this module.
 */
export async function fetchAllBoardRows(
  accessToken: string,
  boardId: string,
): Promise<{ boardName: string; rows: BoardScanRow[] }> {
  const first = (
    await mondayGraphQL<{ boards: (RawBoard | null)[] | null }>(
      accessToken,
      `query ($ids: [ID!], $limit: Int!) {
         boards (ids: $ids) { name columns { id title } items_page (limit: $limit) { cursor ${ITEM_FIELDS} } } }`,
      { ids: [boardId], limit: PAGE_SIZE },
    )
  ).boards?.[0];
  if (!first) return { boardName: boardId, rows: [] };

  const titles = new Map(first.columns.map((c) => [c.id, c.title]));
  const rows: BoardScanRow[] = [];
  const collect = (items: RawItem[]) => {
    for (const item of items) {
      const cells: Record<string, string> = {};
      const row: Record<string, string> = { שם: item.name };
      for (const cv of item.column_values) {
        const text = (cv.phone ?? cv.text ?? '').trim();
        if (!text) continue;
        cells[cv.id] = text;
        row[titles.get(cv.id) ?? cv.id] = text;
      }
      rows.push({ itemName: item.name, cells, row });
    }
  };

  collect(first.items_page.items);
  let cursor = first.items_page.cursor;
  let scanned = first.items_page.items.length;
  while (cursor && scanned < MAX_SCANNED_ITEMS) {
    const page = (
      await mondayGraphQL<{ next_items_page: RawItemsPage }>(
        accessToken,
        `query ($cursor: String!, $limit: Int!) { next_items_page (cursor: $cursor, limit: $limit) { cursor ${ITEM_FIELDS} } }`,
        { cursor, limit: PAGE_SIZE },
      )
    ).next_items_page;
    collect(page.items);
    scanned += page.items.length;
    cursor = page.cursor;
  }
  return { boardName: first.name, rows };
}
