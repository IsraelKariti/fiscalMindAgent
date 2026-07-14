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
