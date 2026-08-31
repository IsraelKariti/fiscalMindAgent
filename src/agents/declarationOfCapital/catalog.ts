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
  /**
   * The document carries its own validity period (a "בתוקף עד" date) and must
   * not be expired at verification time. Enforced only when the extractor
   * actually finds a validity date — instances of the same type that carry
   * none (a purchase receipt next to a vehicle license) are unaffected.
   * Defaults to false.
   */
  notExpired?: boolean;
}

export interface CapitalDocumentType {
  /** Stable id, persisted in client_documents.type_key. */
  key: string;
  /** Row-name template; {{tax_year}} is rendered at seeding time. */
  nameHe: string;
  /** What exactly to obtain/ask the institution for; also rendered per {{tax_year}}. */
  descriptionHe: string;
  /**
   * Optional anatomy/lookalike guidance for the file-reading models only (the
   * ingestion analyzer's classification and the verifier's extraction) — where
   * the load-bearing fields sit on the real document and which lookalike
   * papers must NOT be accepted. Never shown to clients or seeded into rows.
   */
  analysisHintHe?: string;
  /** How the intake interview probes for this type. */
  discoveryQuestionHe: string;
  /** May legitimately resolve to more than one concrete document (accounts, cars, policies…). */
  multiInstance: boolean;
  /** The document must state balances/holdings as of 31.12.{{tax_year}} (the valuation date). */
  dateDependent: boolean;
  checks: VerificationChecks;
}

/**
 * Shared anatomy for the savings family (pension/provident/study-fund), seeded
 * from three real office samples (הראל פנסיה, ילין לפידות קופת גמל להשקעה,
 * אלטשולר שחם קרן השתלמות). Kept free of {{tax_year}} — analysisHintHe is fed
 * to the models verbatim, without template rendering.
 */
const SAVINGS_CERTIFICATE_HINT_HE =
  'שתי צורות קבילות למסמך, לכל קופה/קרן בנפרד: (א) האישור הייעודי — עמוד או מקטע שכותרתו "אישור מס להצהרת הון" (לעיתים תחת כותרת "אישור מס עבור קרן השתלמות" / "אישור מס עבור קופת גמל להשקעה"), המופק מהאזור האישי באתר הגוף המנהל; מופיעים בו שם העמית, מספר חשבון, מספר תיק ניכויים ושם הקופה/הקרן, עם הנוסח "הרינו לאשר כי סך ההפקדות... מיום ההפקדה הראשונה ועד ליום 31.12" של שנת המס. שים לב: אישור זה מאשר סך הפקדות מצטבר (לא יתרה צבורה), וסכום מאושר של 0 ש"ח הוא לגיטימי (למשל חשבון שרוקן) — חלץ גם אותו כסכום. (ב) העמוד בדוח השנתי המקוצר המציג את יתרת הכספים לסוף השנה ("יתרת הכספים בחשבונך נכון ל-31.12..." / "יתרת הכספים בחשבון בסוף השנה"). לעיתים קרובות שתי הצורות מגיעות בקובץ PDF אחד — האישור הייעודי כעמוד האחרון של הדוח השנתי — וזה קביל. אינו קביל: דוח רבעוני, או עמוד פירוט ההפקדות השנתי בלבד (טבלת "פירוט ההפקדות לחשבון") ללא יתרת סוף שנה וללא נוסח האישור.';

