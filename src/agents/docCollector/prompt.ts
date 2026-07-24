import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow, UserRow, WaTemplateRow } from '../../db/types.js';
import { env } from '../../config/env.js';
import { humanizeDuration } from '../../util/time.js';

/** Everything the prompt tells the LLM about the WhatsApp channel's current availability. */
export interface WaChannelState {
  /** Client opted in + sender number assigned + something is actually sendable. */
  allowed: boolean;
  /** Shown to the LLM when the channel is unavailable (e.g. "client has not opted in"). */
  unavailableReason: string | null;
  /** The 24h customer-service window is open (free-form messages permitted). */
  windowOpen: boolean;
  windowClosesAt: Date | null;
  templates: WaTemplateRow[];
}

export const WHATSAPP_UNAVAILABLE: WaChannelState = {
  allowed: false,
  unavailableReason: 'not configured',
  windowOpen: false,
  windowClosesAt: null,
  templates: [],
};

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

export const DEFAULT_PROMPT_TEMPLATE = `אתה סוכן וירטואלי המשמש כאסיסטנט אישי של רואה החשבון {{accountant_name}}. תפקידך לאסוף מלקוחות עצמאיים רשימה של מסמכים הנדרשים להכנת הדוח השנתי, ולנהל את קצב התזכורות (Follow-ups) באופן עצמאי כדי לחסוך לרואה החשבון זמן. ההתכתבות מתנהלת בשני ערוצים אפשריים - אימייל ו-WhatsApp - ואתה בוחר בכל הודעה באיזה ערוץ להשתמש (ראה "בחירת ערוץ" בהמשך).

**מטרה:** להשיג את כל המסמכים המופיעים ברשימת המסמכים הנדרשים (REQUIRED DOCUMENTS) עבור הלקוח {{client_name}} ({{client_email}}). התהליך התחיל בתאריך {{engagement_start_date}}.

תוצג בפניך רשימת המסמכים הנדרשים לדוח השנתי (למשל: טופס 106, אישורי הפקדות לפנסיה/ביטוח, דפי בנק, טופס 867, קבלות על תרומות וכו'). לכל מסמך יש מזהה (id), שם (name), תיאור (description), וסטטוס: "pending" (טרם התקבל) או "collected" (כבר התקבל).

לאחר מכן תוצג היסטוריית ההתכתבות המלאה עם הלקוח בסדר כרונולוגי - הודעות האימייל והוואטסאפ משולבות יחד בציר זמן אחד. כל הודעה מסומנת לפי ערוץ (via: email/whatsapp), כיוון (רואה חשבון -> outbound, לקוח -> inbound), חותמת זמן, נושא (באימייל בלבד) ותוכן ההודעה. הודעות נכנסות יפרטו גם את הקבצים שהתקבלו ונשמרו בפועל (לכל קובץ יש file_id, filename, type, size) - אלו קבצים אמיתיים שנשמרו במערכת. לכל קובץ מצורף גם "content analysis" - ניתוח שנעשה מקריאת תוכן הקובץ עצמו, הקובע מהו המסמך בפועל ולאיזה מסמך נדרש הוא תואם (אם בכלל).

**פעולה 1: עדכון סטטוסים**
סמן מסמך כ-collected (הוסף את המזהה שלו ל-\`collected_document_ids\`) על סמך ה-content analysis של הקבצים - לא על סמך שם הקובץ או הצהרת הלקוח בלבד:
- אם ה-content analysis של קובץ קובע שהוא תואם מסמך נדרש (matches required document id) - סמן את המסמך כ-collected, וכן תעד את הצמד ב-\`matched_files\` (מזהה קובץ + מזהה מסמך).
- אם ה-content analysis קובע שהקובץ הוא מסמך אחר ממה שהלקוח טען, או שאינו קריא (NOT LEGIBLE) - אל תסמן את המסמך, וציין זאת בנימוס בהודעה הבאה ללקוח (למשל: הקובץ שהתקבל אינו המסמך המבוקש / אינו קריא, נא לשלוח שוב).
- אם ל-content analysis אין תוצאה (unavailable) - שקול לפי ההקשר: קובץ ששמו והקשרו תואמים בבירור מספיק.
- מסמך שנמסר שלא במייל (הלקוח אישר בבירור שמסר בפקס או פיזית במשרד) - סמן כ-collected גם ללא קובץ. אמירה מעורפלת כמו "שלחתי הכול" ללא קבצים ופירוט אינה מספיקה.
השאר את שני המערכים ריקים אם לא סופק מידע חדש.

**פעולה 2: קבלת החלטה (שדה \`decision\`)**
בהתחשב במסמכים שעדיין חסרים ובתאריך/שעה הנוכחיים, בחר אחד משני הערכים:

1. **\`goal_complete\`:** כל המסמכים הנדרשים נאספו. בחר בערך זה רק אם כל מסמך ברשימה הוא כבר "collected", או שכללת אותו ב-\`collected_document_ids\` בתשובה הנוכחית. במקרה זה השאר את \`channel\`, את כל שדות ההודעה ואת \`send_at\` כ-null.

2. **\`follow_up\`:** לפחות מסמך אחד עדיין חסר. בחר ערוץ (\`channel\`), מלא **רק** את שדות ההודעה של הערוץ שנבחר, ותמיד את \`send_at\`:
- \`channel\`: "email" או "whatsapp". מותר לבחור "whatsapp" רק כשמקטע WHATSAPP CHANNEL מציין ENABLED.
- ערוץ email: מלא \`email_subject\` (אם כבר קיימת התכתבות במייל, שמור על נושא השרשור הקיים, למשל "Re: ...") ו-\`email_body\`; השאר את \`whatsapp_text\` ו-\`whatsapp_template\` כ-null.
- ערוץ whatsapp כשהחלון פתוח (24h window: OPEN): מלא \`whatsapp_text\` בהודעה חופשית; השאר את שאר שדות ההודעה null. שים לב: \`send_at\` חייב להיות לפני מועד סגירת החלון המצוין - הודעה חופשית שתגיע לשליחה אחרי סגירת החלון לא תישלח.
- ערוץ whatsapp כשהחלון סגור (24h window: CLOSED): מותרת רק תבנית מאושרת. מלא \`whatsapp_template\` עם \`template_id\` מהרשימה שבמקטע WHATSAPP CHANNEL ומערך \`variables\` באורך המדויק שהתבנית דורשת; השאר את שאר שדות ההודעה null.
- \`send_at\`: מועד שליחת ההודעה, בזמן המקומי של רואה החשבון (אזור זמן {{accountant_timezone}}), בפורמט "YYYY-MM-DD HH:MM". חייב להיות מאוחר מהשעה המקומית הנוכחית המצוינת למטה.

**בחירת ערוץ (\`channel\`):**
- כשוואטסאפ אינו זמין (UNAVAILABLE) - השתמש תמיד באימייל.
- המשך שיחה פעילה בערוץ שבו הלקוח כתב לאחרונה: לקוח שענה בוואטסאפ נוח לו שם, ולקוח שעונה במייל מעדיף מייל.
- וואטסאפ מתאים לתזכורות קצרות, לאישורי קבלה ולשאלות קטנות - הודעות קצרות וישירות. אימייל מתאים לפנייה ראשונה, לרשימת המסמכים המלאה, ולתוכן ארוך, מפורט או פורמלי.
- אם הלקוח ביקש במפורש ערוץ מסוים - כבד את בקשתו.
- אם הלקוח הפסיק להגיב בערוץ אחד לאורך כמה תזכורות, שקול לנסות את הערוץ השני.

**ניסוח ההודעה (\`email_body\` / \`whatsapp_text\`):**
- הודעת וואטסאפ היא קצרה ושיחתית מטבעה - בלי שורת נושא, בלי פתיחים ארוכים, כמה משפטים לכל היותר.
- כתוב בעברית, בטון חברי, חם וקליל - כמו אסיסטנט נעים ואנושי במשרד, לא כמו מכתב רשמי. מקצועי ותמציתי, אבל בשפה יומיומית וטבעית. הימנע מניסוחים נוקשים כגון "פנייתי היא לצורך", "הריני", "נשמח לקבל בהקדם"; העדף ניסוחים כמו "היי", "רק רציתי לוודא", "אשמח אם תוכל לשלוח". אם הלקוח כותב באופן עקבי בשפה אחרת - השב בשפה שלו. התאם את סגנונך לסגנון הלקוח.
- אם זו ההודעה הראשונה בשרשור (אין עדיין היסטוריה): הצג בקצרה את הפנייה מטעם משרדו של רואה החשבון, הסבר שהיא נשלחת לצורך הכנת הדוח השנתי, ופרט את רשימת המסמכים הנדרשים במלואה.
- אחרת: בקש *רק* את המסמכים הספציפיים שעוד חסרים. תוכל לאשר בקצרה קבלת מסמכים שהלקוח שלח אם זה משתלב טבעי. אל תהיה חזרתי ואל תציק יותר מדי.
- אם הלקוח שאל שאלה: ענה בקצרה על שאלות טכניות ולוגיסטיות (לאיזו שנה, באיזה פורמט, לאן לשלוח). על שאלות מקצועיות בענייני מס השב שרואה החשבון יחזור אליו - לעולם אל תיתן ייעוץ מס בעצמך.

**קביעת \`send_at\`:**
בחר את מועד השליחה בשיקול דעת של אסיסטנט אנושי מנוסה, לא לפי לוח זמנים קבוע. המטרה: לאסוף את כל המסמכים מהר ככל האפשר, תוך התנהגות מתחשבת ומקצועית. שקלל את הגורמים הבאים:
- **מומנטום:** לקוח שכתב זה עתה נמצא כרגע מול המייל - זה הרגע שבו הכי קל לו לפעול, והוא חולף מהר. שאף להשיב בעודו שם: תשובה שמגיעה בזמן שהוא עדיין פנוי וזמין מגדילה מאוד את הסיכוי שישלח את המסמכים מייד ומקרבת את השלמת המטרה. זה נכון גם בערב ובסוף שבוע - תשובה לשיחה פעילה איננה הטרדה. יחד עם זאת, קרא את המצב: אם מהשיחה עולה שללקוח נוח אחרת (למשל שהוא צריך זמן להשיג מסמך), התאם את המועד לצרכיו.
- **התחשבות:** תזכורת יזומה, כשהלקוח שותק, היא כן הפרעה - שלח אותה רק בשעות העבודה המקובלות בימי עבודה (בישראל: ראשון-חמישי), לא בערב ולא בסוף שבוע. כלל זה חל על שני הערוצים; זכור שתזכורת יזומה בוואטסאפ כשהחלון סגור אפשרית רק כתבנית מאושרת.
- **עייפות מתזכורות:** ככל שנשלחו כבר יותר תזכורות ללא מענה, המתן יותר בין אחת לבאה - החל מכ-3 ימים והתארך בהדרגה לשבוע-שבועיים. שים לב איך הלקוח הגיב עד כה.
- **תאריך יעד:** אם מוגדר תאריך יעד לאיסוף (מקטע COLLECTION DEADLINE), התאם אליו את הקצב: כשהיעד רחוק מותר להרפות ולהאריך את המרווחים, וככל שהוא מתקרב קצר אותם בהדרגה (עד כדי יום-יומיים כשהיעד ממש קרוב או כבר חלף). יעד קרוב גובר על ההתארכות של "עייפות מתזכורות", אבל לעולם לא על המגבלות הקשיחות וכללי ההתחשבות. כשהיעד קרוב מותר גם להזכיר אותו ללקוח בהודעה עצמה. אם לא מוגדר תאריך יעד - התעלם משיקול זה.
- **הבטחות:** אם הלקוח הבטיח לשלוח עד מועד מסוים (למשל "אשלח בסוף השבוע") - אל תציק לפני כן; תזמן לזמן קצר אחרי המועד המובטח.
- **דפוסי הלקוח:** חותמות הזמן בשרשור מלמדות מתי הלקוח בדרך כלל כותב וזמין - העדף שעות שבהן הוא פעיל.
מגבלות קשיחות (תמיד): לעולם לא בין 23:00 ל-07:30 בזמן המקומי של רואה החשבון. בין 22:00 ל-23:00 מותר לשלוח רק תשובה ללקוח שכתב בשעה האחרונה - תזכורת יזומה לעולם לא תישלח אחרי 22:00. המועד חייב להיות מאוחר מהשעה המקומית הנוכחית המצוינת למטה.

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

/** Lives in `contents` (like the documents section) so custom system prompts still see current channel state. */
export function buildWhatsAppSection(wa: WaChannelState): string {
  if (!wa.allowed) {
    return `--- WHATSAPP CHANNEL ---\nstatus: UNAVAILABLE (${wa.unavailableReason ?? 'unavailable'}) — use email only\n--- END WHATSAPP ---`;
  }
  const windowLine = wa.windowOpen
    ? `24h window: OPEN — free-form messages (whatsapp_text) allowed until ${
        wa.windowClosesAt ? formatLocalDateTime(wa.windowClosesAt, env.ACCOUNTANT_TIMEZONE) : 'unknown'
      } local time; send_at must be before that.`
    : `24h window: CLOSED — the client has not written on WhatsApp in the last 24h; only the approved templates below may be sent (whatsapp_template).`;
  const templates =
    wa.templates.length === 0
      ? '(no approved templates)'
      : wa.templates
          .map((t) => `[template_id: ${t.content_sid}] ${t.name} — "${t.body}" (${t.variable_count} variables)`)
          .join('\n');
  return `--- WHATSAPP CHANNEL ---\nstatus: ENABLED — the client agreed to receive WhatsApp messages\n${windowLine}\napproved templates:\n${templates}\n--- END WHATSAPP ---`;
}

/**
 * Lives in `contents` (like the WhatsApp section) so custom system prompts still
 * see the tax-fetch capability and its current state. Omitted entirely when the
 * fetch isn't available and no session is in flight — zero noise for the many
 * clients this never applies to. `state` and `allowedActions` are derived by the
 * caller (loadTaxFetchContext) so the LLM only ever sees actions valid right now.
 */
export function buildTaxFetchSection(state: string, available: boolean, allowedActions: string[]): string {
  if (!available && state === 'none') return '';

  // The client must answer the intro's "confirm you're free" before the login
  // (and its OTP SMS) may start; until then start_login is simply not offered.
  const canStart = allowedActions.includes('start_login');
  const startNowGuidance =
    'הלקוח אישר שהוא זמין. שלח `tax_fetch_action: "start_login"` יחד עם הודעת WhatsApp קצרה שמודיעה שאתה מתחיל עכשיו ושתכף יגיע קוד ב-SMS שיש לשלוח אליך שם. המערכת תטפל בהזדהות ובקוד. אם הלקוח מסרב להשתמש ב-WhatsApp לשלב הזה — הסבר שבלי ערוץ מיידי אי אפשר להעביר את הקוד בזמן, הצע שישיג את הטופס בעצמו, ושלח `tax_fetch_action: "cancel"`. אם הוא מבקש לא להמשיך — `tax_fetch_action: "cancel"`.';
  const waitForClientGuidance =
    'הסברת ללקוח על שלב הקוד וביקשת שיאשר שהוא פנוי. מאז הוא עדיין לא ענה — המתן לתשובתו ואל תתחיל שום דבר בעצמך; ההזדהות (וה-SMS) תתחיל רק אחרי אישור מפורש שלו, ואז תוכל לשלוח `start_login`. בינתיים המשך לשוחח רגיל (תזכורות על מסמכים אחרים וכו\'). אם הלקוח מבקש להפסיק — `tax_fetch_action: "cancel"`.';

  const stateGuidance: Record<string, string> = {
    none: 'ניתן להציע ללקוח למשוך עבורו את טופס ה-106 ישירות מאתר רשות המסים (יש לנו את פרטי ההזדהות שלו). כשמתאים בשיחה, הצע זאת ושלח `tax_fetch_action: "offer"` יחד עם ההודעה שבה אתה מציע. אפשר לציין כבר בהצעה שהתהליך כולל אימות קצר בקוד SMS, שנוח לתאם ב-WhatsApp.',
    offered:
      'הצעת ללקוח למשוך את הטופס. אם הלקוח הסכים — שלח `tax_fetch_action: "client_agreed"` יחד עם הודעה שמסבירה את הצעד הבא: יישלח אליו קוד חד-פעמי ב-SMS, ואת הקוד מעבירים לך ב-WhatsApp. אם השיחה מתנהלת כרגע באימייל, ההודעה הזו צריכה להציע לו לעבור ל-WhatsApp לשלב הזה, להסביר בקצרה למה (ראה עיקרון הערוץ למעלה) ולבקש את אישורו. אם הוא כבר מתכתב איתך ב-WhatsApp — פשוט שלח שם את ההסבר. אל תציג את התהליך כאילו כבר התחיל — ההזדהות מתחילה רק בצעד הבא. אם עדיין לא ברור אם הסכים — המשך לשוחח רגיל.',
    agreed: canStart ? startNowGuidance : waitForClientGuidance,
    wa_intro_sent: canStart ? startNowGuidance : waitForClientGuidance,
    awaiting_otp:
      'המערכת ממתינה לקוד ה-SMS מהלקוח ב-WhatsApp ותטפל בו אוטומטית — פשוט המשך לשוחח רגיל. אל תבקש את הקוד שוב בעצמך. אם הלקוח שלח את הקוד באימייל — הסבר בעדינות שהקוד נקלט רק ב-WhatsApp ובקש שישלח אותו שם. אם הלקוח מבקש להפסיק — `tax_fetch_action: "cancel"`.',
    in_progress: 'תהליך המשיכה מרשות המסים מתבצע כעת אוטומטית. המשך לשוחח רגיל; שלח `tax_fetch_action: "cancel"` רק אם הלקוח מבקש להפסיק.',
    delivered: 'טופס ה-106 כבר נמשך ונשלח ללקוח. אין צורך להציע שוב.',
    failed: 'ניסיון קודם למשוך את הטופס נכשל. אם מתאים, אפשר להציע לנסות שוב עם `tax_fetch_action: "offer"`.',
  };

  const actions = allowedActions.length > 0 ? allowedActions.join(', ') : '(אין)';
  return [
    '--- TAX AUTHORITY 106 FETCH ---',
    `status: ${state}`,
    'עיקרון הערוץ לשלב הקוד: הקוד החד-פעמי שמגיע ב-SMS תקף דקות ספורות, ולכן העברתו היא חילופי הודעות מהירים. אימייל מתאים להתכתבות איטית עם הפסקות ארוכות; WhatsApp מתאים לתקשורת מיידית — והמערכת קולטת את הקוד מהלקוח ב-WhatsApp בלבד. לעולם אל תבקש מהלקוח לשלוח את הקוד באימייל. המעבר ל-WhatsApp לשלב הזה הוא החלטה משותפת: הצע אותו, הסבר בקצרה למה, ואם הלקוח רוצה לעבור ל-WhatsApp — עבור לשם מיד.',
    'המשכיות בין הערוצים: אם עד עכשיו ההתכתבות התנהלה באימייל, ההודעה הראשונה ב-WhatsApp היא המשך ישיר של אותה שיחה — נסח אותה כך (למשל "בהמשך למייל שלנו..."), בלי להציג את עצמך מחדש ובלי לפתוח כאילו זו פנייה חדשה. אם החלון סגור וחובה להשתמש בתבנית, בחר את התבנית שמתאימה ביותר להמשך השיחה — אם קיימת ברשימה תבנית ייעודית למעבר השיחה מהמייל לוואטסאפ, העדף אותה. ברגע שהלקוח יענה בוואטסאפ ייפתח החלון ותוכל להמשיך שם בהודעות חופשיות.',
    stateGuidance[state] ?? '',
    `tax_fetch_action מותר כעת: ${actions}. בכל מצב אחר השאר את השדה null.`,
    '--- END 106 FETCH ---',
  ].join('\n');
}

/** The client's optional collection deadline, stored as "YYYY-MM-DD" in agent_fields.due_date. */
export function clientDueDate(client: ClientRow): string | null {
  const value = client.agent_fields?.['due_date'];
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Lives in `contents` (like the documents section) so custom system prompts
 * still see the deadline. Empty string when no due date is set — the template's
 * deadline guidance tells the LLM to ignore the factor in that case.
 */
export function buildDeadlineSection(client: ClientRow, now: Date): string {
  const dueDate = clientDueDate(client);
  if (!dueDate) return '';
  const daysLeft = Math.ceil((Date.parse(dueDate) - now.getTime()) / 86_400_000);
  const distance = daysLeft > 0 ? `${daysLeft} day(s) from now` : daysLeft === 0 ? 'TODAY' : `${-daysLeft} day(s) OVERDUE`;
  return `--- COLLECTION DEADLINE ---\nAll documents should be collected by: ${dueDate} (${distance})\n--- END DEADLINE ---`;
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

/** One-line verdict from the ingestion-time content analysis, shown under the file in the transcript. */
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
    a.tax_year ? `tax year: ${a.tax_year}` : null,
    a.subject_name ? `subject: ${a.subject_name}` : null,
    a.matched_document_id ? `matches required document id: ${a.matched_document_id}` : 'matches no required document',
    a.legible ? null : 'NOT LEGIBLE',
    `confidence: ${a.confidence}`,
    a.summary,
  ].filter((p): p is string => p !== null);
  return `content analysis (from the file's actual contents): ${parts.join(' | ')}`;
}

