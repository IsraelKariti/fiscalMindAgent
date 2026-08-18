import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'תנאי שימוש — FiscalMind',
  description:
    'תנאי השימוש בשירותי FiscalMind: פלטפורמת סוכנים חכמים למשרדי רואי חשבון — היקף השירות, אחריות הצדדים, קניין רוחני וסיום התקשרות.',
}

const CONTACT_NAME = 'ישראל קריטי'
const CONTACT_EMAIL = 'admin@fiscalmind.app'
const CONTACT_PHONE_DISPLAY = '050-683-9593'
const CONTACT_PHONE_TEL = '+972506839593'
const CONTACT_ADDRESS = 'דרך ההר 251, יבנאל'

export default function TermsOfService() {
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
          <h1 className="text-4xl font-extrabold text-white mb-8">תנאי שימוש</h1>

          <p className="mb-6">
            ברוכים הבאים ל־FiscalMind (״השירות״, ״אנחנו״). תנאים אלה מסדירים את השימוש
            בפלטפורמת הסוכנים החכמים שלנו למשרדי רואי חשבון, הזמינה בכתובת
            agent.fiscalmind.app, ובאתר זה. השימוש בשירות מהווה הסכמה לתנאים אלה
            ולמדיניות הפרטיות שלנו.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">מהות השירות</h2>
          <p className="mb-6">
            FiscalMind מספקת למשרדי רואי חשבון סוכנים דיגיטליים מבוססי בינה מלאכותית,
            המסייעים במשימות תפעוליות — ובראשן איסוף מסמכים מלקוחות המשרד בדוא״ל ובוואטסאפ,
            ריכוזם ותיוגם. השירות הוא כלי עזר תפעולי בלבד: הוא אינו מחליף שיקול דעת מקצועי,
            אינו מייעץ ייעוץ מס או ייעוץ חשבונאי, והאחריות המקצועית כלפי לקוחות המשרד נותרת
            בידי משרד רואה החשבון בלבד.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">אחריות המשרד המשתמש</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>
              לוודא כי קיים בסיס חוקי לפנייה ללקוחות שהמשרד מזין לשירות (לרבות הסכמתם לקבלת
              פניות בדוא״ל ובוואטסאפ) וכי פרטי הקשר שנמסרו נכונים ועדכניים.
            </li>
            <li>לשמור על סודיות פרטי ההתחברות לחשבון ולא להעבירם לאחר.</li>
            <li>לבדוק את המסמכים והסטטוסים שהשירות מציג לפני הסתמכות מקצועית עליהם.</li>
            <li>להשתמש בשירות בהתאם לכל דין, לרבות דיני הגנת הפרטיות והספאם.</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">שימוש אסור</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>שליחת תוכן שיווקי או פוגעני באמצעות ערוצי הסוכן, או פנייה למי שאינו לקוח המשרד.</li>
            <li>ניסיון לעקוף את מנגנוני האבטחה של השירות, להעמיס עליו או לשבש את פעולתו.</li>
            <li>שימוש בשירות לאיסוף מידע ללא הרשאה או בניגוד לדין.</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">מידע ופרטיות</h2>
          <p className="mb-6">
            המידע שהמשרד מזין לשירות ומידע לקוחותיו נותרים בבעלות המשרד. אנו מעבדים אותם אך
            ורק לצורך הפעלת השירות, כמפורט ב
            <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline">
              מדיניות הפרטיות
            </a>
            . בסיום ההתקשרות ניתן לקבל עותק של המסמכים שנאספו ולבקש את מחיקת הנתונים.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">זמינות השירות</h2>
          <p className="mb-6">
            אנו פועלים לזמינות גבוהה של השירות, אך איננו מתחייבים לזמינות רציפה או נטולת
            תקלות. השירות נשען על ספקי צד שלישי (בהם Meta/WhatsApp, ‏Google‏, monday.com
            ו־Microsoft Azure), ושינויים או תקלות אצלם עשויים להשפיע על פעולתו. נעשה מאמץ
            סביר להודיע מראש על תחזוקה מתוכננת.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">קניין רוחני</h2>
          <p className="mb-6">
            כל הזכויות בשירות — לרבות התוכנה, העיצוב, הסימנים המסחריים והידע — שייכות
            ל־FiscalMind. המשרד מקבל רישיון שימוש אישי, מוגבל ובלתי ניתן להעברה, לתקופת
            ההתקשרות בלבד. אין בתנאים אלה כדי להקנות למשרד זכויות בשירות מעבר לכך.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">הגבלת אחריות</h2>
          <p className="mb-6">
            השירות מסופק כמות שהוא (As-Is). מבלי לגרוע מהוראות דין שאין להתנות עליהן,
            אחריותנו הכוללת בקשר עם השירות מוגבלת לסכום ששולם לנו בפועל בשנים־עשר החודשים
            שקדמו לאירוע, ולא נהיה אחראים לנזק עקיף, תוצאתי או אובדן רווחים. תוצרי בינה
            מלאכותית עשויים לכלול אי־דיוקים — באחריות המשרד לבדוק אותם לפני הסתמכות.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">סיום התקשרות</h2>
          <p className="mb-6">
            כל צד רשאי לסיים את ההתקשרות בהודעה בכתב. אנו רשאים להשעות חשבון המפר תנאים אלה,
            לאחר התראה סבירה ככל שהדבר אפשרי. עם סיום ההתקשרות יופסק השימוש בשירות, והמשרד
            יוכל לקבל את המסמכים שנאספו עבורו כמפורט לעיל.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">שונות</h2>
          <p className="mb-6">
            על תנאים אלה יחולו דיני מדינת ישראל, וסמכות השיפוט הבלעדית נתונה לבתי המשפט
            המוסמכים במחוז הצפון. אנו רשאים לעדכן תנאים אלה מעת לעת; הנוסח המעודכן יפורסם
            בעמוד זה ותאריך העדכון יצוין בתחתיתו. אם הוסכם בין הצדדים אחרת בהסכם נפרד בכתב
            (למשל הסכם פיילוט), יגבר ההסכם הנפרד.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">יצירת קשר</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>{CONTACT_NAME}</li>
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

          <p className="text-[#7E8CA0] text-sm mt-12">תנאי השימוש עודכנו לאחרונה בתאריך: 17 באוגוסט 2026.</p>
        </article>
      </main>
    </>
  )
}
