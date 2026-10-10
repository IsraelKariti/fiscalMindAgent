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

/**
 * One concrete kind of paper the office accepts under a type (openspec
 * `document-papers`): a property is documented by a purchase contract, a
 * payments appendix, a land registry extract… — all of one type, but a file of
 * one paper is never the item of another. A checklist item of a type with
 * papers carries its paper (client_documents.paper_key); the classifier names
 * the paper of every file; code compares the two.
 */
export interface CatalogPaper {
  /** Stable id, unique across the whole catalog, persisted in client_documents.paper_key. */
  key: string;
  /** A few words naming the paper, no date or year: the display name of an unmatched split child. */
  shortNameHe: string;
  /** Anatomy / lookalike guidance for the file-reading models only (never shown to clients). */
  analysisHintHe?: string;
}

/**
 * The catalog's business content of one type. What the model reads from a
 * file of this type and how code checks it (the answer schema, the prompt,
 * the extra fields, the checks) is NOT here: it lives in the type's own module
 * under documentTypes/ (openspec `document-extraction`), keyed by `key`.
 */
export interface CapitalDocumentType {
  /** Stable id, persisted in client_documents.type_key. */
  key: string;
  /**
   * A few words naming the type, with no date or year: the display name of a
   * split child file that matched no list document (splitChildNames.ts).
   */
  shortNameHe: string;
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
  /**
   * Always issued by a bank / fund manager / insurer, and each list item names
   * one such company: code compares the file's issuer with the item's company
   * before a file is tied to the item (institutions.ts, openspec `unlisted-files`).
   * Defaults to false.
   */
  institutionBound?: boolean;
  /**
   * A fund of this type is opened per employer, and the institution prints the
   * employer on each fund's report: the classifier reads it, and the employer
   * tells apart several funds of one client at one company (splitChildNames.ts,
   * companySplit.ts, openspec `unlisted-files`). Defaults to false.
   */
  employerBound?: boolean;
  /**
   * The closed list of papers this type accepts (openspec `document-papers`).
   * Absent = the type has no papers: items and files carry none and nothing
   * compares them.
   */
  papers?: readonly CatalogPaper[];
}

