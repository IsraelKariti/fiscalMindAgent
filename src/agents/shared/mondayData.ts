import { mondayGraphQL } from '../../monday/client.js';

// Live monday reads shared by the agents' client-import sources, the kickoff
// webhook and the board status sync. Fetched on demand by design — no caching,
// so imports and kickoffs always see the current board content.

export interface MondayBoardMeta {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
}

const TEXT_TYPES = new Set(['text', 'long_text']);

/** Default board filter: has a column that could hold a phone number. */
export const PHONE_CAPABLE = (type: string): boolean => type === 'phone' || TEXT_TYPES.has(type);

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

interface RawItem {
  id: string;
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

const ITEM_FIELDS = 'items { id name column_values { id text ... on PhoneValue { phone } } }';
const PAGE_SIZE = 500;
/** Hard cap on rows scanned per board per message, to keep one reply bounded. */
const MAX_SCANNED_ITEMS = 2000;

/** One board item as the daily debt scan sees it: raw cells by column id plus the flattened prompt row. */
export interface BoardScanRow {
  /** monday item id — persisted on imported clients so the agent can write back (status sync). */
  itemId: string;
  itemName: string;
  /** Cell text keyed by column id — for key-column lookups (email/name). */
  cells: Record<string, string>;
  /** Cell text keyed by column title — the shape the prompts consume. */
  row: Record<string, string>;
}

/**
 * One board item's cell text keyed by column id (same extraction as the board
 * sweeps), or null when the item is gone / not visible to the token. Powers
 * the monday kickoff webhook's row → client resolution.
 */
export async function fetchBoardItemCells(accessToken: string, itemId: string): Promise<Record<string, string> | null> {
  const data = await mondayGraphQL<{ items: (RawItem | null)[] | null }>(
    accessToken,
    'query ($ids: [ID!]) { items (ids: $ids) { name column_values { id text ... on PhoneValue { phone } } } }',
    { ids: [itemId] },
  );
  const item = data.items?.[0];
  if (!item) return null;
  const cells: Record<string, string> = {};
  for (const cv of item.column_values) {
    const text = (cv.phone ?? cv.text ?? '').trim();
    if (text) cells[cv.id] = text;
  }
  return cells;
}

/** One column of a single fetched item: identity, display text and — for connect-boards columns — the linked item ids. */
export interface ItemColumnDetail {
  id: string;
  title: string;
  type: string;
  /** monday's display text ('' when empty); phone columns yield the raw phone value. */
  text: string;
  /** Linked item ids of a board_relation (connect-boards) column; empty for every other type. */
  linkedItemIds: string[];
}

export interface ItemDetails {
  itemId: string;
  itemName: string;
  columns: ItemColumnDetail[];
}

/**
 * One board item with everything the declaration-of-capital intake needs to
 * follow its links and read a linked form response: per-column title + type,
 * the display text, and connect-boards linked item ids. Null when the item is
 * gone / not visible to the token.
 */
export async function fetchItemDetails(accessToken: string, itemId: string): Promise<ItemDetails | null> {
  interface RawDetailedItem {
    id: string;
    name: string;
    column_values: {
      id: string;
      text: string | null;
      type: string;
      column: { title: string } | null;
      phone?: string | null;
      linked_item_ids?: string[] | null;
    }[];
  }
  const data = await mondayGraphQL<{ items: (RawDetailedItem | null)[] | null }>(
    accessToken,
    `query ($ids: [ID!]) { items (ids: $ids) { id name column_values {
       id text type column { title }
       ... on PhoneValue { phone }
       ... on BoardRelationValue { linked_item_ids } } } }`,
    { ids: [itemId] },
  );
  const item = data.items?.[0];
  if (!item) return null;
  return {
    itemId: item.id,
    itemName: item.name,
    columns: item.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column?.title ?? cv.id,
      type: cv.type,
      text: (cv.phone ?? cv.text ?? '').trim(),
      linkedItemIds: cv.linked_item_ids ?? [],
    })),
  };
}

/**
 * Sets a status column's label on one board item (requires the boards:write
 * scope). The label is matched by its text; a label the column doesn't have
 * yet is created rather than erroring, so the agents' fixed status texts work
 * on any board without the accountant pre-creating them.
 */
export async function changeItemStatusLabel(
  accessToken: string,
  args: { boardId: string; itemId: string; columnId: string; label: string },
): Promise<void> {
  await mondayGraphQL(
    accessToken,
    `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
       change_simple_column_value (board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value, create_labels_if_missing: true) { id } }`,
    { boardId: args.boardId, itemId: args.itemId, columnId: args.columnId, value: args.label },
  );
}

/**
 * Every row of a board (capped at MAX_SCANNED_ITEMS), unfiltered — the
 * client-import scan's whole-board sweep. Callers own the privacy question:
 * the entire board content leaves this module.
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
      rows.push({ itemId: item.id, itemName: item.name, cells, row });
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
