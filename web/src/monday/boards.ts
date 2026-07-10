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
  /** Required-document names parsed from the documents column (comma-separated). */
  documents: string[];
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

// Column mapping: monday reports a type per column (independent of its title),
// so Email/Phone columns match by type no matter what the user named them.
// Plain text columns are offered as candidates too — boards imported from
// spreadsheets often keep emails and phones in text columns — and preselection
// falls back to a title-synonym match for those.

const TEXT_TYPES = new Set(['text', 'long_text']);

const EMAIL_TITLES = new Set(['email', 'emailaddress', 'mail', 'emails', 'אימייל', 'מייל', 'דואל', 'почта', 'емейл']);
const PHONE_TITLES = new Set([
  'phone',
  'phonenumber',
  'mobile',
  'cell',
  'tel',
  'telephone',
  'טלפון',
  'נייד',
  'פלאפון',
  'телефон',
  'мобильный',
]);
const DOCUMENTS_TITLES = new Set([
  'requireddocuments',
  'requireddocs',
  'documents',
  'docs',
  'מסמכים',
  'מסמכיםנדרשים',
  'документы',
]);

/** Lowercase and strip separators/punctuation so "E-Mail_Address " → "emailaddress". */
function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[\s_\-./"'’]/g, '');
}

export function emailColumnCandidates(board: BoardMeta): BoardColumn[] {
  return board.columns.filter((c) => c.type === 'email' || TEXT_TYPES.has(c.type));
}

export function phoneColumnCandidates(board: BoardMeta): BoardColumn[] {
  return board.columns.filter((c) => c.type === 'phone' || TEXT_TYPES.has(c.type));
}

/** The client name defaults to the item name; any text column can replace it. */
export function nameColumnCandidates(board: BoardMeta): BoardColumn[] {
  return board.columns.filter((c) => TEXT_TYPES.has(c.type));
}

/** Required documents live in a text column of comma-separated names (no dedicated monday type). */
export function documentsColumnCandidates(board: BoardMeta): BoardColumn[] {
  return board.columns.filter((c) => TEXT_TYPES.has(c.type));
}

/**
 * The board's title for monday's built-in name column (every board has one,
 * often renamed — "Contact", "Client"…). Shown on the item-name option so the
 * user recognizes which board column it is; its value arrives as `item.name`,
 * not in `column_values`.
 */
export function nameColumnTitle(board: BoardMeta): string | null {
  return board.columns.find((c) => c.type === 'name')?.title ?? null;
}

function guessColumn(candidates: BoardColumn[], type: string, titles: Set<string>): string {
  const byType = candidates.find((c) => c.type === type);
  const byTitle = byType ?? candidates.find((c) => titles.has(normalizeTitle(c.title)));
  return byTitle?.id ?? '';
}

export function guessEmailColumn(board: BoardMeta): string {
  return guessColumn(emailColumnCandidates(board), 'email', EMAIL_TITLES);
}

export function guessPhoneColumn(board: BoardMeta): string {
  return guessColumn(phoneColumnCandidates(board), 'phone', PHONE_TITLES);
}

/** Title-only guess ("required_documents" and friends) — monday has no documents column type. */
export function guessDocumentsColumn(board: BoardMeta): string {
  return documentsColumnCandidates(board).find((c) => DOCUMENTS_TITLES.has(normalizeTitle(c.title)))?.id ?? '';
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

/**
 * Fallback when the widget has no connected boards (monday's per-widget board
 * connection is easy to miss and dashboard-level connections don't always
 * propagate to existing widgets): every board the user can read that has a
 * column that could hold email addresses, most recently used first.
 */
export async function fetchImportableBoards(): Promise<BoardMeta[]> {
  const data = await mondayGraphQL<{ boards: (BoardMeta & { type: string })[] | null }>(
    'query { boards (limit: 100, order_by: used_at) { id name type columns { id title type } } }',
  );
  return (data.boards ?? []).filter((b) => b.type === 'board' && emailColumnCandidates(b).length > 0);
}

const ITEM_FIELDS =
  'items { name column_values { id type text ... on EmailValue { email } ... on PhoneValue { phone } } }';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/** Server-side max documents per client (see ImportSchema). */
const MAX_DOCUMENTS = 50;

/** "טופס 106, אישור ניכוי מס , דוח שנתי" → unique trimmed names, capped. */
function parseDocumentNames(text: string): string[] {
  const names = text
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return [...new Set(names)].slice(0, MAX_DOCUMENTS);
}

/**
 * Reads the whole board (cursor-paginated, 500 items per page) and maps each
 * item to an import row via the chosen columns. The name comes from the name
 * column when one is chosen (empty cells fall back to the item name), the item
 * name otherwise. Items without a usable email address are dropped here — the
 * server would reject them anyway.
 */
export async function fetchImportRows(
  boardId: string,
  emailColumnId: string,
  phoneColumnId: string | null,
  nameColumnId: string | null,
  documentsColumnId: string | null,
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
      const nameValue = nameColumnId ? item.column_values.find((cv) => cv.id === nameColumnId) : undefined;
      const name = (nameValue?.text ?? '').trim() || item.name.trim();
      if (!name || !EMAIL_RE.test(email)) continue;
      const phoneValue = phoneColumnId ? item.column_values.find((cv) => cv.id === phoneColumnId) : undefined;
      const phone = (phoneValue?.phone ?? phoneValue?.text ?? '').trim() || null;
      const documentsValue = documentsColumnId
        ? item.column_values.find((cv) => cv.id === documentsColumnId)
        : undefined;
      const documents = parseDocumentNames(documentsValue?.text ?? '');
      rows.push({ name, email, phone, documents });
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