/** The papers of a property (openspec `document-papers`), in the order the catalog description names them. */
const REAL_ESTATE_PAPERS: readonly CatalogPaper[] = [
  {
    key: 'purchase_contract',
    shortNameHe: 'חוזה רכישה',
    analysisHintHe:
      'חוזה רכישה: הסכם מכר מקרקעין חתום בין המוכר לקונה — כותרת "הסכם מכר" / "חוזה מכר" / "חוזה רכישה", פרטי הצדדים, תיאור הנכס (כתובת, גוש וחלקה), התמורה ומועדי התשלום, וחתימות. אינו חוזה רכישה: נסח טאבו (תדפיס מפנקס הזכויות של לשכת רישום המקרקעין), נספח תשלומים לבדו, שומת מס רכישה, או הסכם שכירות.',
  },
  {
    key: 'payments_appendix',
    shortNameHe: 'נספח תשלומים',
    analysisHintHe:
      'נספח תשלומים: הנספח לחוזה הרכישה המפרט את לוח התשלומים לקונה — סכום כל תשלום, מועדו ואופן ביצועו (לעיתים כותרת "נספח תשלומים" / "נספח א\' — לוח תשלומים"). אינו נספח תשלומים: לוח סילוקין של משכנתא, דוח תשלומים חודשי מהבנק, או גוף החוזה עצמו.',
  },
  {
    key: 'tabu_extract',
    shortNameHe: 'נסח טאבו',
    analysisHintHe:
      'נסח טאבו: תדפיס "מידע מפנקס הזכויות" / "נסח רישום" מלשכת רישום המקרקעין (או מאתר רשות המקרקעין), עם גוש, חלקה, תת-חלקה, רשימת הבעלים או החוכרים וחלקיהם, הערות אזהרה ומשכנתאות. אינו נסח טאבו: חוזה רכישה, אישור זכויות מחברה משכנת, או שומת מס רכישה.',
  },
  {
    key: 'purchase_tax_assessment',
    shortNameHe: 'שומת מס רכישה',
    analysisHintHe:
      'שומת מס רכישה: הודעת שומה מרשות המסים (מיסוי מקרקעין) על מס רכישה — מספר שומה, פרטי הרוכש, הנכס ושווי הרכישה שעליו חושב המס. אינה שומה: חוזה רכישה, נסח טאבו, או שומת מס הכנסה שנתית.',
  },
  {
    key: 'cost_declaration',
    shortNameHe: 'הצהרת עלות',
    analysisHintHe:
      'הצהרת עלות: דף קצר, מודפס או בכתב יד, שהלקוח כתב וחתם עליו, ובו עלות הרכישה של הנכס (גם אם משוערת) — לרוב גם זיהוי הנכס (כתובת) ולעיתים שנת הרכישה ושמות הרוכשים, אך די בסכום ובחתימה. אינה הצהרת עלות: מסמך של בנק, של רשות או של עורך דין.',
  },
  {
    key: 'inheritance_order',
    shortNameHe: 'צו ירושה',
    analysisHintHe:
      'צו ירושה (או צו קיום צוואה): צו של הרשם לענייני ירושה או של בית משפט, המכריז על היורשים וחלקיהם — כותרת "צו ירושה" / "צו קיום צוואה", שם המנוח, היורשים, חתימת הרשם וחותמת. אינו צו ירושה: נסח טאבו, צוואה לבדה, או תעודת פטירה.',
  },
  {
    key: 'builder_payments_report',
    shortNameHe: 'דוח מצבת תשלומים מהקבלן',
    analysisHintHe:
      'דוח מצבת תשלומים / אישור תשלומים מהקבלן או מהיזם: מסמך על נייר של החברה הקבלנית, המציג לדירה שטרם נמסרה כמה שולם בפועל עד כה וכמה נותר לתשלום, לרוב כטבלה של תשלומים לפי לוח החוזה. אינו דוח מצבת תשלומים: נספח התשלומים של החוזה (התוכנית), קבלה בודדת, או אישור יתרת משכנתא.',
  },
];

/**
 * Shared anatomy for the savings family (pension/provident/study-fund), seeded
 * from three real office samples (הראל פנסיה, ילין לפידות קופת גמל להשקעה,
 * אלטשולר שחם קרן השתלמות). Kept free of {{tax_year}} — analysisHintHe is fed
 * to the models verbatim, without template rendering.
 */
const SAVINGS_CERTIFICATE_HINT_HE =
  'שתי צורות קבילות למסמך, לכל קופה/קרן בנפרד: (א) האישור הייעודי — עמוד או מקטע שכותרתו "אישור מס להצהרת הון" (לעיתים תחת כותרת "אישור מס עבור קרן השתלמות" / "אישור מס עבור קופת גמל להשקעה"), המופק מהאזור האישי באתר הגוף המנהל; מופיעים בו שם העמית, מספר תיק ניכויים ושם הקופה/הקרן (בחלק מהקופות גם מספר חשבון או מספר עמית, ובאחרות — למשל מנורה מבטחים — לא מודפס מספר כזה כלל), עם הנוסח "הרינו לאשר כי סך ההפקדות... מיום ההפקדה הראשונה ועד ליום 31.12" של שנת המס. שים לב: אישור זה מאשר סך הפקדות מצטבר (לא יתרה צבורה), וסכום מאושר של 0 ש"ח הוא לגיטימי (למשל חשבון שרוקן) — חלץ גם אותו כסכום. (ב) העמוד בדוח השנתי המקוצר המציג את יתרת הכספים לסוף השנה ("יתרת הכספים בחשבונך נכון ל-31.12..." / "יתרת הכספים בחשבון בסוף השנה"). לעיתים קרובות שתי הצורות מגיעות בקובץ PDF אחד — האישור הייעודי כעמוד האחרון של הדוח השנתי — וזה קביל. אינו קביל: דוח רבעוני, או עמוד פירוט ההפקדות השנתי בלבד (טבלת "פירוט ההפקדות לחשבון") ללא יתרת סוף שנה וללא נוסח האישור.';