export const CAPITAL_DOCUMENT_CATALOG: readonly CapitalDocumentType[] = [
  {
    key: 'bank_balance',
    nameHe: 'אישור יתרות בנק ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרות רשמי מהבנק (עו"ש, מזומן, פיקדונות וחסכונות) ליום 31.12.{{tax_year}} — מתקבלים גם ריכוז יתרות, דוח שנתי מקוצר או "תעודת זהות בנקאית". נדרש אישור נפרד לכל חשבון בנק, בארץ ובחו"ל. אישור יתרות אחד עשוי לכלול באותו קובץ גם את יתרות ניירות הערך וההלוואות של החשבון.',
    // Seeded from real office samples (אישור יתרות — בנק לאומי; דוח שנתי מקוצר — בנק הפועלים).
    analysisHintHe:
      'שלוש צורות קבילות, לכל חשבון בנפרד: (א) "אישור יתרות" רשמי במבנה מכתב — הנדון "אישור יתרות ל-31.12...", עם חתימה וחותמת הבנק, ומקטעים נפרדים ליתרות חשבונות עו"ש, לניירות ערך (הרכב הפיקדון ושוויו) ולהלוואות; אישור אחד כזה עשוי לכסות באותו קובץ גם את תיק ניירות הערך ואת ההלוואות של אותו חשבון, והוא קביל גם עבור השורות ההן. (ב) "דוח שנתי מקוצר" — כותרת "דוח מקוצר לשנת..." עם "כל הנתונים נכונים ליום 31.12" וחלק יתרות ליום 31.12 (יתרת עו"ש, ניירות ערך, סה"כ נכסים). (ג) "תעודת זהות בנקאית" / ריכוז יתרות ליום 31.12. השדה המהותי: יתרת העו"ש והפיקדונות ליום 31.12 של שנת המס; יתרה אפסית או שלילית (משיכת יתר) היא לגיטימית — חלץ אותה כמות שהיא. שים לב: יתרת משכנתא בדרך כלל אינה כלולה באישור היתרות ונדרש לה אישור נפרד מבנק המשכנתאות. אינו קביל: תדפיס תנועות עו"ש או דף חשבון שאינם מציגים יתרה ליום 31.12.',
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
      'אישור ייעודי להצהרת הון (מופק מהאזור האישי באתר הקופה) או העמוד האחרון של הדוח השנתי המקוצר, המשקף את היתרה הצבורה בכל קופת גמל וקרן פנסיה (כולל קופת גמל להשקעה) ליום 31.12.{{tax_year}} — כולל קופות של בן/בת הזוג. חשבונות "חיסכון לכל ילד" אינם דורשים אישור כלל (מופקדים על ידי ביטוח לאומי).',
    analysisHintHe: SAVINGS_CERTIFICATE_HINT_HE,
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
    analysisHintHe: SAVINGS_CERTIFICATE_HINT_HE,
    discoveryQuestionHe: 'האם יש לך קרן השתלמות אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'life_insurance_savings',
    nameHe: 'אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.{{tax_year}}',
    descriptionHe:
      'לכל פוליסה בחברת ביטוח הכוללת מרכיב חיסכון (ביטוח מנהלים, פוליסת חיסכון) — אישור ייעודי להצהרת הון מהאזור האישי באתר חברת הביטוח, או העמוד האחרון של הדוח השנתי המקוצר, ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם יש לך ביטוח מנהלים או פוליסת חיסכון בחברת ביטוח, ובאילו חברות?',
    multiInstance: true,
    dateDependent: true,
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  },
  {
    key: 'real_estate',
    nameHe: 'מסמכי נכס נדל"ן',
    descriptionHe:
      'לכל נכס נדל"ן בבעלותך (דירה, בית, מגרש, נכס מסחרי), בארץ או בחו"ל, כולל בבעלות חלקית — בהצהרה מצוינים סוג הנכס, כתובת מלאה ועלות הרכישה. המסמכים נקבעים לפי אופן קבלת הנכס: ' +
      'נכס שנרכש — חוזה רכישה + נספח תשלומים (השניים יחידה אחת). אם אחד מהם אינו בנמצא, מכל סיבה, שניהם מוחלפים יחד בחלופה: שומת מס רכישה מהאזור האישי באתר רשות המסים + נסח טאבו. אם בשומה לא מופיעה עלות הרכישה — במקום השומה: הצהרת עלות מודפסת וחתומה בידי הלקוח, הכוללת את כתובת הנכס, שנת הרכישה, שמות הרוכשים ועלות הרכישה (גם אם משוערת), לצד נסח הטאבו. ' +
      'נכס מקבלן ("על הנייר") שעד יום 31.12.{{tax_year}} טרם נמסר וטרם שולם עליו התשלום האחרון — חובה גם דוח מצבת תשלומים / אישור תשלומים ששולמו בפועל מהקבלן או היזם. ' +
      'נכס בירושה — צו ירושה + נסח טאבו; נכס במתנה — נסח טאבו עדכני בלבד; בשני המקרים הנכס מדווח בעלות נומינלית של 1 ש"ח. ' +
      'נכס שכבר נכלל בהצהרת הון קודמת שנערכה במשרדנו — אין צורך במסמכים מחדש: העלות והחוזה שמורים במערכת המשרד.',
    discoveryQuestionHe:
      'אילו נכסי נדל"ן רשומים על שמך, בארץ או בחו"ל, כולל בבעלות חלקית? לגבי כל נכס: כיצד התקבל (רכישה / מקבלן וטרם נמסר / ירושה / מתנה), האם הוא כבר נכלל בהצהרת הון קודמת שנערכה במשרדנו, ואם נרכש — האם חוזה הרכישה ונספח התשלומים נמצאים בידיך?',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false },
  },
  {
    key: 'mortgage_balance',
    nameHe: 'אישור יתרת משכנתא ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת הלוואת משכנתא (יתרת החוב ליום 31.12.{{tax_year}}) מהבנק או מהגוף המלווה, לכל משכנתא בנפרד — בדרך כלל אישור היתרות לסוף שנה שהבנק מפיק. המשכנתא אינה כלולה באישור יתרות העו"ש הרגיל — נדרש לה אישור נפרד.',
    // Seeded from a real office sample (מזרחי-טפחות — "אישור על יתרת קרן בתיק").
    analysisHintHe:
      'אנטומיית אישור יתרת משכנתא: מכתב קצר מהבנק המלווה, לעיתים בנדון "אישור על יתרת קרן בתיק", ולעיתים עם טבלת יתרות רב-שנתית — "יתרת קרן" לכל 31.12 של כמה שנים ברצף. השדה המהותי הוא היתרה בשורת 31.12 של שנת המס בלבד — אל תחלץ יתרה של שנה אחרת, ואל תבלבל את תאריך ההפקה של המכתב (בראש הדף) עם תאריך היתרה. היתרה עשויה להיות מסומנת "יתרת קרן" בלי הפרשי הצמדה וחיובים נוספים — זה קביל; נוסח כמו "מסמך זה משמש כאישור למס הכנסה" מחזק את הזיהוי. אינו קביל: לוח סילוקין או דוח תשלומים חודשי במקום אישור יתרה לסוף השנה, ואישור יתרות עו"ש רגיל שאינו מציג את המשכנתא.',
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
    nameHe: 'מסמכי כלי רכב',
    descriptionHe:
      'לכל כלי רכב בבעלותך (פרטי, מסחרי, אופנוע) — בהצהרה מצוינים יצרן, דגם, שנת ייצור, מספר רישוי ועלות הרכישה. שני מסמכים לכל רכב: ' +
      'חובה לכל רכב — העתק רישיון רכב בתוקף (רישיון שפג תוקפו אינו קביל). ' +
      'לגבי העלות — מסמך רכישה או קבלה מרכישת הרכב (חשבונית מס/קבלה וכדומה). אם אין בידי הלקוח מסמך רכישה או קבלה — במקומם הצהרת עלות מהלקוח, שבה הוא מצהיר כמה עלה לו הרכב.',
    discoveryQuestionHe:
      'כמה כלי רכב (פרטי, מסחרי, אופנוע) רשומים על שמך, ומה הם? לגבי כל רכב — האם מסמך הרכישה או הקבלה מרכישת הרכב נמצאים בידיך?',
    analysisHintHe:
      'אנטומיית רישיון רכב ישראלי (מסמך משרד התחבורה): בשורת הכותרת העליונה — מספר רכב, סוג, ותאריך "בתוקף עד" (תוקף הרישיון); בגוף — שם הבעלים ומספר הזהות, תוצר, דגם וכינוי מסחרי, מועד עליה לכביש (מציין את שנת הייצור), מספר שילדה. הרישיון הוא המקור לכל פרטי הרכב שבהצהרה מלבד עלות הרכישה. אינו קביל: רישיון שפג תוקפו, או החלק התחתון של הדף בלבד ("חידוש רישיון רכב" / "הודעת זיכוי" — ספח תשלום לחידוש, לא הרישיון עצמו); רישיון הרכב תקף רק לאחר תשלום האגרה ומעבר מבחן הכשירות (טסט). אין לבלבל את "בתוקף עד" עם "תאריך רישום", "תאריך בעלות" או תאריך ההדפסה.',
    multiInstance: true,
    dateDependent: false,
    checks: { subjectMatch: true, asOfDate: false, amounts: false, notExpired: true },
  },
  {
    key: 'contents_insurance',
    nameHe: 'פוליסת ביטוח תכולה',
    descriptionHe:
      'העתק פוליסת ביטוח התכולה (לרוב פוליסת "ביטוח דירה" משולבת מבנה + תכולה) שהייתה בתוקף ביום 31.12.{{tax_year}} — העמוד המציג את סכום ביטוח התכולה, הוא הערך שנרשם בהצהרה. אם אין פוליסת ביטוח תכולה — אין צורך לשלוח מסמך כלל: התכולה נרשמת בהצהרה בערך סמלי של 1 ש"ח.',
    // Seeded from a real office sample (הפניקס "HOME פלוס" — חידוש לביטוח דירה ותכולתה).
    analysisHintHe:
      'אנטומיית פוליסת ביטוח דירה ותכולה ישראלית: בעמוד הראשון — שם המבוטח, מספר הפוליסה ותקופת הביטוח ("תקופת הביטוח: מ... עד..."). הפוליסה קבילה רק אם תקופת הביטוח כוללת את יום 31.12 של שנת המס — פוליסה שהחלה אחריו או הסתיימה לפניו אינה קבילה, גם אם היא בתוקף במועד הבדיקה. פוליסת דירה משולבת בנויה מפרקים: פרק א׳ — ביטוח מבנה הדירה, פרק ב׳ — ביטוח תכולת הדירה, פרק ג׳ — אחריות כלפי צד שלישי, פרק ד׳ — חבות מעבידים כלפי עובדי משק בית. השדה המהותי היחיד הוא סכום ביטוח התכולה: בטבלת פירוט סכומי הביטוח וההשתתפויות העצמיות, בשורת "ביטוח תכולת הדירה" שבמקטע פרק ב׳ (תכולה). אל תחלץ במקומו: את סכום ביטוח המבנה (פרק א׳ — בדרך כלל הסכום הגדול במאות אלפי עד מיליוני ש"ח), את גבולות האחריות של צד שלישי או חבות מעבידים (מיליוני ש"ח), תת-כיסויים בתוך התכולה (תכשיטים, דודי חימום), או את הפרמיה לתשלום (מאות עד אלפי ש"ח). אינו קביל: פוליסת מבנה בלבד ללא פרק תכולה (נפוצה כדרישת הבנק למשכנתא), הצעת ביטוח, או דף פירוט אמצעי תשלום בלבד.',
    discoveryQuestionHe:
      'האם ביום הדוח הייתה ברשותך פוליסת ביטוח תכולה לדירה (כולל פוליסת דירה משולבת מבנה ותכולה)?',
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
    descriptionHe:
      'עותק של הצהרת ההון האחרונה שהוגשה לרשות המסים — נדרש רק אם ההצהרה הקודמת נערכה במשרד אחר. הצהרה קודמת שנערכה במשרדנו כבר שמורה במערכת המשרד ואין צורך שהלקוח ישלח אותה.',
    discoveryQuestionHe:
      'האם זו הצהרת ההון הראשונה שלך? אם כבר הגשת בעבר — האם ההצהרה הקודמת נערכה במשרדנו או במשרד אחר?',
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
