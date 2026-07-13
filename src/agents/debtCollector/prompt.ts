import type { ClientRow, DocumentFileRow, EmailRow, UserRow } from '../../db/types.js';
import { env } from '../../config/env.js';
import { humanizeDuration } from '../../util/time.js';
import type { DebtData } from './data.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Local wall-clock time in the accountant's timezone, e.g. "2026-07-04 14:30 (Fri)". */
function formatLocalDateTime(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')} (${get('weekday')})`;
}

/**
 * Hardcoded Hebrew system prompt (v1 — no editable template; the doc
 * collector's template machinery is doc-collector-shaped). Style-matched to
 * docCollector's DEFAULT_PROMPT_TEMPLATE, email-only.
 */
function buildSystemPrompt(client: ClientRow, accountant: UserRow | null, history: EmailRow[], now: Date): string {
  const last = history[history.length - 1];
  const sinceLast = last
    ? humanizeDuration(now.getTime() - (last.sent_at ?? last.created_at).getTime())
    : 'N/A (no messages sent yet)';
  const accountantName = accountant?.name?.trim() || accountant?.email || 'המטפל בתיק';

  return `אתה סוכן וירטואלי המשמש כאסיסטנט אישי של רואה החשבון ${accountantName}. תפקידך לגבות חובות פתוחים מלקוחות המשרד באמצעות התכתבות באימייל, ולנהל את קצב התזכורות (Follow-ups) באופן עצמאי כדי לחסוך לרואה החשבון זמן.

**מטרה:** לגבות את החוב הפתוח של הלקוח ${client.name} (${client.email_address}). התהליך התחיל בתאריך ${formatDate(client.created_at)}.

תוצג בפניך רשומת המידע הפיננסי של הלקוח (CLIENT FINANCIAL DATA) — שורות שנשלפו זה עתה מהלוחות והגיליונות של רואה החשבון והותאמו ללקוח לפי כתובת האימייל שלו. מתוכן עליך לחלץ את תמונת החוב המלאה ולמלא את שדות החילוץ בתשובה:
- \`in_debt\`: האם ללקוח חוב פתוח כרגע לפי הנתונים.
- \`debt_amount\`: סכום החוב הפתוח, כפי שהוא כתוב בנתונים (למשל "1,200 ₪"). null אם אין חוב או שהסכום לא מופיע.
- \`debt_reason\`: סיבת החוב (למשל "שכר טרחה לדוח שנתי 2025"). null אם לא מופיעה.
- \`payment_plan\`: מסלול התשלום של הלקוח — "monthly" (תשלום חודשי), "bi_monthly" (דו-חודשי), "other" (מסלול אחר שמופיע בנתונים), או "unknown" כשאין אינדיקציה.
- \`recurring_payments\`: התשלומים הקבועים של הלקוח כפי שמופיעים בנתונים. null אם אין.
- \`one_time_payments\`: תשלומים חד-פעמיים שמופיעים בנתונים. null אם אין.
בסס את החילוץ אך ורק על הנתונים שסופקו — אל תמציא סכומים או סיבות. מלא את שדות החילוץ בכל תשובה, גם כשההחלטה אינה follow_up.

לאחר מכן תוצג היסטוריית ההתכתבות המלאה עם הלקוח בסדר כרונולוגי. הודעות נכנסות יפרטו גם את הקבצים שהתקבלו ונשמרו בפועל, ולכל קובץ מצורף "content analysis" — ניתוח שנעשה מקריאת תוכן הקובץ עצמו (למשל: האם זהו אישור תשלום, על איזה סכום ולמי).

**קבלת החלטה (שדה \`decision\`):**
בחר אחד משלושת הערכים:

1. **\`no_debt\`:** הנתונים הפיננסיים לא מראים חוב פתוח, וגם ההתכתבות (אם קיימת) מעולם לא ביססה חוב כזה. הטיפול בלקוח יסתיים בשקט — לא תישלח אליו שום הודעה. השאר את כל שדות ההודעה ואת \`send_at\` כ-null.

2. **\`paid\`:** החוב נגבה. בחר בערך זה כאשר:
- הלקוח אישר בבירור בהתכתבות ששילם (אישור מילולי ברור מספיק; קובץ אסמכתה — קבלה, צילום העברה — שה-content analysis שלו תואם את החוב מחזק את הקביעה), או
- הנתונים הפיננסיים הראו חוב במהלך הגבייה וכעת הם נקיים — רואה החשבון עדכן אותם לאחר שהתשלום התקבל. שים לב: במצב כזה ההחלטה היא \`paid\` ולא \`no_debt\` — הגבייה הצליחה.
אם הלקוח טוען ששילם אבל האסמכתה שצירף אינה תואמת (סכום שגוי, לא קריאה) או שאין שום תימוכין — אל תבחר \`paid\`; המשך ב-\`follow_up\` ובקש בנימוס אסמכתה ברורה. השאר את שדות ההודעה ואת \`send_at\` כ-null.

3. **\`follow_up\`:** קיים חוב פתוח שטרם נגבה. מלא את \`email_subject\` (אם כבר קיימת התכתבות, שמור על נושא השרשור הקיים, למשל "Re: ..."), את \`email_body\` ואת \`send_at\`.

**ניסוח ההודעה (\`email_body\`):**
- כתוב בעברית, בטון חברי, חם ומכבד — כמו אסיסטנט נעים ואנושי במשרד, לא כמו מכתב גבייה משפטי. מקצועי ותמציתי, בשפה יומיומית וטבעית. הימנע מניסוחים מאיימים או נוקשים; העדף "היי", "רק רציתי להזכיר", "אשמח אם תוכל להסדיר". אם הלקוח כותב באופן עקבי בשפה אחרת — השב בשפה שלו.
- אם זו ההודעה הראשונה בשרשור: הצג בקצרה את הפנייה מטעם משרדו של רואה החשבון, ציין את סכום החוב ואת סיבתו (כפי שחולצו מהנתונים), ובקש להסדיר את התשלום. בקש מהלקוח להשיב עם אישור תשלום (קבלה או צילום העברה) לאחר ששילם.
- אחרת: הזכר בנימוס את החוב הפתוח, התייחס למה שהלקוח כתב, ובקש שוב אישור תשלום. אל תהיה חזרתי ואל תציק יותר מדי.
- אם הלקוח שאל שאלה: ענה בקצרה על שאלות טכניות ולוגיסטיות (כמה לשלם, על מה החוב, איך מאשרים). לגבי אופן התשלום עצמו — הפנה את הלקוח להסדיר מול המשרד בדרך המקובלת עליו. על שאלות מקצועיות בענייני מס השב שרואה החשבון יחזור אליו — לעולם אל תיתן ייעוץ מס בעצמך.
- אם הלקוח חולק על החוב או מסרב לשלם באופן עקבי — אל תתווכח ואל תאיים; כתוב שהנושא יועבר לרואה החשבון להמשך טיפול.

**קביעת \`send_at\`:**
בחר את מועד השליחה בשיקול דעת של אסיסטנט אנושי מנוסה, לא לפי לוח זמנים קבוע. המטרה: לגבות את החוב מהר ככל האפשר, תוך התנהגות מתחשבת ומקצועית. שקלל את הגורמים הבאים:
- **מומנטום:** לקוח שכתב זה עתה נמצא כרגע מול המייל — זה הרגע שבו הכי קל לו לפעול. שאף להשיב בעודו שם. יחד עם זאת, קרא את המצב: אם מהשיחה עולה שללקוח נוח אחרת (למשל שביקש זמן לסוף החודש), התאם את המועד לצרכיו.
- **התחשבות:** תזכורת יזומה, כשהלקוח שותק, היא כן הפרעה — שלח אותה רק בשעות העבודה המקובלות בימי עבודה (בישראל: ראשון-חמישי), לא בערב ולא בסוף שבוע.
- **עייפות מתזכורות:** ככל שנשלחו כבר יותר תזכורות ללא מענה, המתן יותר בין אחת לבאה — החל מכ-3 ימים והתארך בהדרגה לשבוע-שבועיים. שים לב איך הלקוח הגיב עד כה.
- **הבטחות:** אם הלקוח הבטיח לשלם עד מועד מסוים (למשל "אעביר בסוף השבוע") — אל תציק לפני כן; תזמן לזמן קצר אחרי המועד המובטח.
- **דפוסי הלקוח:** חותמות הזמן בשרשור מלמדות מתי הלקוח בדרך כלל כותב וזמין — העדף שעות שבהן הוא פעיל.
מגבלות קשיחות (תמיד): לעולם לא בין 23:00 ל-07:30 בזמן המקומי של רואה החשבון. בין 22:00 ל-23:00 מותר לשלוח רק תשובה ללקוח שכתב בשעה האחרונה — תזכורת יזומה לעולם לא תישלח אחרי 22:00. המועד חייב להיות בפורמט "YYYY-MM-DD HH:MM" בזמן המקומי של רואה החשבון (אזור זמן ${env.ACCOUNTANT_TIMEZONE}) ומאוחר מהשעה המקומית הנוכחית המצוינת למטה.

תאריך ושעה נוכחיים (UTC): ${now.toISOString()}
תאריך ושעה מקומיים אצל רואה החשבון (${env.ACCOUNTANT_TIMEZONE}): ${formatLocalDateTime(now, env.ACCOUNTANT_TIMEZONE)}
זמן שעבר מההודעה האחרונה: ${sinceLast}

השב **אך ורק** באמצעות סכמת ה-JSON שסופקה לך.
תמיד כלול שדה \`reasoning\` עם הסבר קצר (לשימוש פנימי בלבד, לא יוצג ללקוח).`;
}

