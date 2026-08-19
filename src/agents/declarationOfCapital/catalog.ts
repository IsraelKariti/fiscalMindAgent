/**
 * The fixed catalog of document types a הצהרת הון may require — the ONLY
 * starting point of every client's checklist: enrollment seeds one
 * 'unresolved' client_documents row per type (client_documents.type_key holds
 * the key), and the intake interview resolves each to not_required or to 1..N
 * concrete pending rows ("two cars" → two rows sharing the 'vehicle' key).
 *
 * Keys are persisted on rows — treat them as frozen once shipped; renaming a
 * key orphans existing rows. Content changes (names, questions) are safe.
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
      'אישור יתרות רשמי מהבנק (עו"ש, פיקדונות וחסכונות) ליום 31.12.{{tax_year}}. נדרש אישור נפרד לכל חשבון בנק.',
    discoveryQuestionHe: 'באילו בנקים מתנהלים חשבונותיך, וכמה חשבונות יש לך בכל בנק?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'securities_portfolio',
    nameHe: 'תדפיס תיק ניירות ערך ליום 31.12.{{tax_year}}',
    descriptionHe: 'דוח אחזקות של תיק ניירות הערך (בבנק או בבית השקעות) ליום 31.12.{{tax_year}}, לכל תיק בנפרד.',
    discoveryQuestionHe: 'האם יש לך תיק ניירות ערך או חשבון השקעות בבנק או בבית השקעות?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'pension_provident',
    nameHe: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.{{tax_year}}',
    descriptionHe: 'דוח שנתי או אישור יתרה מכל קופת גמל וקרן פנסיה, המשקף את היתרה ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'באילו קופות גמל וקרנות פנסיה אתה חבר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'study_fund',
    nameHe: 'אישור יתרת קרן השתלמות ליום 31.12.{{tax_year}}',
    descriptionHe: 'אישור יתרה מכל קרן השתלמות ליום 31.12.{{tax_year}}.',
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
    descriptionHe: 'חוזה רכישה או נסח טאבו לכל נכס נדל"ן בבעלותך (דירה, בית, מגרש, נכס מסחרי), כולל נכסים בבעלות חלקית.',
    discoveryQuestionHe: 'אילו נכסי נדל"ן רשומים על שמך, בארץ או בחו"ל, כולל בבעלות חלקית?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'mortgage_balance',
    nameHe: 'אישור יתרת משכנתא ליום 31.12.{{tax_year}}',
    descriptionHe: 'אישור יתרת הלוואת משכנתא מהבנק ליום 31.12.{{tax_year}}, לכל משכנתא בנפרד.',
    discoveryQuestionHe: 'האם יש לך משכנתא אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'loan_taken',
    nameHe: 'אישור יתרת הלוואה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרה לכל הלוואה שאינה משכנתא שנטלת ועודנה פעילה (בנק, חברת אשראי, הלוואה פרטית), ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם יש לך הלוואות פעילות מלבד משכנתא (בנק, כרטיס אשראי, הלוואה פרטית)?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'loan_given',
    nameHe: 'אסמכתא להלוואה שניתנה — יתרה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'הסכם הלוואה או אסמכתא אחרת לכל הלוואה או חוב שאחרים חייבים לך (כולל הלוואות לבני משפחה או לחברה בבעלותך), עם היתרה ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם מישהו חייב לך כסף — הלוואות שנתת לאנשים פרטיים, לבני משפחה או לעסק?',
    multiInstance: true,
    dateDependent: true,
    // Private loan agreements are free-form — the lender's name appears but an
    // exact as-of date usually doesn't; the amount is the load-bearing field.
    checks: { subjectMatch: true, asOfDate: false, amounts: true },
  },
  {
    key: 'vehicle',
    nameHe: 'רישיון רכב ומסמכי רכישה',
    descriptionHe: 'רישיון רכב בתוקף וחוזה/חשבונית רכישה לכל כלי רכב בבעלותך (רכב, אופנוע, וכדומה).',
    discoveryQuestionHe: 'כמה כלי רכב רשומים על שמך, ומה הם?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'business_ownership',
    nameHe: 'אסמכתת בעלות בעסק או בחברה',
    descriptionHe:
      'לכל עסק או חברה שבבעלותך (מלאה או חלקית): תדפיס רשם החברות או הסכם מייסדים, ומאזן ליום 31.12.{{tax_year}} אם קיים.',
    discoveryQuestionHe: 'האם אתה בעלים, שותף או בעל מניות בעסק או בחברה כלשהי?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'cash_foreign_currency',
    nameHe: 'הצהרת מזומנים ומטבע חוץ ליום 31.12.{{tax_year}}',
    descriptionHe: 'פירוט סכומי מזומן ומטבע חוץ שהוחזקו מחוץ לחשבונות בנק ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם החזקת סכומי מזומן או מטבע חוץ משמעותיים מחוץ לבנק בסוף השנה?',
    multiInstance: false,
    dateDependent: true,
    // A self-written declaration: no issuer, no printed subject line to trust.
    checks: { subjectMatch: false, asOfDate: false, amounts: true },
  },
  {
    key: 'crypto',
    nameHe: 'דוח אחזקות מטבעות דיגיטליים ליום 31.12.{{tax_year}}',
    descriptionHe:
      'דוח אחזקות מכל זירת מסחר או ארנק דיגיטלי (ביטקוין וכדומה) המשקף את האחזקות ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם אתה מחזיק מטבעות דיגיטליים (קריפטו), ובאילו זירות או ארנקים?',
    multiInstance: true,
    dateDependent: true,
    // Exchange exports rarely carry the holder's legal name.
    checks: { subjectMatch: false, asOfDate: true, amounts: true },
  },
  {
    key: 'valuables',
    nameHe: 'אסמכתאות לחפצי ערך',
    descriptionHe: 'חשבונית רכישה או הערכת שמאי לחפצי ערך משמעותיים (תכשיטים, אמנות, אספנות).',
    discoveryQuestionHe: 'האם ברשותך חפצי ערך משמעותיים כמו תכשיטים, יצירות אמנות או פריטי אספנות?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: false, asOfDate: false, amounts: true },
  },
  {
    key: 'foreign_assets',
    nameHe: 'אישור יתרות נכסים בחו"ל ליום 31.12.{{tax_year}}',
    descriptionHe: 'אישור יתרה או דוח אחזקות לכל חשבון בנק או נכס פיננסי המוחזק בחו"ל, ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם יש לך חשבונות בנק, השקעות או נכסים פיננסיים בחו"ל?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
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
      'אסמכתא לכל נכס או התחייבות בעלי ערך משמעותי שאינם מכוסים בסעיפים האחרים — הסעיף קיים כדי ששום נכס לא יישאר מחוץ להצהרה.',
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