export const CAPITAL_DOCUMENT_CATALOG: readonly CapitalDocumentType[] = [
  {
    key: 'bank_balance',
    institutionBound: true,
    shortNameHe: 'חשבון בנק',
    nameHe: 'אישור יתרות בנק ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרות רשמי מהבנק (עו"ש, מזומן, פיקדונות וחסכונות) ליום 31.12.{{tax_year}} — מתקבלים גם ריכוז יתרות, דוח שנתי מקוצר או "תעודת זהות בנקאית". נדרש אישור נפרד לכל חשבון בנק, בארץ ובחו"ל. אישור יתרות אחד עשוי לכלול באותו קובץ גם את יתרות ניירות הערך וההלוואות של החשבון.',
    // Seeded from real office samples (אישור יתרות — בנק לאומי; דוח שנתי מקוצר — בנק הפועלים).
    analysisHintHe:
      'שלוש צורות קבילות, לכל חשבון בנפרד: (א) "אישור יתרות" רשמי במבנה מכתב — הנדון "אישור יתרות ל-31.12...", עם חתימה וחותמת הבנק, ומקטעים נפרדים ליתרות חשבונות עו"ש, לניירות ערך (הרכב הפיקדון ושוויו) ולהלוואות; אישור אחד כזה עשוי לכסות באותו קובץ גם את תיק ניירות הערך ואת ההלוואות של אותו חשבון, והוא קביל גם עבור השורות ההן. (ב) "דוח שנתי מקוצר" — כותרת "דוח מקוצר לשנת..." עם "כל הנתונים נכונים ליום 31.12" וחלק יתרות ליום 31.12 (יתרת עו"ש, ניירות ערך, סה"כ נכסים). (ג) "תעודת זהות בנקאית" / ריכוז יתרות ליום 31.12. השדה המהותי: יתרת העו"ש והפיקדונות ליום 31.12 של שנת המס; יתרה אפסית או שלילית (משיכת יתר) היא לגיטימית — חלץ אותה כמות שהיא. שים לב: יתרת משכנתא בדרך כלל אינה כלולה באישור היתרות ונדרש לה אישור נפרד מבנק המשכנתאות. אינו קביל: תדפיס תנועות עו"ש או דף חשבון שאינם מציגים יתרה ליום 31.12.',
    discoveryQuestionHe: 'באילו בנקים מתנהלים חשבונותיך, וכמה חשבונות יש לך בכל בנק?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'securities_portfolio',
    institutionBound: true,
    shortNameHe: 'תיק ניירות ערך',
    nameHe: 'תדפיס תיק ניירות ערך ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרה או דוח אחזקות של תיק ניירות הערך ליום 31.12.{{tax_year}} — מהבנק או מבית ההשקעות (אקסלנס, מיטב, IBI וכו\'), לכל תיק בנפרד. מתקבל גם דוח הפעילות השנתי של בית ההשקעות, ובלבד שתקופתו מסתיימת ביום 31.12.{{tax_year}} והוא מציג את שווי הנכסים ליום זה. בהצהרה מצוינת יתרת התיק המנוהל.',
    // Seeded from a real office sample (דוח פעילות שנתי — אינטראקטיב ישראל, חשבון במטבע בסיס USD).
    analysisHintHe:
      'שתי צורות קבילות: (א) אישור יתרה או דוח אחזקות ליום 31.12 מהבנק או מבית ההשקעות. (ב) דוח פעילות שנתי של בית השקעות ("דוח פעילות" לתקופה ינואר–דצמבר) — קביל כשהתקופה מסתיימת ב-31 בדצמבר של שנת המס. בדוח כזה השדה המהותי הוא סה"כ שווי הנכסים נטו (NAV) במקטע "שווי נכסים נטו", בעמודת 31 בדצמבר של שנת המס — הטבלה מציגה לרוב גם עמודת השוואה ל-31 בדצמבר של השנה הקודמת, ואין לחלץ ממנה. שים לב למטבע הבסיס של החשבון (מופיע בפרטי החשבון, למשל USD) — חלץ את השווי בציון המטבע, אל תניח שהוא בש"ח; שווי נמוך הוא לגיטימי. עמודי סיכומי הביצועים, הרווח/הפסד והעמלות שבהמשך הדוח אינם השדה המהותי. אינו קביל: דוח פעילות לתקופה שאינה מסתיימת ב-31 בדצמבר של שנת המס, או דוח רבעוני.',
    discoveryQuestionHe: 'האם יש לך תיק ניירות ערך או חשבון השקעות בבנק או בבית השקעות?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'pension_provident',
    institutionBound: true,
    employerBound: true,
    shortNameHe: 'קופת גמל / פנסיה',
    nameHe: 'אישור יתרות קופות גמל ופנסיה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור ייעודי להצהרת הון (מופק מהאזור האישי באתר הקופה) או העמוד האחרון של הדוח השנתי המקוצר, המשקף את היתרה הצבורה בכל קופת גמל וקרן פנסיה (כולל קופת גמל להשקעה) ליום 31.12.{{tax_year}} — כולל קופות של בן/בת הזוג. חשבונות "חיסכון לכל ילד" אינם דורשים אישור כלל (מופקדים על ידי ביטוח לאומי).',
    analysisHintHe: SAVINGS_CERTIFICATE_HINT_HE,
    discoveryQuestionHe: 'באילו קופות גמל וקרנות פנסיה אתה חבר?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'study_fund',
    institutionBound: true,
    employerBound: true,
    shortNameHe: 'קרן השתלמות',
    nameHe: 'אישור יתרת קרן השתלמות ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרה צבורה מכל קרן השתלמות ליום 31.12.{{tax_year}} — אישור ייעודי להצהרת הון מאתר הקופה או העמוד האחרון של הדוח השנתי המקוצר.',
    analysisHintHe: SAVINGS_CERTIFICATE_HINT_HE,
    discoveryQuestionHe: 'האם יש לך קרן השתלמות אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'life_insurance_savings',
    institutionBound: true,
    shortNameHe: 'ביטוח מנהלים / פוליסת חיסכון',
    nameHe: 'אישור להצהרת הון — ביטוח מנהלים / פוליסת חיסכון ליום 31.12.{{tax_year}}',
    descriptionHe:
      'לכל פוליסה בחברת ביטוח הכוללת מרכיב חיסכון (ביטוח מנהלים, פוליסת חיסכון) — אישור ייעודי להצהרת הון מהאזור האישי באתר חברת הביטוח, או העמוד האחרון של הדוח השנתי המקוצר, ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם יש לך ביטוח מנהלים או פוליסת חיסכון בחברת ביטוח, ובאילו חברות?',
    analysisHintHe: SAVINGS_CERTIFICATE_HINT_HE,
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'real_estate',
    shortNameHe: 'נכס נדל"ן',
    nameHe: 'מסמכי נכס נדל"ן',
    descriptionHe:
      'לכל נכס נדל"ן בבעלותך (דירה, בית, מגרש, נכס מסחרי), בארץ או בחו"ל, כולל בבעלות חלקית — בהצהרה מצוינים סוג הנכס, כתובת מלאה ועלות הרכישה. ' +
      'המטרה לכל נכס: הוכחת הבעלות והוכחת עלות הרכישה (בירושה ובמתנה — הבעלות בלבד, הנכס מדווח ב-1 ש"ח). המסמכים שמוכיחים זאת, לפי אופן קבלת הנכס: ' +
      'נכס שנרכש יד שנייה — חוזה רכישה בלבד. ' +
      'נכס שנרכש מקבלן — חוזה רכישה + נספח תשלומים (השניים יחידה אחת); אם עד יום 31.12.{{tax_year}} הדירה טרם נמסרה וטרם שולם עליה התשלום האחרון ("על הנייר") — חובה גם דוח מצבת תשלומים / אישור תשלומים מהקבלן או היזם, המציג כמה שולם בפועל עד כה וכמה נותר לתשלום. ' +
      'אם צוין רק שהנכס נרכש, בלי לציין יד שנייה או קבלן — חוזה רכישה בלבד, והשיחה תברר רק אם אין נייר מאושר שמכריע (חוזה מאושר שבו המוכר אדם פרטי = יד שנייה; המוכר קבלן או חברה = מקבלן). ' +
      'חלופה שנייה, רק כשהלקוח אינו מוצא את חוזה הרכישה (בדרך כלל ברכישה ישנה) או את נספח התשלומים ברכישה מקבלן: במקום מסמכי הרכישה — שומת מס רכישה מהאזור האישי באתר רשות המסים + נסח טאבו. אם בשומה לא מופיעה עלות הרכישה (נדיר) — במקום השומה: הצהרת עלות חתומה — הלקוח כותב על דף כמה לפי הערכתו שילם על הנכס וחותם — לצד נסח הטאבו. ' +
      'נכס בירושה — צו ירושה + נסח טאבו; נכס במתנה — נסח טאבו עדכני בלבד; בשני המקרים הנכס מדווח בעלות נומינלית של 1 ש"ח. ' +
      'נכס שכבר נכלל בהצהרת הון קודמת שנערכה במשרדנו — אין צורך במסמכים מחדש: העלות והחוזה שמורים במערכת המשרד.',
    discoveryQuestionHe:
      'אילו נכסי נדל"ן רשומים על שמך, בארץ או בחו"ל, כולל בבעלות חלקית? לכל נכס נדרשת הוכחת בעלות והוכחת עלות רכישה; לגבי כל נכס: כיצד התקבל (נרכש יד שנייה / נרכש מקבלן — ואם מקבלן, האם נמסר ושולם במלואו עד 31.12 / ירושה / מתנה), והאם הוא כבר נכלל בהצהרת הון קודמת שנערכה במשרדנו?',
    multiInstance: true,
    dateDependent: false,
    papers: REAL_ESTATE_PAPERS,
  },
  {
    key: 'mortgage_balance',
    institutionBound: true,
    shortNameHe: 'משכנתא',
    nameHe: 'אישור יתרת משכנתא ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת הלוואת משכנתא (יתרת החוב ליום 31.12.{{tax_year}}) מהבנק או מהגוף המלווה, לכל משכנתא בנפרד — בדרך כלל אישור היתרות לסוף שנה שהבנק מפיק. המשכנתא אינה כלולה באישור יתרות העו"ש הרגיל — נדרש לה אישור נפרד.',
    // Seeded from a real office sample (מזרחי-טפחות — "אישור על יתרת קרן בתיק").
    analysisHintHe:
      'אנטומיית אישור יתרת משכנתא: מכתב קצר מהבנק המלווה, לעיתים בנדון "אישור על יתרת קרן בתיק", ולעיתים עם טבלת יתרות רב-שנתית — "יתרת קרן" לכל 31.12 של כמה שנים ברצף. השדה המהותי הוא היתרה בשורת 31.12 של שנת המס בלבד — אל תחלץ יתרה של שנה אחרת, ואל תבלבל את תאריך ההפקה של המכתב (בראש הדף) עם תאריך היתרה. היתרה עשויה להיות מסומנת "יתרת קרן" בלי הפרשי הצמדה וחיובים נוספים — זה קביל; נוסח כמו "מסמך זה משמש כאישור למס הכנסה" מחזק את הזיהוי. אינו קביל: לוח סילוקין או דוח תשלומים חודשי במקום אישור יתרה לסוף השנה, ואישור יתרות עו"ש רגיל שאינו מציג את המשכנתא.',
    discoveryQuestionHe: 'האם יש לך משכנתא אחת או יותר?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'loan_taken',
    shortNameHe: 'הלוואה',
    nameHe: 'אישור יתרת הלוואה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת הלוואה ליום 31.12.{{tax_year}} לכל הלוואה פעילה שאינה משכנתא — מבנק, מחברת אשראי או מגוף חוץ-בנקאי (מקס, הראל, כלל וכו\'), וכן הלוואה פרטית — בציון שם הגוף המלווה.',
    discoveryQuestionHe: 'האם יש לך הלוואות פעילות מלבד משכנתא (בנק, כרטיס אשראי, הלוואה פרטית)?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'loan_given',
    shortNameHe: 'הלוואה שניתנה',
    nameHe: 'אסמכתא להלוואה שניתנה — יתרה ליום 31.12.{{tax_year}}',
    descriptionHe:
      'הסכם הלוואה חתום או פסק דין לכל הלוואה או חוב שאחרים חייבים לך (כולל הלוואות לבני משפחה או לחברה בבעלותך) — בציון זהות החייב, סכום החוב והיתרה ליום 31.12.{{tax_year}}.',
    discoveryQuestionHe: 'האם מישהו חייב לך כסף — הלוואות שנתת לאנשים פרטיים, לבני משפחה או לעסק?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'vehicle',
    shortNameHe: 'כלי רכב',
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
  },
  {
    key: 'contents_insurance',
    shortNameHe: 'ביטוח תכולה',
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
  },
  {
    key: 'business_ownership',
    shortNameHe: 'בעלות בעסק או בחברה',
    nameHe: 'אסמכתת בעלות בעסק או בחברה',
    descriptionHe:
      'לכל חברה שאתה מחזיק במניותיה (בבעלות מלאה או חלקית): כרטיס חו"ז בעלים מעודכן מהנהלת החשבונות של החברה — בהצהרה מצוינים שם החברה, מספר הח"פ ואחוז האחזקה. לעסק שאינו חברה: תדפיס רשם החברות או הסכם מייסדים, ומאזן ליום 31.12.{{tax_year}} אם קיים.',
    discoveryQuestionHe: 'האם אתה בעלים, שותף או בעל מניות בעסק או בחברה כלשהי?',
    multiInstance: true,
    dateDependent: false,
  },
  {
    key: 'crypto',
    shortNameHe: 'מטבעות דיגיטליים',
    nameHe: 'דוח אחזקות מטבעות דיגיטליים ליום 31.12.{{tax_year}}',
    descriptionHe:
      'אישור יתרת מטבעות מכל זירת מסחר או ארנק דיגיטלי (ביטקוין וכדומה) ליום 31.12.{{tax_year}} — בציון כמות המטבעות, סוגם ושווי השוק ליום זה.',
    discoveryQuestionHe: 'האם אתה מחזיק מטבעות דיגיטליים (קריפטו), ובאילו זירות או ארנקים?',
    multiInstance: true,
    dateDependent: true,
  },
  {
    key: 'private_investment',
    shortNameHe: 'השקעה פרטית',
    nameHe: 'אסמכתת השקעה פרטית',
    descriptionHe:
      'כרטיס הנהלת חשבונות או כרטיס חו"ז בתאגיד, המוכיח את גובה ההשקעה, לכל השקעה פרטית (שאינה ניירות ערך) בחברה, בתאגיד או במיזם, בארץ או בחו"ל — בהצהרה מצוין הסכום שהושקע. בהיעדרם — הסכם ההשקעה.',
    discoveryQuestionHe: 'האם יש לך השקעה פרטית (שאינה ניירות ערך) בחברה או בתאגיד, בארץ או בחו"ל?',
    multiInstance: true,
    dateDependent: false,
  },
  {
    key: 'poa_account',
    shortNameHe: 'חשבון ביפוי כוח',
    nameHe: 'אישור ניהול חשבון — יפוי כוח',
    descriptionHe:
      'אישור ניהול חשבון לכל חשבון בנק של אדם אחר (למשל הורים או ילדים) שבו הינך מורשה חתימה, מיופה כוח או אפוטרופוס — החשבון נרשם בהצהרה בערך נומינלי של 1 ש"ח, כדי למנוע כפילויות בהצלבות המידע של רשות המסים ולהבהיר שהכסף אינו שלך.',
    discoveryQuestionHe: 'האם אתה מורשה חתימה, מיופה כוח או אפוטרופוס בחשבון בנק של אדם אחר?',
    multiInstance: true,
    dateDependent: false,
  },
  {
    key: 'prior_declaration',
    shortNameHe: 'הצהרת הון קודמת',
    nameHe: 'הצהרת הון קודמת',
    descriptionHe:
      'עותק של הצהרת ההון האחרונה שהוגשה לרשות המסים — נדרש רק אם ההצהרה הקודמת נערכה במשרד אחר. הצהרה קודמת שנערכה במשרדנו כבר שמורה במערכת המשרד ואין צורך שהלקוח ישלח אותה.',
    discoveryQuestionHe:
      'האם זו הצהרת ההון הראשונה שלך? אם כבר הגשת בעבר — האם ההצהרה הקודמת נערכה במשרדנו או במשרד אחר?',
    multiInstance: false,
    dateDependent: false,
  },
  {
    key: 'other_assets',
    shortNameHe: 'נכסים או התחייבויות נוספים',
    nameHe: 'נכסים או התחייבויות נוספים',
    descriptionHe:
      'אסמכתת עלות רכישה לכל נכס או התחייבות בעלי ערך משמעותי שאינם מכוסים בסעיפים האחרים (יאכטה, מטוס, שינויים מבניים בנכס וכדומה), או לכל הפחות תיאור מפורט להערה בדוח — הסעיף קיים כדי ששום נכס לא יישאר מחוץ להצהרה.',
    discoveryQuestionHe: 'האם יש לך נכס או התחייבות משמעותיים נוספים שלא נשאלת עליהם?',
    multiInstance: true,
    dateDependent: false,
  },
] as const;