/** The client's matched financial rows, labeled per source, as the prompt consumes them. */
export function buildFinancialDataSection(data: DebtData): string {
  const blocks: string[] = [];
  for (const board of data.boardRows) {
    const rows =
      board.rows.length === 0
        ? '(no rows matched this client in this board)'
        : board.rows.map((row, i) => formatRow(row, i)).join('\n');
    blocks.push(`source: monday board "${board.boardName}"\n${rows}`);
  }
  for (const sheet of data.sheetRows) {
    const rows =
      sheet.rows.length === 0
        ? '(no rows matched this client in this sheet)'
        : sheet.rows.map((row, i) => formatRow(row, i)).join('\n');
    blocks.push(`source: spreadsheet tab "${sheet.sheetName}"\n${rows}`);
  }
  if (data.failedSources.length > 0) {
    blocks.push(
      `NOTE: the following configured sources could not be read right now (do not treat their absence as "no debt"): ${data.failedSources.join(', ')}`,
    );
  }
  return `--- CLIENT FINANCIAL DATA (fetched live, matched by the client's email) ---\n${blocks.join('\n\n')}\n--- END FINANCIAL DATA ---`;
}

function formatRow(row: Record<string, string>, index: number): string {
  const cells = Object.entries(row)
    .map(([header, value]) => `${header}: ${value}`)
    .join(' | ');
  return `[row ${index + 1}] ${cells}`;
}

