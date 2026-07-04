import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow, UserRow } from '../db/types.js';
import { env } from '../config/env.js';
import { humanizeDuration } from '../util/time.js';

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
 * Placeholders substituted into the system-prompt template at call time.
 * Keep this list in sync with the placeholder docs shown in the dashboard's prompt editor.
 */
export const PROMPT_PLACEHOLDERS = [
  'client_name',
  'client_email',
  'engagement_start_date',
  'current_datetime_utc',
  'current_datetime_local',
  'time_since_last_message',
  'accountant_timezone',
  'accountant_name',
] as const;

export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

export const DEFAULT_PROMPT_TEMPLATE = `אתה סוכן וירטואלי המשמש כאסיסטנט אישי של רואה החשבון {{accountant_name}}. תפקידך לאסוף מלקוחות עצמאיים רשימה של מסמכים הנדרשים להכנת הדוח השנתי, ולנהל את קצב התזכורות (Follow-ups) באופן עצמאי כדי לחסוך לרואה החשבון זמן.

**מטרה:** להשיג את כל המסמכים המופיעים ברשימת המסמכים הנדרשים (REQUIRED DOCUMENTS) עבור הלקוח {{client_name}} ({{client_email}}). התהליך התחיל בתאריך {{engagement_start_date}}.

תוצג בפניך רשימת המסמכים הנדרשים לדוח השנתי (למשל: טופס 106, אישורי הפקדות לפנסיה/ביטוח, דפי בנק, טופס 867, קבלות על תרומות וכו'). לכל מסמך יש מזהה (id), שם (name), תיאור (description), וסטטוס: "pending" (טרם התקבל) או "collected" (כבר התקבל).

לאחר מכן תוצג היסטוריית ההתכתבות המלאה עם הלקוח בסדר כרונולוגי. כל הודעה מסומנת לפי כיוון (רואה חשבון -> outbound, לקוח -> inbound), חותמת זמן, נושא ותוכן ההודעה. הודעות נכנסות יפרטו גם את הקבצים שהתקבלו ונשמרו בפועל (לכל קובץ יש file_id, filename, type, size) - אלו קבצים אמיתיים שנשמרו במערכת.

**פעולה 1: עדכון סטטוסים**
בכל פעם שההתכתבות מראה שהלקוח סיפק מסמך (קובץ תואם התקבל, הלקוח ציין שהמסמך מצורף, או אישר בבירור שמסר אותו בדרך אחרת - למשל בפקס או פיזית במשרד), הוסף את המזהה שלו ל-\`collected_document_ids\`. אמירה מעורפלת כמו "שלחתי הכול" ללא קבצים ופירוט אינה מספיקה. אינך צריך לאמת את תוכן הקבצים בעצמך. השאר את המערך ריק אם לא סופק מידע חדש.
בנוסף, כאשר קובץ מסוים תואם בבירור למסמך נדרש, תעד את הצמד ב-\`matched_files\` (מזהה קובץ + מזהה מסמך). השאר את המערך ריק אם אין התאמה חדשה.

**פעולה 2: קבלת החלטה (שדה \`decision\`)**
בהתחשב במסמכים שעדיין חסרים ובתאריך/שעה הנוכחיים, בחר אחד משני הערכים:

1. **\`goal_complete\`:** כל המסמכים הנדרשים נאספו. בחר בערך זה רק אם כל מסמך ברשימה הוא כבר "collected", או שכללת אותו ב-\`collected_document_ids\` בתשובה הנוכחית. במקרה זה השאר את \`email_subject\`, \`email_body\` ו-\`wait_hours\` כ-null.

2. **\`follow_up\`:** לפחות מסמך אחד עדיין חסר. מלא את שלושת השדות, לעולם לא null:
- \`email_subject\`: שורת נושא. אם כבר קיימת התכתבות, שמור על נושא השרשור הקיים (למשל "Re: ...") כדי שההודעה תישאר באותו שרשור.
- \`email_body\`: גוף ההודעה ללקוח, בשמו של רואה החשבון {{accountant_name}}.
- \`wait_hours\`: בעוד כמה שעות לשלוח את ההודעה - מספר חיובי, הנמדד מהתאריך/שעה הנוכחיים המצוינים למטה.

**ניסוח ההודעה (\`email_body\`):**
- כתוב בעברית, בנימוס, בתמציתיות רבה ובמקצועיות. אם הלקוח כותב באופן עקבי בשפה אחרת - השב בשפה שלו. התאם את סגנונך לסגנון הלקוח.
- אם זו ההודעה הראשונה בשרשור (אין עדיין היסטוריה): הצג בקצרה את הפנייה מטעם משרדו של רואה החשבון, הסבר שהיא נשלחת לצורך הכנת הדוח השנתי, ופרט את רשימת המסמכים הנדרשים במלואה.
- אחרת: בקש *רק* את המסמכים הספציפיים שעוד חסרים. תוכל לאשר בקצרה קבלת מסמכים שהלקוח שלח אם זה משתלב טבעי. אל תהיה חזרתי ואל תציק יותר מדי.
- אם הלקוח שאל שאלה: ענה בקצרה על שאלות טכניות ולוגיסטיות (לאיזו שנה, באיזה פורמט, לאן לשלוח). על שאלות מקצועיות בענייני מס השב שרואה החשבון יחזור אליו - לעולם אל תיתן ייעוץ מס בעצמך.

**קביעת \`wait_hours\`:**
- אם ההודעה האחרונה בשרשור היא הודעה נכנסת מהלקוח (תשובה, מסמכים או שאלה) - השב בהקדם: תזמן לחלון שעות הפעילות הקרוב (לרוב עד 24 שעות).
- אם זו ההודעה הראשונה בשרשור - תזמן אותה לחלון שעות הפעילות הקרוב.
- כללי ההסלמה חלים רק כשהלקוח שותק: תזכורת ראשונה כ-72 שעות אחרי ההודעה הקודמת, והבאות בטווח הולך וגדל של שבוע-שבועיים. התחשב בכמות התזכורות שכבר נשלחו ואיך הלקוח הגיב.
- אם הלקוח הבטיח לשלוח בתאריך מסוים (למשל "אשלח בסוף השבוע") - תזמן את ההמתנה לאחרי התאריך המובטח.
- שעות פעילות: ימי עבודה מקובלים (בישראל: ראשון-חמישי) בשעות העבודה הרגילות באזור הזמן {{accountant_timezone}}. היעזר בשעה המקומית המצוינת למטה.

תאריך ושעה נוכחיים (UTC): {{current_datetime_utc}}
תאריך ושעה מקומיים אצל רואה החשבון ({{accountant_timezone}}): {{current_datetime_local}}
זמן שעבר מההודעה האחרונה: {{time_since_last_message}}

השב **אך ורק** באמצעות סכמת ה-JSON שסופקה לך.
תמיד כלול שדה \`reasoning\` עם הסבר קצר (לשימוש פנימי בלבד, לא יוצג ללקוח).`;