const BY_KEY = new Map(CAPITAL_DOCUMENT_CATALOG.map((t) => [t.key, t]));

export function getCatalogType(key: string): CapitalDocumentType | undefined {
  return BY_KEY.get(key);
}

/** Every paper of the catalog with the type that declares it (openspec `document-papers`). */
const PAPERS_BY_KEY = new Map<string, { paper: CatalogPaper; typeKey: string }>(
  CAPITAL_DOCUMENT_CATALOG.flatMap((t) => (t.papers ?? []).map((paper) => [paper.key, { paper, typeKey: t.key }] as const)),
);

/** All paper keys across the catalog — the closed enum the classifier and the item schemas use. */
export const CAPITAL_DOCUMENT_PAPER_VALUES: readonly string[] = [...PAPERS_BY_KEY.keys()];

/** The paper with this key, from any type; undefined for unknown keys. */
export function getCatalogPaper(key: string | null | undefined): CatalogPaper | undefined {
  return key ? PAPERS_BY_KEY.get(key)?.paper : undefined;
}

/** The papers a type declares — empty for a type without papers or an unknown / ad-hoc type. */
export function papersOf(typeKey: string | null | undefined): readonly CatalogPaper[] {
  return typeKey ? (getCatalogType(typeKey)?.papers ?? []) : [];
}

