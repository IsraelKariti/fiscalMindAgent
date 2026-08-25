/**
 * The fixed catalog of document types a הצהרת הון may require — the ONLY
 * starting point of every client's checklist: enrollment seeds one
 * 'unresolved' client_documents row per type (client_documents.type_key holds
 * the key), and the intake interview resolves each to not_required or to 1..N
 * concrete pending rows ("two cars" → two rows sharing the 'vehicle' key).
 *
 * Keys are persisted on rows — treat them as frozen once shipped; renaming a
 * key orphans existing rows. Content changes (names, questions) are safe.
 *
 * The types mirror the office's intake questionnaire (the monday WorkForm the
 * client fills before kickoff) — every type corresponds to a form question, so
 * the form answers can pre-resolve the checklist (formIntake.ts) and the
 * WhatsApp interview only covers what the form left open.
 */

/** Which generic verification checks apply when a received file is verified (verifyDocument.ts). */
export interface VerificationChecks {
  /** The document must name the client (or their national id) as its subject. */
  subjectMatch: boolean;
  /** The document must state its balances/holdings as of 31.12.{{tax_year}} exactly. */
  asOfDate: boolean;
  /** The document must carry at least one sane monetary amount. */
  amounts: boolean;
}

export interface CapitalDocumentType {
  /** Stable id, persisted in client_documents.type_key. */
  key: string;
  /** Row-name template; {{tax_year}} is rendered at seeding time. */
  nameHe: string;
  /** What exactly to obtain/ask the institution for; also rendered per {{tax_year}}. */
  descriptionHe: string;
  /** How the intake interview probes for this type. */
  discoveryQuestionHe: string;
  /** May legitimately resolve to more than one concrete document (accounts, cars, policies…). */
  multiInstance: boolean;
  /** The document must state balances/holdings as of 31.12.{{tax_year}} (the valuation date). */
  dateDependent: boolean;
  checks: VerificationChecks;
}

