/**
 * The banks, fund managers, insurers and brokers whose names code recognises on
 * a received file and in a list item's name (institutions.ts, openspec
 * `unlisted-files`).
 *
 * Built from the public registers, not from memory — the full research output,
 * with the source of every entry, is docs/institutions-register.md. Sources
 * (all read on INSTITUTIONS_AS_OF):
 *  - Capital Market, Insurance and Savings Authority open datasets on
 *    data.gov.il: Gemel-Net (dataset/gemelnet), Pensia-Net (dataset/pensia-net),
 *    Bituach-Net (dataset/insurance);
 *  - Bank of Israel on data.gov.il: list of banking corporations (dataset/375)
 *    and the branch register (dataset/branches);
 *  - Companies Registrar (dataset/ica_companies) for registered English names;
 *  - TASE clearing-house member list (TASE guide PDF, January 2026);
 *  - amitim.com for four old pension funds missing from the regulator data.
 *
 * One entry per brand a client and a document both use, not per legal entity:
 * "הראל פנסיה וגמל" and "הראל חברה לביטוח" share the key `harel`, because a
 * list item says "בהראל" and the document type already separates a pension
 * report from an insurance policy. Aliases are matched as whole words (a
 * Hebrew alias also after one or two prefix letters), and a longer alias wins
 * over a shorter one it contains — so "יהב אחים ואחיות" is not Bank Yahav and
 * "מור מנורה מבטחים" is Menora, not More. A bare alias that is an everyday
 * word ("אש", "גל", "מחר", "יחד", "ישיר", "more", "fair") is left out on purpose.
 *
 * A company that merged keeps its old name only where the registers show where
 * its funds went (Otsar Ha-Hayal and PAGI → First International). Refreshing
 * the table is an edit of this file plus INSTITUTIONS_AS_OF.
 */

/** One bank / fund manager / insurer and every name form it appears under. */
export interface Institution {
  key: string;
  /** Display name (English) for notes and step details. */
  name: string;
  /** Hebrew and English name forms, matched as whole words. */
  aliases: string[];
}

/** The date the registers were read. */
export const INSTITUTIONS_AS_OF = '2026-09-19';