/**
 * One-line verdict from the ingestion-time content analysis, shown under the
 * file in the transcript. Local trimmed variant of the doc collector's: no
 * required-document matching (receipts match a debt, not a document list).
 */
function formatFileAnalysis(file: DocumentFileRow): string {
  if (file.analysis_status !== 'done' || !file.analysis) {
    const reason =
      file.analysis_status === 'unsupported'
        ? 'file type/size not analyzable'
        : file.analysis_status === 'failed'
          ? 'analysis failed'
          : 'not analyzed yet';
    return `content analysis: unavailable (${reason}) — judge this file from the email context only`;
  }
  const a = file.analysis;
  const parts = [
    `verified content: ${a.document_kind}`,
    a.subject_name ? `subject: ${a.subject_name}` : null,
    a.legible ? null : 'NOT LEGIBLE',
    `confidence: ${a.confidence}`,
    a.summary,
  ].filter((p): p is string => p !== null);
  return `content analysis (from the file's actual contents): ${parts.join(' | ')}`;
}

function buildThreadTranscript(history: EmailRow[], files: DocumentFileRow[]): string {
  if (history.length === 0) {
    return '--- MESSAGE THREAD (chronological) ---\n(no messages yet)\n--- END THREAD ---\n\nDecide the next action now.';
  }
  const filesByEmail = new Map<string, DocumentFileRow[]>();
  for (const file of files) {
    if (!file.email_id) continue;
    const list = filesByEmail.get(file.email_id) ?? [];
    list.push(file);
    filesByEmail.set(file.email_id, list);
  }
  const lines = history.map((email, i) => {
    const timestamp = (email.sent_at ?? email.created_at).toISOString();
    const from = email.direction === 'outbound' ? 'accountant (outbound)' : 'client (inbound)';
    const attached = (filesByEmail.get(email.id) ?? [])
      .map(
        (f) =>
          `  - [file id: ${f.id}] ${f.filename} (${f.content_type}, ${f.size_bytes} bytes)\n    ${formatFileAnalysis(f)}`,
      )
      .join('\n');
    const attachments = attached ? `\nAttachments received and stored:\n${attached}` : '';
    const subject = email.channel === 'email' ? ` | Subject: ${email.subject}` : '';
    return `[#${i + 1}] ${timestamp} | via: ${email.channel} | FROM: ${from}${subject}\n${email.body}${attachments}`;
  });
  return `--- MESSAGE THREAD (chronological) ---\n${lines.join('\n\n')}\n--- END THREAD ---\n\nDecide the next action now.`;
}

export interface Prompt {
  systemInstruction: string;
  contents: string;
}

export function buildPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  data: DebtData,
  history: EmailRow[],
  files: DocumentFileRow[],
  now: Date,
): Prompt {
  return {
    systemInstruction: buildSystemPrompt(client, accountant, history, now),
    contents: [buildFinancialDataSection(data), buildThreadTranscript(history, files)].join('\n\n'),
  };
}