/** Whether `typeKey` declares the paper `paperKey` (false when either is unknown). */
export function paperBelongsToType(paperKey: string | null | undefined, typeKey: string | null | undefined): boolean {
  if (!paperKey || !typeKey) return false;
  return PAPERS_BY_KEY.get(paperKey)?.typeKey === typeKey;
}

/**
 * Why an instance's paper is not acceptable for its type (openspec
 * `document-papers`), or null when it is: a type with papers needs one of its
 * own papers; a type without papers takes none. Shared by the questionnaire
 * mapping gate and the planner's decision gate.
 */
export function instancePaperFault(paperKey: string | null | undefined, typeKey: string | null | undefined): string | null {
  const papers = papersOf(typeKey);
  if (papers.length === 0) {
    return paperKey ? `paper "${paperKey}" on a type without papers` : null;
  }
  if (!paperKey) return `instance names no paper (one of: ${papers.map((p) => p.key).join(', ')})`;
  if (!paperBelongsToType(paperKey, typeKey)) return `paper "${paperKey}" is not a paper of type "${typeKey}"`;
  return null;
}

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

/** Whether items of this type name one issuing company that code can compare (false for unknown / ad-hoc types). */
export function isInstitutionBound(typeKey: string | null | undefined): boolean {
  return typeKey ? (getCatalogType(typeKey)?.institutionBound ?? false) : false;
}

/** Whether a fund of this type is opened per employer, so its report names one (false for unknown / ad-hoc types). */
export function isEmployerBound(typeKey: string | null | undefined): boolean {
  return typeKey ? (getCatalogType(typeKey)?.employerBound ?? false) : false;
}
