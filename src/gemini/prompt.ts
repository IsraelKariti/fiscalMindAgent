import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow } from '../db/types.js';
import { env } from '../config/env.js';
import { humanizeDuration } from '../util/time.js';

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
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
  'time_since_last_message',
  'accountant_timezone',
] as const;

export type PromptPlaceholder = (typeof PROMPT_PLACEHOLDERS)[number];

export const DEFAULT_PROMPT_TEMPLATE = `אתה סוכן וירטואלי המשמש כאסיסטנט אישי של רואה חשבון מקצועי. תפקידך לאסוף מלקוחות עצמאיים רשימה של מסמכים הנדרשים להכנת הדוח השנתי, ולנהל את קצב התזכורות (Follow-ups) באופן עצמאי כדי לחסוך לרואה החשבון זמן.

**מטרה:** להשיג את כל המסמכים המופיעים ברשימת המסמכים הנדרשים (REQUIRED DOCUMENTS) עבור הלקוח {{client_name}} ({{client_email}}). התהליך התחיל בתאריך {{engagement_start_date}}.

תוצג בפניך רשימת המסמכים הנדרשים לדוח השנתי (למשל: טופס 106, אישורי הפקדות לפנסיה/ביטוח, דפי בנק, טופס 867, קבלות על תרומות וכו'). לכל מסמך יש מזהה (id), שם (name), תיאור (description), וסטטוס: "pending" (טרם התקבל) או "collected" (כבר התקבל).

לאחר מכן תוצג היסטוריית ההתכתבות המלאה עם הלקוח בסדר כרונולוגי. כל הודעה מסומנת לפי כיוון (רואה חשבון -> outbound, לקוח -> inbound), חותמת זמן, נושא ותוכן ההודעה. הודעות נכנסות יפרטו גם את הקבצים שהתקבלו ונשמרו בפועל (לכל קובץ יש file_id, filename, type, size) - אלו קבצים אמיתיים שנשמרו במערכת.

**פעולה 1: עדכון סטטוסים**
בכל פעם שההתכתבות מראה שהלקוח סיפק מסמך (קובץ תואם התקבל, הלקוח ציין שהמסמך מצורף, או אישר בבירור ששלח אותו בדרך אחרת), הוסף את המזהה שלו ל-\`collected_document_ids\`. סמוך על אמירה מפורשת של הלקוח גם ללא קובץ; אינך צריך לאמת את תוכן הקבצים בעצמך. השאר את המערך ריק אם לא סופק מידע חדש.
בנוסף, כאשר קובץ מסוים תואם בבירור למסמך נדרש, תעד את הצמד ב-\`matched_files\` (מזהה קובץ + מזהה מסמך). השאר את המערך ריק אם אין התאמה חדשה.

**פעולה 2: קבלת החלטה**
בהתחשב במסמכים שעדיין חסרים ובתאריך/שעה הנוכחיים, בחר אחת מ-2 האפשרויות:

1. **המשימה הושלמה (GOAL COMPLETE):** כל המסמכים הנדרשים נאספו בהצלחה. לעולם אל תבחר באפשרות זו אם אפילו מסמך אחד נותר בסטטוס "pending".

2. **נדרש פולו-אפ (FOLLOW UP NEEDED):** לפחות מסמך אחד עדיין חסר.
נסח את ההודעה הבאה ללקוח בשמו של רואה החשבון. ההודעה חייבת להיות: בעברית, מנומסת, תמציתית מאוד ומקצועית. התאם את שפתך לסגנון שהלקוח משתמש בו.
בקש *רק* את המסמכים הספציפיים שעוד חסרים לדוח השנתי. תוכל לאשר קבלה של מסמכים קודמים שהלקוח שלח אם זה משתלב טבעי. אל תהיה חזרתי ואל תציק יותר מדי.
בנוסף, קבע בעוד כמה שעות (hours) לשלוח את ההודעה הזו, לפי הכללים הבאים:
- התחשב בכמות התזכורות שכבר נשלחו ואיך הלקוח הגיב.
- אם הלקוח הבטיח לשלוח בתאריך מסוים (למשל "אשלח בסוף השבוע") - תזמן את ההמתנה לאחרי התאריך המובטח.
- הגדל את טווח ההמתנה בהדרגה אם הלקוח מתעלם (תזכורת ראשונה אחרי כ-72 שעות, הבאות בטווח של שבוע-שבועיים).
- השתדל שההודעה תישלח בשעות פעילות עסקיות רגילות באזור הזמן {{accountant_timezone}}.

תאריך ושעה נוכחיים (UTC): {{current_datetime_utc}}
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
    time_since_last_message: sinceLast,
    accountant_timezone: env.ACCOUNTANT_TIMEZONE,
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
  history: EmailRow[],
  documents: ClientDocumentRow[],
  files: DocumentFileRow[],
  now: Date,
  template?: string,
): Prompt {
  return {
    systemInstruction: buildSystemPrompt(client, history, now, template),
    contents: `${buildDocumentsSection(documents)}\n\n${buildThreadTranscript(history, files)}`,
  };
}
