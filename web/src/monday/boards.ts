import { mondayGraphQL } from './sdk';

// Board reading for the client import: everything runs through monday's
// seamless API from inside the iframe (the user's own permissions, no stored
// tokens), then the mapped rows are POSTed to /api/monday/clients/import.

export interface BoardColumn {
  id: string;
  title: string;
  type: string;
}

export interface BoardMeta {
  id: string;
  name: string;
  columns: BoardColumn[];
}

export interface ImportRow {
  name: string;
  email: string;
  phone: string | null;
}

interface ColumnValue {
  id: string;
  type: string;
  text: string | null;
  email?: string | null;
  phone?: string | null;
}

interface ItemsPage {
  cursor: string | null;
  items: { name: string; column_values: ColumnValue[] }[];
}

const PAGE_SIZE = 500;
/** Hard cap on rows read per import, to keep one interaction bounded. */
const MAX_ROWS = 2500;

export async function fetchBoards(boardIds: string[]): Promise<BoardMeta[]> {
  const data = await mondayGraphQL<{ boards: BoardMeta[] | null }>(
    'query ($ids: [ID!]) { boards (ids: $ids) { id name columns { id title type } } }',
    { ids: boardIds },
  );
  return data.boards ?? [];
}

const ITEM_FIELDS =
  'items { name column_values { id type text ... on EmailValue { email } ... on PhoneValue { phone } } }';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Reads the whole board (cursor-paginated, 500 items per page) and maps each
 * item to an import row: item name + the chosen email/phone columns. Items
 * without a usable email address are dropped here — the server would reject
 * them anyway.
 */
export async function fetchImportRows(
  boardId: string,
  emailColumnId: string,
  phoneColumnId: string | null,
): Promise<ImportRow[]> {
  const rows: ImportRow[] = [];

  let page = (
    await mondayGraphQL<{ boards: { items_page: ItemsPage }[] | null }>(
      `query ($ids: [ID!], $limit: Int!) { boards (ids: $ids) { items_page (limit: $limit) { cursor ${ITEM_FIELDS} } } }`,
      { ids: [boardId], limit: PAGE_SIZE },
    )
  ).boards?.[0]?.items_page;

  while (page) {
    for (const item of page.items) {
      const emailValue = item.column_values.find((cv) => cv.id === emailColumnId);
      const email = (emailValue?.email ?? emailValue?.text ?? '').trim();
      if (!item.name.trim() || !EMAIL_RE.test(email)) continue;
      const phoneValue = phoneColumnId ? item.column_values.find((cv) => cv.id === phoneColumnId) : undefined;
      const phone = (phoneValue?.phone ?? phoneValue?.text ?? '').trim() || null;
      rows.push({ name: item.name.trim(), email, phone });
    }
    if (!page.cursor || rows.length >= MAX_ROWS) break;
    page = (
      await mondayGraphQL<{ next_items_page: ItemsPage }>(
        `query ($cursor: String!, $limit: Int!) { next_items_page (cursor: $cursor, limit: $limit) { cursor ${ITEM_FIELDS} } }`,
        { cursor: page.cursor, limit: PAGE_SIZE },
      )
    ).next_items_page;
  }

  return rows.slice(0, MAX_ROWS);
}