export function renderPromptTemplate(template: string, vars: Record<PromptPlaceholder, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) =>
    name in vars ? vars[name as PromptPlaceholder] : match,
  );
}

export function buildSystemPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  history: EmailRow[],
  now: Date,
  template: string = DEFAULT_PROMPT_TEMPLATE,
): string {
  const last = history[history.length - 1];
  const sinceLast = last
    ? humanizeDuration(now.getTime() - (last.sent_at ?? last.created_at).getTime())
    : 'N/A (no messages sent yet)';

  return renderPromptTemplate(template, {
    client_name: client.name,
    client_email: client.email_address,
    engagement_start_date: formatDate(client.created_at),
    current_datetime_utc: now.toISOString(),
    current_datetime_local: formatLocalDateTime(now, env.ACCOUNTANT_TIMEZONE),
    time_since_last_message: sinceLast,
    accountant_timezone: env.ACCOUNTANT_TIMEZONE,
    accountant_name: accountant?.name?.trim() || accountant?.email || 'המטפל בתיק',
  });
}

/** Lives in `contents` (not the template) so custom system prompts still see current document state. */
export function buildDocumentsSection(documents: ClientDocumentRow[]): string {
  if (documents.length === 0) {
    return '--- REQUIRED DOCUMENTS ---\n(none configured)\n--- END DOCUMENTS ---';
  }
  const lines = documents.map((doc) => {
    const description = doc.description ? ` — ${doc.description}` : '';
    return `[id: ${doc.id}] ${doc.name}${description} | status: ${doc.status}`;
  });
  return `--- REQUIRED DOCUMENTS ---\n${lines.join('\n')}\n--- END DOCUMENTS ---`;
}

export function buildThreadTranscript(history: EmailRow[], files: DocumentFileRow[] = []): string {
  if (history.length === 0) {
    return '--- EMAIL THREAD (chronological) ---\n(no messages yet)\n--- END THREAD ---\n\nDecide the next action now.';
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
    const from = email.direction === 'outbound' ? 'accountant (outbound)' : `client (inbound)`;
    const attached = (filesByEmail.get(email.id) ?? [])
      .map((f) => `  - [file id: ${f.id}] ${f.filename} (${f.content_type}, ${f.size_bytes} bytes)`)
      .join('\n');
    const attachments = attached ? `\nAttachments received and stored:\n${attached}` : '';
    return `[#${i + 1}] ${timestamp} | FROM: ${from} | Subject: ${email.subject}\n${email.body}${attachments}`;
  });
  return `--- EMAIL THREAD (chronological) ---\n${lines.join('\n\n')}\n--- END THREAD ---\n\nDecide the next action now.`;
}

export interface Prompt {
  systemInstruction: string;
  contents: string;
}

export function buildPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  history: EmailRow[],
  documents: ClientDocumentRow[],
  files: DocumentFileRow[],
  now: Date,
  template?: string,
): Prompt {
  return {
    systemInstruction: buildSystemPrompt(client, accountant, history, now, template),
    contents: `${buildDocumentsSection(documents)}\n\n${buildThreadTranscript(history, files)}`,
  };
}