export const CAPITAL_DOCUMENT_CATALOG: readonly CapitalDocumentType[] = [
  {
    key: 'bank_balance',
    nameHe: 'אישור יתרות בנק ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרות רשמי מהבנק (עו"ש, מזומן, פיקדונות וחסכונות) ליום 31.12.{{tax_year}} — מתקבלים גם ריכוז יתרות, דוח שנתי מקוצר או "תעודת זהות בנקאית". נדרש אישור נפרד לכל חשבון בנק, בארץ ובחו"ל.',
    discoveryQuestionHe: 'באילו בנקים מתנהלים חשבונותיך, וכמה חשבונות יש לך בכל בנק?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'securities_portfolio',
    nameHe: 'תדפיס תיק ניירות ערך ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרה או דוח אחזקות של תיק ניירות הערך ליום 31.12.{{tax_year}} — מהבנק או מבית ההשקעות (אקסלנס, מיטב, IBI וכו\'), לכל תיק בנפרד. בהצהרה מצוינת יתרת התיק המנוהל.',
    discoveryQuestionHe: 'האם יש לך תיק ניירות ערך או חשבון השקעות בבנק או בבית השקעות?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'pension_provident',
    nameHe: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור ייעודי להצהרת הון (מופק מהאזור האישי באתר הקופה) או העמוד האחרון של הדוח השנתי המקוצר, המשקף את היתרה הצבורה בכל קופת גמל וקרן פנסיה ליום 31.12.{{tax_year}} — כולל קופות של בן/בת הזוג.',
    discoveryQuestionHe: 'באילו קופות גמל וקרנות פנסיה אתה חבר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'study_fund',
    nameHe: 'אישור יתרת קרן השתלמות ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרה צבורה מכל קרן השתלמות ליום 31.12.{{tax_year}} — אישור ייעודי להצהרת הון מאתר הקופה או העמוד האחרון של הדוח השנתי המקוצר.',
    discoveryQuestionHe: 'האם יש לך קרן השתלמות אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'life_insurance_savings',
    nameHe: 'אישור ערכי פדיון ביטוח חיים ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור ערך פדיון מחברת הביטוח לכל פוליסת ביטוח חיים הכוללת מרכיב חיסכון (ביטוח מנהלים, פוליסת חיסכון), ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם יש לך פוליסות ביטוח חיים עם מרכיב חיסכון, ובאילו חברות?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'real_estate',
    nameHe: 'מסמכי נכס נדל"ן',
    descriptionHe:
      'חוזה רכישה בצירוף נספח התשלומים לכל נכס נדל"ן בבעלותך (דירה, בית, מגרש, נכס מסחרי), בארץ או בחו"ל, כולל בבעלות חלקית — בהצהרה מצוינים סוג הנכס, כתובת מלאה ועלות הרכישה. נכס שהתקבל בירושה או במתנה נרשם בעלות נומינלית של 1 ש"ח — במקרה כזה די בנסח טאבו או במסמכי הירושה/המתנה.',
    discoveryQuestionHe: 'אילו נכסי נדל"ן רשומים על שמך, בארץ או בחו"ל, כולל בבעלות חלקית?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'mortgage_balance',
    nameHe: 'אישור יתרת משכנתא ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת הלוואת משכנתא (יתרת החוב ליום 31.12.{{tax_year}}) מהבנק או מהגוף המלווה, לכל משכנתא בנפרד — בדרך כלל אישור היתרות לסוף שנה שהבנק מפיק.',
    discoveryQuestionHe: 'האם יש לך משכנתא אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'loan_taken',
    nameHe: 'אישור יתרת הלוואה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת הלוואה ליום 31.12.{{tax_year}} לכל הלוואה פעילה שאינה משכנתא — מבנק, מחברת אשראי או מגוף חוץ-בנקאי (מקס, הראל, כלל וכו\'), וכן הלוואה פרטית — בציון שם הגוף המלווה.',
    discoveryQuestionHe: 'האם יש לך הלוואות פעילות מלבד משכנתא (בנק, כרטיס אשראי, הלוואה פרטית)?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'loan_given',
    nameHe: 'אסמכתא להלוואה שניתנה — יתרה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'הסכם הלוואה חתום או פסק דין לכל הלוואה או חוב שאחרים חייבים לך (כולל הלוואות לבני משפחה או לחברה בבעלותך) — בציון זהות החייב, סכום החוב והיתרה ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם מישהו חייב לך כסף — הלוואות שנתת לאנשים פרטיים, לבני משפחה או לעסק?',
    multiInstance: true,
    dateDependent: true,
    // Private loan agreements are free-form — the lender's name appears but an
    // exact as-of date usually doesn't; the amount is the load-bearing field.
    checks: { subjectMatch: true, asOfDate: false, amounts: true },
  },
  {
    key: 'vehicle',
    nameHe: 'מסמכי רכישת כלי רכב',
    descriptionHe:
      'לכל כלי רכב בבעלותך (פרטי, מסחרי, אופנוע): חשבונית מס/קבלה אם נרכש מחברה, או הצהרת עלות רכישה אם נרכש יד שנייה — בהצהרה מצוינים יצרן, דגם, שנת ייצור, מספר רישוי ועלות הרכישה. אם המסמך אינו בנמצא — די בציון הפרטים ועלות הרכישה.',
    discoveryQuestionHe: 'כמה כלי רכב רשומים על שמך, ומה הם?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'contents_insurance',
    nameHe: 'פוליסת ביטוח תכולה',
    descriptionHe:
      'העתק פוליסת ביטוח התכולה שהייתה בתוקף ביום 31.12.{{tax_year}} — העמוד המציג את סכום ביטוח התכולה (הוא הערך שנרשם בהצהרה). אם אין פוליסת תכולה — התכולה נרשמת בערך סמלי ואין צורך במסמך.',
    discoveryQuestionHe: 'האם ביום הדוח הייתה ברשותך פוליסת ביטוח תכולה לדירה?',
    multiInstance: false,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: true },
  },
  {
    key: 'business_ownership',
    nameHe: 'אסמכתת בעלות בעסק או בחברה',
    descriptionHe:
      'לכל חברה שאתה מחזיק במניותיה (בבעלות מלאה או חלקית): כרטיס חו"ז בעלים מעודכן מהנהלת החשבונות של החברה — בהצהרה מצוינים שם החברה, מספר הח"פ ואחוז האחזקה. לעסק שאינו חברה: תדפיס רשם החברות או הסכם מייסדים, ומאזן ליום 31.12.{{tax_year}} אם קיים.',
    discoveryQuestionHe: 'האם אתה בעלים, שותף או בעל מניות בעסק או בחברה כלשהי?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'crypto',
    nameHe: 'דוח אחזקות מטבעות דיגיטליים ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת מטבעות מכל זירת מסחר או ארנק דיגיטלי (ביטקוין וכדומה) ליום 31.12.{{tax_year}} — בציון כמות המטבעות, סוגם ושווי השוק ליום זה.',
    discoveryQuestionHe: 'האם אתה מחזיק מטבעות דיגיטליים (קריפטו), ובאילו זירות או ארנקים?',
    multiInstance: true,
    dateDependent: true,
    // Exchange exports rarely carry the holder's legal name.
    checks: { subjectMatch: false, asOfDate: true, amounts: true },
  },
  {
    key: 'private_investment',
    nameHe: 'אסמכתת השקעה פרטית',
    descriptionHe:
      'כרטיס הנהלת חשבונות או כרטיס חו"ז בתאגיד, המוכיח את גובה ההשקעה, לכל השקעה פרטית (שאינה ניירות ערך) בחברה, בתאגיד או במיזם, בארץ או בחו"ל — בהצהרה מצוין הסכום שהושקע. בהיעדרם — הסכם ההשקעה.',
    discoveryQuestionHe: 'האם יש לך השקעה פרטית (שאינה ניירות ערך) בחברה או בתאגיד, בארץ או בחו"ל?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'poa_account',
    nameHe: 'אישור ניהול חשבון — יפוי כוח',
    descriptionHe:
      'אישור ניהול חשבון לכל חשבון בנק של אדם אחר (למשל הורים או ילדים) שבו הינך מורשה חתימה, מיופה כוח או אפוטרופוס — החשבון נרשם בהצהרה בערך נומינלי של 1 ש"ח, כדי למנוע כפילויות בהצלבות המידע של רשות המסים ולהבהיר שהכסף אינו שלך.',
    discoveryQuestionHe: 'האם אתה מורשה חתימה, מיופה כוח או אפוטרופוס בחשבון בנק של אדם אחר?',
    multiInstance: true,
    dateDependent: false,
    // The account belongs to someone else — the client's name is exactly what
    // wouldn't appear as the owner; no generic check is safe here.
    checks: { subjectMatch: false, asOfDate: false, amounts: false },
  },
  {
    key: 'prior_declaration',
    nameHe: 'הצהרת הון קודמת',
    descriptionHe: 'עותק של הצהרת ההון האחרונה שהוגשה לרשות המסים, אם הוגשה בעבר.',
    discoveryQuestionHe: 'האם הגשת בעבר הצהרת הון לרשות המסים?',
    multiInstance: false,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'other_assets',
    nameHe: 'נכסים או התחייבויות נוספים',
    descriptionHe:
      'אסמכתת עלות רכישה לכל נכס או התחייבות בעלי ערך משמעותי שאינם מכוסים בסעיפים האחרים (יאכטה, מטוס, שינויים מבניים בנכס וכדומה), או לכל הפחות תיאור מפורט להערה בדוח — הסעיף קיים כדי ששום נכס לא יישאר מחוץ להצהרה.',
    discoveryQuestionHe: 'האם יש לך נכס או התחייבות משמעותיים נוספים שלא נשאלת עליהם?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: false, asOfDate: false, amounts: false },
  },
] as const;

const BY_KEY = new Map(CAPITAL_DOCUMENT_CATALOG.map((t) => [t.key, t]));

export function getCatalogType(key: string): CapitalDocumentType | undefined {
  return BY_KEY.get(key);
}

/** The checks for ad-hoc rows (type_key NULL) — the generic minimum a human-added document can be held to. */
export const GENERIC_CHECKS: VerificationChecks = { subjectMatch: false, asOfDate: false, amounts: false };

/** A checklist row to create at enrollment (status 'unresolved', type_key set). */
export interface CatalogSeedRow {
  typeKey: string;
  name: string;
  description: string;
}

/** The rows every new declaration-of-capital client starts with — the catalog with {{tax_year}} rendered. */
export function catalogSeedRows(taxYear: number): CatalogSeedRow[] {
  const year = String(taxYear);
  return CAPITAL_DOCUMENT_CATALOG.map((t) => ({
    typeKey: t.key,
    name: t.nameHe.replaceAll('{{tax_year}}', year),
    description: t.descriptionHe.replaceAll('{{tax_year}}', year),
  }));
}
