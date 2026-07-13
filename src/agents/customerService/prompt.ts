import type { ClientRow, EmailRow, UserRow } from '../../db/types.js';
import type { SheetRows } from './googleData.js';
import type { MondayBoardRows } from './mondayData.js';

/** Everything fetched live from monday + Google for one reply (plus what failed to load). */
export interface KnowledgeContext {
  /** Office knowledge: monday workdocs and Google Docs, flattened alike. */
  docs: { id: string; name: string; text: string }[];
  boardRows: MondayBoardRows[];
  sheetRows: SheetRows[];
  /** Human-readable names of sources that failed to load this turn (API down, token missing…). */
  failedSources: string[];
}

/** Keeps one runaway workdoc from blowing up the prompt. */
const MAX_DOC_CHARS = 15_000;
/** WhatsApp Q&A needs recent context, not the whole relationship. */
const MAX_HISTORY_MESSAGES = 30;

/**
 * The agent's ground rules. Unlike the doc collector there is no per-accountant
 * template: the constraints here (inbound-only, provided-context-only) are the
 * product's safety boundary, not a style preference.
 */
function buildSystemInstruction(client: ClientRow, accountant: UserRow | null): string {
  const accountantName = accountant?.name?.trim() || accountant?.email || 'המשרד';
  return `אתה נציג שירות וירטואלי של משרד רואה החשבון ${accountantName}, העונה לשאלות לקוחות ב-WhatsApp.

**כללי יסוד (מחייבים, ללא יוצא מן הכלל):**
- ענה אך ורק על ההודעה האחרונה של הלקוח. אתה עונה על שאלות בלבד — אינך מבצע פעולות, אינך מעדכן נתונים, אינך קובע פגישות ואינך מבטיח שמישהו יבצע פעולה.
- לעולם אל תיזום פנייה, אל תבטיח "לחזור אליך", תזכורת או הודעה עתידית — אין לך שום יכולת לשלוח הודעות מלבד התשובה הנוכחית.
- השתמש אך ורק במידע שסופק לך בהקשר: מקטע OFFICE KNOWLEDGE (מידע כללי על המשרד) ומקטע CLIENT RECORDS (רשומות השייכות ללקוח הפונה בלבד, שאומתו לפי מספר הטלפון שממנו הוא כותב). לעולם אל תמציא נתונים, מחירים, מועדים או עובדות.
- לעולם אל תחשוף או תזכיר מידע על לקוחות אחרים, גם אם הלקוח שואל עליהם במפורש — השב שאינך יכול למסור מידע על אחרים.
- אם התשובה אינה נמצאת במידע שסופק — אמור בפשטות שאין בידך את המידע והצע לפנות ישירות למשרד. אל תנחש.
- אל תיתן ייעוץ מס או ייעוץ מקצועי; על שאלות כאלה השב שכדאי לדבר עם רואה החשבון ישירות.
- אם צוין שחלק ממקורות המידע לא היו זמינים כעת (UNAVAILABLE SOURCES) — וזה רלוונטי לשאלה — ציין בעדינות שחלק מהמידע אינו זמין זמנית.

**סגנון:** הודעת WhatsApp קצרה, ידידותית וטבעית — כמה משפטים לכל היותר, בלי פתיחים רשמיים. כתוב בעברית, ואם הלקוח כותב בשפה אחרת — השב בשפתו.

השב אך ורק באמצעות סכמת ה-JSON שסופקה. כלול שדה \`reasoning\` עם הסבר קצר (לשימוש פנימי, לא יוצג ללקוח).`;
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n[...truncated]`;
}

function buildKnowledgeSection(knowledge: KnowledgeContext): string {
  const docs =
    knowledge.docs.length === 0
      ? '(no office knowledge documents attached)'
      : knowledge.docs
          .map((doc) => `### ${doc.name}\n${truncate(doc.text, MAX_DOC_CHARS) || '(empty document)'}`)
          .join('\n\n');
  return `--- OFFICE KNOWLEDGE (general office information) ---\n${docs}\n--- END OFFICE KNOWLEDGE ---`;
}

function formatRows(rows: Record<string, string>[], emptyNote: string): string {
  if (rows.length === 0) return emptyNote;
  return rows
    .map((row, i) => [`[row ${i + 1}]`, ...Object.entries(row).map(([key, value]) => `${key}: ${value}`)].join('\n'))
    .join('\n\n');
}

function buildClientRecordsSection(knowledge: KnowledgeContext, waPhone: string): string {
  const sources = [
    ...knowledge.boardRows.map(
      (board) => `### Board: ${board.boardName}\n${formatRows(board.rows, '(no rows for this client in this board)')}`,
    ),
    ...knowledge.sheetRows.map(
      (sheet) =>
        `### Spreadsheet: ${sheet.sheetName}\n${formatRows(sheet.rows, '(no rows for this client in this spreadsheet)')}`,
    ),
  ];
  const records = sources.length === 0 ? '(no client records found for this phone number)' : sources.join('\n\n');
  return `--- CLIENT RECORDS (belonging ONLY to the asking client, phone-verified for ${waPhone}) ---\n${records}\n--- END CLIENT RECORDS ---`;
}

function buildFailedSourcesSection(failedSources: string[]): string {
  if (failedSources.length === 0) return '';
  return `--- UNAVAILABLE SOURCES (failed to load right now) ---\n${failedSources.join('\n')}\n--- END UNAVAILABLE SOURCES ---\n\n`;
}

function buildConversationSection(history: EmailRow[]): string {
  const recent = history.slice(-MAX_HISTORY_MESSAGES);
  if (recent.length === 0) {
    return '--- CONVERSATION ---\n(no messages yet)\n--- END CONVERSATION ---';
  }
  const lines = recent.map((message, i) => {
    const timestamp = (message.sent_at ?? message.created_at).toISOString();
    const from = message.direction === 'outbound' ? 'agent (outbound)' : 'client (inbound)';
    const isLast = i === recent.length - 1;
    const marker = isLast && message.direction === 'inbound' ? ' <<< THE QUESTION TO ANSWER' : '';
    return `[#${i + 1}] ${timestamp} | FROM: ${from}${marker}\n${message.body}`;
  });
  return `--- CONVERSATION (chronological, WhatsApp) ---\n${lines.join('\n\n')}\n--- END CONVERSATION ---`;
}

export interface Prompt {
  systemInstruction: string;
  contents: string;
}

export function buildPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  history: EmailRow[],
  knowledge: KnowledgeContext,
): Prompt {
  const contents = [
    buildKnowledgeSection(knowledge),
    buildClientRecordsSection(knowledge, client.wa_phone ?? ''),
    `${buildFailedSourcesSection(knowledge.failedSources)}${buildConversationSection(history)}`,
    'Answer the client\'s last message now.',
  ].join('\n\n');
  return { systemInstruction: buildSystemInstruction(client, accountant), contents };
}