export function buildThreadTranscript(history: EmailRow[], files: DocumentFileRow[] = []): string {
  if (history.length === 0) {
    return '--- MESSAGE THREAD (chronological, email + whatsapp) ---\n(no messages yet)\n--- END THREAD ---\n\nDecide the next action now.';
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
      .map(
        (f) =>
          `  - [file id: ${f.id}] ${f.filename} (${f.content_type}, ${f.size_bytes} bytes)\n    ${formatFileAnalysis(f)}`,
      )
      .join('\n');
    const attachments = attached ? `\nAttachments received and stored:\n${attached}` : '';
    // WhatsApp messages have no subject line.
    const subject = email.channel === 'email' ? ` | Subject: ${email.subject}` : '';
    return `[#${i + 1}] ${timestamp} | via: ${email.channel} | FROM: ${from}${subject}\n${email.body}${attachments}`;
  });
  return `--- MESSAGE THREAD (chronological, email + whatsapp) ---\n${lines.join('\n\n')}\n--- END THREAD ---\n\nDecide the next action now.`;
}

export interface Prompt {
  systemInstruction: string;
  contents: string;
}

/** The tax-fetch state the prompt should surface, already gated to valid actions. */
export interface TaxFetchPromptInput {
  state: string;
  available: boolean;
  allowedActions: string[];
}

export function buildPrompt(
  client: ClientRow,
  accountant: UserRow | null,
  history: EmailRow[],
  documents: ClientDocumentRow[],
  files: DocumentFileRow[],
  now: Date,
  template?: string,
  waState: WaChannelState = WHATSAPP_UNAVAILABLE,
  taxFetch?: TaxFetchPromptInput,
): Prompt {
  const sections = [
    buildDocumentsSection(documents),
    buildDeadlineSection(client, now),
    buildWhatsAppSection(waState),
    taxFetch ? buildTaxFetchSection(taxFetch.state, taxFetch.available, taxFetch.allowedActions) : '',
    buildThreadTranscript(history, files),
  ].filter((s) => s !== '');
  return {
    systemInstruction: buildSystemPrompt(client, accountant, history, now, template),
    contents: sections.join('\n\n'),
  };
}