export const INSTITUTIONS: readonly Institution[] = [
  // ── Banks (Bank of Israel list of banking corporations) ──
  { key: 'bank_esh', name: 'Bank Esh', aliases: ['בנק אש', 'Bank Esh'] },
  { key: 'bank_discount', name: 'Discount Bank', aliases: ['בנק דיסקונט', 'דיסקונט', 'Israel Discount Bank', 'Discount Bank', 'Discount'] },
  {
    key: 'fibi',
    name: 'First International Bank',
    aliases: [
      'הבנק הבינלאומי הראשון',
      'הבינלאומי הראשון',
      'הבנק הבינלאומי',
      'הבינלאומי',
      'בינלאומי',
      'First International Bank',
      'FIBI',
      // Merged into the First International (branch register: closed branches point to bank 31).
      'בנק אוצר החייל',
      'אוצר החייל',
      'בנק פועלי אגודת ישראל',
      'פועלי אגודת ישראל',
    ],
  },
  { key: 'bank_hapoalim', name: 'Bank Hapoalim', aliases: ['בנק הפועלים', 'הפועלים', 'פועלים', 'Bank Hapoalim', 'Hapoalim'] },
  { key: 'bank_yahav', name: 'Bank Yahav', aliases: ['בנק יהב', 'יהב', 'Bank Yahav', 'Yahav'] },
  { key: 'bank_jerusalem', name: 'Bank of Jerusalem', aliases: ['בנק ירושלים', 'Bank of Jerusalem'] },
  { key: 'bank_leumi', name: 'Bank Leumi', aliases: ['בנק לאומי', 'לאומי', 'Bank Leumi', 'Leumi'] },
  {
    key: 'mizrahi_tefahot',
    name: 'Mizrahi Tefahot',
    aliases: ['בנק מזרחי טפחות', 'מזרחי טפחות', 'בנק מזרחי', 'מזרחי', 'טפחות', 'Mizrahi Tefahot', 'Mizrahi', 'Tefahot'],
  },
  { key: 'bank_massad', name: 'Bank Massad', aliases: ['בנק מסד', 'מסד', 'Bank Massad', 'Massad'] },
  {
    key: 'mercantile_discount',
    name: 'Mercantile Discount Bank',
    aliases: ['בנק מרכנתיל דיסקונט', 'מרכנתיל דיסקונט', 'בנק מרכנתיל', 'מרכנתיל', 'Mercantile Discount Bank', 'Mercantile Discount', 'Mercantile'],
  },
  { key: 'one_zero', name: 'One Zero', aliases: ['וואן זירו', 'One Zero'] },
  { key: 'ubank', name: 'U-Bank', aliases: ['יו בנק', 'U-Bank'] },
  { key: 'barclays', name: 'Barclays', aliases: ['Barclays Bank', 'Barclays'] },
  { key: 'citibank', name: 'Citibank', aliases: ['Citibank'] },
  { key: 'hsbc', name: 'HSBC', aliases: ['HSBC'] },
  { key: 'sbi', name: 'State Bank of India', aliases: ['State Bank of India', 'SBI'] },

  // ── Fund managers, insurers and brokers open to the public (Gemel-Net, Pensia-Net, Bituach-Net, TASE members) ──
  { key: 'actaeon', name: 'Actaeon', aliases: ['אקטיון', 'Actaeon'] },
  {
    key: 'altshuler_shaham',
    name: 'Altshuler Shaham',
    aliases: ['אלטשולר שחם גמל ופנסיה', 'אלטשולר שחם טרייד', 'אלטשולר שחם', 'אלטשולר', 'Altshuler Shaham', 'Altshuler'],
  },
  { key: 'analyst', name: 'Analyst', aliases: ['אנליסט קופות גמל', 'אנליסט', 'Analyst Provident Funds', 'Analyst'] },
  { key: 'ayalon', name: 'Ayalon', aliases: ['איילון קופות גמל', 'איילון חברה לביטוח', 'איילון', 'Ayalon'] },
  {
    key: 'clal',
    name: 'Clal',
    aliases: [
      'כלל פנסיה וגמל',
      'כלל חברה לביטוח',
      'כלל ביטוח',
      'כלל',
      'Clal Pension and Provident Funds',
      'Clal Insurance',
      'Clal',
      'בר קרן גמולים',
      'הדס קופה מרכזית לפיצויים',
    ],
  },
  { key: 'globalnet', name: 'Globalnet', aliases: ['גלובלנט', 'גלובל נט'] },
  { key: 'harel', name: 'Harel', aliases: ['הראל פנסיה וגמל', 'הראל חברה לביטוח', 'הראל ביטוח', 'הראל', 'Harel Insurance', 'Harel'] },
  { key: 'infinity', name: 'Infinity', aliases: ['אינפיניטי השתלמות גמל ופנסיה', 'אינפיניטי'] },
  {
    key: 'meitav',
    name: 'Meitav',
    aliases: ['מיטב גמל ופנסיה', 'מיטב טרייד', 'מיטב דש', 'מיטב', 'Meitav Provident Funds and Pension', 'Meitav Trade', 'Meitav'],
  },
  {
    key: 'menora_mivtachim',
    name: 'Menora Mivtachim',
    aliases: [
      'מנורה מבטחים פנסיה וגמל',
      'מנורה מבטחים ביטוח',
      'מנורה מבטחים',
      'מנורה',
      // A Menora fund brand that contains the name of another house (More).
      'מור מנורה מבטחים',
      'מבטחים מרכזית לפיצויים',
      'Menora Mivtachim',
      'Menora',
    ],
  },
  {
    key: 'migdal',
    name: 'Migdal',
    aliases: ['מגדל מקפת קרנות פנסיה וקופות גמל', 'מגדל מקפת', 'מגדל חברה לביטוח', 'מגדל ביטוח', 'מגדל', 'Migdal Makefet', 'Migdal Insurance', 'Migdal'],
  },
  { key: 'mor', name: 'More', aliases: ['מור גמל ופנסיה', 'אלפא מור', 'מור', 'More Provident Funds and Pension', 'More Provident Funds', 'More Gemel'] },
  {
    key: 'phoenix',
    name: 'Phoenix',
    aliases: [
      'הפניקס פנסיה וגמל',
      'הפניקס חברה לביטוח',
      'הפניקס',
      'פניקס',
      'The Phoenix',
      'Phoenix',
      // Phoenix brands (Bituach-Net track names; TASE member of the same group).
      'הפניקס אקסלנס',
      'אקסלנס ניהול השקעות וניירות ערך',
      'אקסלנס',
      'Excellence Investments Management and Securities',
      'Excellence',
    ],
  },
  { key: 'slice', name: 'Slice', aliases: ['סלייס גמל', 'סלייס'] },
  { key: 'yelin_lapidot', name: 'Yelin Lapidot', aliases: ['ילין לפידות', 'Yelin Lapidot', 'Yelin-Lapidot'] },
  {
    key: 'hachshara',
    name: 'Hachshara',
    aliases: [
      'הכשרה חברה לביטוח',
      'הכשרה',
      'Hachshara',
      // Hachshara tracks run by outside managers: the insurer is still Hachshara.
      'הכשרה אלטשולר שחם',
      'הכשרה מנוהל באמצעות מור',
      'הכשרה מנוהל באמצעות מיטב',
      'הכשרה אנליסט',
    ],
  },
  { key: 'idi', name: 'IDI (Bituach Yashir)', aliases: ['איי די איי', 'אי די אי', 'ביטוח ישיר', 'I.D.I. Insurance', 'IDI Insurance'] },
  { key: 'fair_financial', name: 'Fair Financial Technologies', aliases: ['פייר פיננשיאל', 'Fair Financial'] },
  { key: 'psagot', name: 'Psagot', aliases: ['פסגות ניירות ערך', 'פסגות', 'Psagot Securities', 'Psagot'] },
  { key: 'ibi', name: 'IBI', aliases: ['אי בי אי', 'Israel Brokerage and Investments', 'IBI'] },

  // ── Sector and employer funds that manage themselves (Gemel-Net) ──
  { key: 'academics_social_sciences', name: 'Study fund for academics in social sciences and humanities', aliases: ['קרן השתלמות לאקדמאים במדעי החברה והרוח', 'אקדמאים במדעי החברה והרוח'] },
  { key: 'agur', name: 'Agur', aliases: ['עגור'] },
  { key: 'ami', name: 'AMI', aliases: ['עמ"י', 'AMI - Government Employees Provident Fund'] },
  { key: 'aram', name: 'Aram Gemulim', aliases: ['ארם גמולים', 'ארם'] },
  { key: 'balad', name: 'Balad', aliases: ['קופת בל"ד', 'בל"ד'] },
  { key: 'binyan_pension', name: 'Binyan pension fund', aliases: ['בניין קרן פנסיה', 'קרן הביטוח והפנסיה של פועלי בנין'] },
  { key: 'el_al_employees', name: 'El Al employees provident fund', aliases: ['גמל על', 'קופת תגמולים של עובדי אל על', 'קופת תגמולים לעובדי אל על'] },
  { key: 'gal_teachers', name: 'Gal (teachers)', aliases: ['גל ניהול קופות גמל לעובדי הוראה', 'קופת גמל גל', 'קופת גמל כלנית', 'גל קופ"ג להשקעה'] },
  { key: 'haifa_municipality', name: 'Haifa municipality employees fund', aliases: ['עובדי עירית חיפה', 'עובדי עיריית חיפה'] },
  { key: 'haklaim_pension', name: 'Haklaim pension fund', aliases: ['חקלאים קרן פנסיה', 'קרן ביטוח ופנסיה לפועלים חקלאים'] },
  {
    key: 'handesaim',
    name: 'Handesaim ve-Technaim',
    aliases: ['הנדסאים וטכנאים', 'קרן ההשתלמות להנדסאים וטכנאים', 'קרן השתלמות להנדסאים וטכנאים', 'קופת גמל הנדסאים', 'הנדסאים'],
  },
  { key: 'hebrew_university_employees', name: 'Hebrew University employees provident company', aliases: ['חברת הגמל לעובדי האוניברסיטה העברית', 'עובדי האוניברסיטה העברית'] },
  { key: 'iai_employees', name: 'Israel Aerospace Industries employees fund', aliases: ['עובדי התעשיה האוירית', 'עובדי התעשייה האווירית'] },
  { key: 'iec_employees_hishtalmut', name: 'Israel Electric employees study fund', aliases: ['קרן השתלמות של עובדי חברת החשמל', 'קרן השתלמות עובדי חברת החשמל'] },
  { key: 'judges_hishtalmut', name: 'Judges study fund', aliases: ['קרן השתלמות לשופטים'] },
  { key: 'jurists_hishtalmut', name: 'Jurists study fund', aliases: ['קרן השתלמות למשפטנים'] },
  { key: 'kahar', name: 'K.H.R. (pharmacists)', aliases: ['ק.ה.ר', 'קרן השתלמות לרוקחים'] },
  { key: 'kav_habriut', name: 'Kav Habriut', aliases: ['קו הבריאות'] },
  { key: 'tzva_keva_savings', name: 'Career army savings fund', aliases: ['קרן החסכון לצבא הקבע', 'קרן החיסכון לצבא הקבע'] },
  { key: 'kla', name: 'K.L.A. (social workers)', aliases: ['ק.ל.ע', 'קרן השתלמות לעובדים סוציאליים', 'קרן השתלמות לעובדים סוציאלים'] },
  { key: 'ksm', name: 'K.S.M. (biochemists)', aliases: ['ק.ס.מ', 'קרן השתלמות לביוכימאים ומקרוביולוגים'] },
  {
    key: 'leumi_employees',
    name: 'Bank Leumi employees provident funds',
    aliases: ['קופות התגמולים והפיצויים של עובדי בנק לאומי', 'קופת התגמולים של עובדי בנק לאומי', 'עובדי בנק לאומי', "Leumi Employees' Provident Fund"],
  },
  { key: 'leumi_kamap', name: 'Leumi Kamap', aliases: ['לאומי קמ"פ', 'לאומי קופה מרכזית לפיצויים'] },
  { key: 'machar', name: 'Machar', aliases: ['מחר חברה לניהול קופות גמל', 'מחר גמל', 'קופת גמל מחר'] },
  { key: 'machog', name: 'Machog', aliases: ['מחוג מינהל גמל לעובדי חברת חשמל', 'מחוג'] },
  { key: 'makefet_old', name: 'Makefet (old pension fund)', aliases: ['קרן מקפת', 'מקפת קרן פנסיה', 'מקפת'] },
  {
    key: 'minhal',
    name: 'Minhal study fund',
    aliases: ['מינהל קרן ההשתלמות לפקידים', 'קרן ההשתלמות לפקידים עובדי המנהל והשירותים', 'קרן ההשתלמות לפקידים עובדי המינהל והשירותים'],
  },
  { key: 'mivtachim_old', name: 'Mivtachim (old pension fund)', aliases: ['מבטחים מוסד לביטוח סוציאלי של העובדים', 'מבטחים קרן פנסיה', 'מבטחים'] },
  { key: 'omega', name: 'Omega (engineers)', aliases: ['מנורה מבטחים והסתדרות המהנדסים', 'אומגה קרן השתלמות', 'אומגה'] },
  { key: 'os_social_workers', name: 'O.S. (social workers provident fund)', aliases: ['קופת גמל עו"ס', 'עו"ס חברה לניהול קופות גמל'] },
  { key: 'otzam', name: 'Otzam', aliases: ['עוצ"מ', 'קרן השתלמות עוצ"מ'] },
  { key: 'reut', name: 'Reut', aliases: ['רעות קרן השתלמות', 'רעות'] },
  { key: 'rom', name: 'Rom', aliases: ['רום קרן ההשתלמות לעובדי הרשויות המקומיות', 'רום קרן השתלמות', 'קרן השתלמות רום', 'רום'] },
  { key: 'secondary_teachers_hishtalmut', name: 'Secondary-school teachers study funds', aliases: ['קרנות השתלמות למורים תיכוניים', 'קרן השתלמות למורים תיכוניים'] },
  { key: 'shibolet', name: 'Shibolet', aliases: ['שיבולת'] },
  { key: 'state_employees_hishtalmut', name: 'State employees study fund', aliases: ['קרן ההשתלמות לעובדי המדינה', 'קרן השתלמות לעובדי המדינה'] },
  { key: 'teachers_kindergarten_hishtalmut', name: 'Teachers and kindergarten teachers study funds', aliases: ['קרנות השתלמות למורים ולגננות', 'קרן השתלמות למורים וגננות', 'קרן השתלמות למורים ולגננות'] },
  {
    key: 'tel_aviv_municipality',
    name: 'Tel Aviv-Yafo municipality employees funds',
    aliases: ['העובדים בעיריית תל אביב יפו', 'העובדים בעירית תל אביב יפו', 'עובדים בעירית ת"א יפו', 'Workers of Tel Aviv-Yafo Municipality'],
  },
  { key: 'yachad_physicians', name: 'Yachad (physicians)', aliases: ['יחד רופאים', 'יחד קרן השתלמות לרופאים', 'Yachad Physicians'] },
  { key: 'yahav_nurses', name: 'Yahav (nurses study fund)', aliases: ['יהב אחים ואחיות', 'יהב קרן השתלמות וחיסכון לאחים ואחיות'] },
  { key: 'yahav_prh', name: 'Yahav P.R.H.', aliases: ['יהב פ.ר.ח', 'יהב קרן השתלמות וחסכון פ.ר.ח'] },

  // ── Old pension funds under Amitim (four of them from amitim.com only) ──
  { key: 'amitim', name: 'Amitim (old pension funds)', aliases: ['עמיתים קרנות הפנסיה הוותיקות', 'עמיתים', 'Amitim'] },
  { key: 'kgm_pension', name: 'KGM pension fund', aliases: ['קג"מ קרן פנסיה', 'קג"מ'] },
  { key: 'nativ_pension', name: 'Nativ pension fund', aliases: ['נתיב קרן פנסיה'] },
  { key: 'egged_pension', name: 'Egged pension fund', aliases: ['אגד קרן פנסיה'] },
  { key: 'hadassah_pension', name: 'Hadassah pension fund', aliases: ['הדסה קרן פנסיה'] },
];
