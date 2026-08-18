import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'מדיניות פרטיות — FiscalMind',
  description:
    'מדיניות הפרטיות של FiscalMind: איזה מידע נאסף, כיצד הוא משמש להפעלת שירותי הסוכנים החכמים למשרדי רואי חשבון, ומהן זכויותיכם.',
}

const CONTACT_NAME = 'ישראל קריטי'
const CONTACT_EMAIL = 'admin@fiscalmind.app'
const CONTACT_PHONE_DISPLAY = '050-683-9593'
const CONTACT_PHONE_TEL = '+972506839593'
const CONTACT_ADDRESS = 'דרך ההר 251, יבנאל'

export default function PrivacyPolicy() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        דלגו לתוכן הראשי
      </a>

      <header className="border-b border-[#1E1E2E] bg-[#0A0A0F]">
        <nav aria-label="ניווט ראשי" className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5 select-none" aria-label="FiscalMind — חזרה לדף הבית">
            <img src="/petal-seal.svg" alt="" className="w-7 h-7 rounded-lg" />
            <span className="shimmer-text text-xl font-extrabold tracking-tight">FiscalMind</span>
          </a>
          <a href="/" className="text-sm text-[#94A3B8] hover:text-white transition-colors">
            → חזרה לדף הבית
          </a>
        </nav>
      </header>

      <main id="main-content" className="bg-[#0A0A0F] min-h-screen py-16">
        <article className="max-w-3xl mx-auto px-6 text-[#94A3B8] leading-relaxed">
          <h1 className="text-4xl font-extrabold text-white mb-8">מדיניות פרטיות</h1>

          <p className="mb-6">
            FiscalMind (״אנחנו״, ״השירות״) מפעילה פלטפורמת סוכנים חכמים למשרדי רואי חשבון,
            הזמינה בכתובת agent.fiscalmind.app, לצד אתר תדמית זה. מדיניות זו מסבירה איזה
            מידע נאסף במסגרת השירות, כיצד הוא משמש אותנו, עם מי הוא משותף ומהן זכויותיכם.
            השימוש בשירות מהווה הסכמה למדיניות זו.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">איזה מידע אנחנו אוספים</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>
              <strong className="text-white">מידע על משרד רואה החשבון (הלקוח שלנו):</strong> שם, כתובת דוא״ל
              (באמצעות התחברות Google), פרטי חיבור לחשבונות monday.com ו־Google שבחר המשרד לחבר.
            </li>
            <li>
              <strong className="text-white">מידע על לקוחות המשרד:</strong> פרטי קשר (שם, דוא״ל, טלפון),
              מסמכים שנמסרים במסגרת איסוף החומר (למשל טופסי 106, אישורי פנסיה וקרנות השתלמות),
              ותוכן ההתכתבות עם הסוכן בדוא״ל ובוואטסאפ.
            </li>
            <li>
              <strong className="text-white">מידע תפעולי:</strong> יומני מערכת (לוגים) ונתוני שימוש הנדרשים
              לאבטחה, לניטור תקלות ולתחזוקת השירות.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">מהיכן מגיע המידע</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>ממשרד רואה החשבון — למשל רשימות לקוחות בלוחות monday או בגיליונות Google שהמשרד חיבר.</li>
            <li>מהלקוח עצמו — הודעות וקבצים שהוא שולח לסוכן בדוא״ל או בוואטסאפ.</li>
            <li>
              מפורטלים חיצוניים (כגון רשות המסים וגופים פנסיוניים) — רק לבקשת הלקוח ובהסכמתו,
              באמצעות קוד אימות חד־פעמי שהלקוח מוסר בעצמו.
            </li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">למה המידע משמש</h2>
          <p className="mb-6">
            המידע משמש אך ורק להפעלת השירות: ניהול איסוף מסמכים, שליחת בקשות ותזכורות ללקוחות,
            זיהוי ותיוג מסמכים, הצגת סטטוס למשרד רואה החשבון, אבטחה ומניעת שימוש לרעה. איננו
            מוכרים מידע אישי, איננו משתמשים בו לפרסום, ואיננו מעבירים אותו לגורמים שאינם חלק
            מהפעלת השירות.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">ספקי משנה (מעבדי מידע)</h2>
          <p className="mb-2">השירות נשען על ספקי תשתית מוכרים, וכל אחד מהם מקבל רק את המידע הנדרש לתפקידו:</p>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>Microsoft Azure — אחסון ותשתית ענן (אזור ישראל).</li>
            <li>Twilio ו־Meta (WhatsApp Business Platform) — שליחה וקבלה של הודעות וואטסאפ.</li>
            <li>Google — התחברות לחשבון, גישה לקבצים שהמשרד בחר לשתף, ועיבוד מבוסס בינה מלאכותית (Gemini).</li>
            <li>monday.com — קריאת נתוני לוחות שהמשרד חיבר.</li>
            <li>Resend — שליחת דוא״ל מטעם הסוכן.</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">הודעות וואטסאפ</h2>
          <p className="mb-6">
            השימוש בערוץ הוואטסאפ נעשה באמצעות WhatsApp Business Platform. פנייה ראשונה ללקוח
            נעשית בתבניות הודעה שאושרו מראש, בהתאם לכללי הפלטפורמה. לקוח שאינו מעוניין בהמשך
            התכתבות יכול לבקש זאת בכל עת בתשובה לסוכן או בפנייה למשרד רואה החשבון המטפל בו,
            והפניות אליו יופסקו.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">אבטחת מידע</h2>
          <p className="mb-6">
            המידע מוצפן בתעבורה (HTTPS/TLS) ומאוחסן בתשתיות ענן מאובטחות; סודות ופרטי גישה
            רגישים מוצפנים גם במנוחה. הגישה למידע מוגבלת לפי הרשאות, וכל פעולה מהותית במערכת
            נרשמת ביומן ביקורת. אף מערכת אינה חסינה לחלוטין, אך אנו פועלים לפי נהלים מקובלים
            בתעשייה לצמצום הסיכון.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">שמירת מידע ומחיקתו</h2>
          <p className="mb-6">
            המידע נשמר כל עוד המשרד מנוי על השירות וכנדרש להפעלתו. משרד רואה חשבון רשאי לבקש
            את מחיקת נתוניו ונתוני לקוחותיו בסיום ההתקשרות, ואנו נמחק אותם בתוך זמן סביר,
            למעט מידע שחובה לשמרו על פי דין.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">זכויותיכם</h2>
          <p className="mb-6">
            בהתאם לחוק הגנת הפרטיות, התשמ״א–1981, עומדת לכם הזכות לעיין במידע המוחזק עליכם,
            לבקש את תיקונו או את מחיקתו. לקוח של משרד רואה חשבון המבקש לממש זכויות אלו יכול
            לפנות אלינו ישירות או באמצעות המשרד המטפל בו.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">עוגיות (Cookies)</h2>
          <p className="mb-6">
            אתר התדמית אינו עושה שימוש בעוגיות פרסום או מעקב. פלטפורמת השירות משתמשת בעוגיות
            חיוניות בלבד, לצורך ניהול התחברות מאובטחת (Session).
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">שינויים במדיניות</h2>
          <p className="mb-6">
            אנו עשויים לעדכן מדיניות זו מעת לעת. הנוסח המעודכן יפורסם בעמוד זה, ותאריך העדכון
            האחרון יופיע בתחתיתו.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">יצירת קשר</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>אחראי: {CONTACT_NAME}</li>
            <li>כתובת: {CONTACT_ADDRESS}</li>
            <li>
              טלפון:{' '}
              <a href={`tel:${CONTACT_PHONE_TEL}`} className="text-blue-400 hover:text-blue-300 underline" dir="ltr">
                {CONTACT_PHONE_DISPLAY}
              </a>
            </li>
            <li>
              דוא״ל:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">
                {CONTACT_EMAIL}
              </a>
            </li>
          </ul>

          <section dir="ltr" className="text-left border-t border-[#1E1E2E] mt-12 pt-10">
            <h2 className="text-2xl font-bold text-white mb-4">Privacy Policy — English Summary</h2>
            <p className="mb-4">
              FiscalMind operates an AI-agent platform for accounting firms (agent.fiscalmind.app). We collect:
              account details of the accounting firm (name, email, connected monday.com / Google accounts); contact
              details, documents, and message content of the firm&apos;s clients, gathered while collecting tax
              documents on the firm&apos;s behalf over email and WhatsApp; and operational logs.
            </p>
            <p className="mb-4">
              Data is used solely to operate the service — requesting, receiving, and organizing documents and
              showing their status to the firm. We do not sell personal data or use it for advertising. Processing
              relies on Microsoft Azure (hosting, Israel region), Twilio and Meta (WhatsApp Business Platform),
              Google (sign-in, shared files, Gemini AI), monday.com, and Resend (email). Documents are fetched from
              external portals (e.g., the Israel Tax Authority) only at the client&apos;s request, using a one-time
              code the client provides.
            </p>
            <p className="mb-4">
              Data is encrypted in transit, sensitive credentials are encrypted at rest, and access is logged. Data
              is retained while the firm uses the service and deleted on request, except where retention is required
              by law. To exercise access, correction, or deletion rights, contact{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-400 hover:text-blue-300 underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>

          <p className="text-[#7E8CA0] text-sm mt-12">מדיניות הפרטיות עודכנה לאחרונה בתאריך: 17 באוגוסט 2026.</p>
        </article>
      </main>
    </>
  )
}
