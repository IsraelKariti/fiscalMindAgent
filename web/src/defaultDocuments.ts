export interface DocumentDraft {
  name: string;
  description?: string | null;
}

/**
 * Default checklist for a self-employed annual tax return (דוח שנתי לעצמאים),
 * offered by the doc collector's add-client form and its client-import
 * settings. Each entry must represent a single physical document (one file the
 * client can send), never a collection of documents — the agent tracks a
 * pending/collected status per entry.
 */
export const DEFAULT_DOCUMENTS: DocumentDraft[] = [
  {
    name: 'דוח ריכוז הכנסות שנתי',
    description:
      'דוח מסכם אחד ממערכת הפקת החשבוניות (או ספר הפדיון היומי) עם סך ההכנסות לשנת המס.',
  },
  {
    name: 'דוח ריכוז הוצאות שנתי',
    description:
      "דוח או טבלה אחת המרכזת את כל הוצאות העסק לשנת המס (שכר דירה, אינטרנט, ציוד, נסיעות וכו').",
  },
  {
    name: 'אישור יתרות מהבנק ל-31 בדצמבר',
    description: 'אישור יתרות אחד לסוף שנת המס מחשבון הבנק של העסק.',
  },
  {
    name: 'טופס 867',
    description: 'אישור מהבנק על רווחים/הפסדים מהשקעות, ריביות וניכוי מס במקור.',
  },
  {
    name: 'אישור שנתי מקרן הפנסיה',
    description: 'אישור שנתי לצורכי מס על הפקדות לקרן הפנסיה.',
  },
  {
    name: 'אישור שנתי מקרן ההשתלמות',
    description: 'אישור שנתי לצורכי מס על הפקדות לקרן ההשתלמות.',
  },
  {
    name: 'אישור שנתי מביטוח אובדן כושר עבודה',
    description: 'אישור שנתי לצורכי מס מחברת הביטוח על תשלומים לביטוח אובדן כושר עבודה.',
  },
  {
    name: 'אישור שנתי על ניכוי מס במקור',
    description: 'אישור שנתי מלקוח שניכה מס במקור במהלך השנה (אם רלוונטי).',
  },
  {
    name: 'טופס 106',
    description: 'אם העצמאי (או בן/בת הזוג) עבד גם כשכיר במהלך השנה.',
  },
  {
    name: 'אישור שנתי על תרומות',
    description: 'אישור מרכז אחד מהמוסד שנתרם לו, לפי סעיף 46.',
  },
  {
    name: 'צילום תעודת זהות עם ספח',
    description: "לעדכון מצב משפחתי, ילדים וכו'.",
  },
  {
    name: 'אישור תושבות',
    description: 'אישור תושבות ביישוב מזכה בפריפריה (אם רלוונטי).',
  },
];

/**
 * Default checklist for a declaration of capital (הצהרת הון) — balances and
 * ownership documents as of the declaration's 31.12 valuation date. Same
 * single-physical-document rule as DEFAULT_DOCUMENTS.
 */
export const DECLARATION_OF_CAPITAL_DOCUMENTS: DocumentDraft[] = [
  {
    name: 'אישור יתרות מהבנק ליום המועד הקובע',
    description: 'אישור יתרות אחד מכל חשבון בנק (עו"ש, פיקדונות וחסכונות) ליום 31 בדצמבר של שנת ההצהרה.',
  },
  {
    name: 'תדפיס תיק ניירות ערך ליום המועד הקובע',
    description: 'תדפיס שווי תיק ההשקעות (מהבנק או מבית ההשקעות) ליום 31 בדצמבר של שנת ההצהרה.',
  },
  {
    name: 'אישור יתרה מקרן ההשתלמות',
    description: 'אישור יתרה צבורה ליום המועד הקובע מכל קרן השתלמות.',
  },
  {
    name: 'אישור יתרה מקופת גמל / קופת גמל להשקעה',
    description: 'אישור יתרה צבורה ליום המועד הקובע (אם קיימת קופה).',
  },
  {
    name: 'אישור יתרת משכנתא',
    description: 'אישור יתרת הלוואת המשכנתא מהבנק ליום המועד הקובע (אם קיימת).',
  },
  {
    name: 'אישור יתרת הלוואות אחרות',
    description: 'אישור יתרה ליום המועד הקובע לכל הלוואה נוספת - מבנק, מחברת אשראי או פרטית (אם קיימת).',
  },
  {
    name: 'חוזה רכישת דירה / נכס נדל"ן',
    description: 'חוזה הרכישה של כל נכס נדל"ן בבעלות, כולל מחיר הרכישה.',
  },
  {
    name: 'רישיון רכב',
    description: 'צילום רישיון הרכב של כל כלי רכב בבעלות.',
  },
  {
    name: 'אישור יתרות מחשבונות והשקעות בחו"ל',
    description: 'אישור יתרה ליום המועד הקובע לכל חשבון או השקעה מחוץ לישראל (אם רלוונטי).',
  },
  {
    name: 'אישור ערך פדיון מפוליסת ביטוח חיים עם חיסכון',
    description: 'אישור ערך הפדיון ליום המועד הקובע מחברת הביטוח (אם קיימת פוליסה כזו).',
  },
  {
    name: 'הסכם הלוואה שניתנה לאחרים',
    description: 'הסכם או אסמכתא להלוואה שניתנה לקרוב או לאחר, כולל היתרה ליום המועד הקובע (אם רלוונטי).',
  },
  {
    name: 'צילום תעודת זהות עם ספח',
    description: "לעדכון מצב משפחתי, ילדים וכו'.",
  },
];
