import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'הצהרת נגישות — FiscalMind',
  description:
    'הצהרת הנגישות של אתר FiscalMind בהתאם לתקן הישראלי ת״י 5568 ולהנחיות WCAG 2.1 ברמה AA.',
}

const COORDINATOR_NAME = 'עידו פרלמוטר'
const CONTACT_EMAIL = 'admin@fiscalmind.app'
const CONTACT_PHONE_DISPLAY = '054-968-6540'
const CONTACT_PHONE_TEL = '+972549686540'

export default function AccessibilityStatement() {
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
          <h1 className="text-4xl font-extrabold text-white mb-8">הצהרת נגישות</h1>

          <p className="mb-6">
            אנו ב־FiscalMind רואים חשיבות רבה במתן שירות שוויוני ונגיש לכלל הציבור, לרבות
            אנשים עם מוגבלות, ופועלים לאפשר לכל אדם לגלוש באתר בקלות, בנוחות ובאופן עצמאי.
          </p>

          <p className="mb-6">
            אתר זה הונגש בהתאם לתקנה 35 לתקנות שוויון זכויות לאנשים עם מוגבלות (התאמות
            נגישות לשירות), התשע״ג–2013, ועומד בדרישות התקן הישראלי ת״י 5568 חלק 1
            לנגישות תכנים באינטרנט ברמת AA, בהתאם להנחיות הנגישות הבינלאומיות WCAG 2.1.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">התאמות הנגישות באתר</h2>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>האתר ניתן לתפעול מלא באמצעות המקלדת בלבד (מקשי Tab, Enter וחיצים).</li>
            <li>לכל רכיב אינטראקטיבי קיים סימון מיקוד (Focus) ברור וגלוי.</li>
            <li>קיים קישור &quot;דלגו לתוכן הראשי&quot; המאפשר דילוג על תפריט הניווט.</li>
            <li>האתר מותאם לשימוש בקוראי מסך, לרבות תיאורים חלופיים (Alt Text) לתמונות ותיוג ARIA לרכיבים.</li>
            <li>מבנה הדפים סמנטי וכולל כותרות מדורגות, אזורי ניווט מסומנים ורשימות תקינות.</li>
            <li>ניגודיות צבעים בין הטקסט לרקע עומדת בדרישות רמה AA.</li>
            <li>האתר מכבד את העדפת המשתמש להפחתת אנימציות (Reduced Motion), ותכנים מתחלפים ניתנים לעצירה.</li>
            <li>האתר מותאם לתצוגה במגוון מסכים ורזולוציות וניתן להגדלה עד 200% ללא פגיעה בתוכן.</li>
          </ul>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">דפדפנים וטכנולוגיות מסייעות</h2>
          <p className="mb-6">
            האתר נבדק בדפדפנים הנפוצים (Chrome, Firefox, Edge, Safari) ומותאם לעבודה עם
            טכנולוגיות מסייעות נפוצות, בהן קוראי המסך NVDA ו־VoiceOver.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">הסתייגות</h2>
          <p className="mb-6">
            אנו פועלים באופן שוטף לשיפור נגישות האתר. ייתכן שיתגלו רכיבים או עמודים שטרם
            הונגשו במלואם. אם נתקלתם בבעיית נגישות באתר, נשמח שתעדכנו אותנו ונפעל לתקנה
            בהקדם האפשרי.
          </p>

          <h2 className="text-2xl font-bold text-white mt-10 mb-4">פנייה בנושא נגישות</h2>
          <p className="mb-2">לכל שאלה, בקשה או דיווח על בעיית נגישות ניתן לפנות אל רכז הנגישות שלנו:</p>
          <ul className="list-disc pr-6 space-y-2 mb-6">
            <li>שם רכז הנגישות: {COORDINATOR_NAME}</li>
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
          <p className="mb-6">
            כדי שנוכל לטפל בפנייה בצורה הטובה ביותר, נודה לתיאור הבעיה, כתובת העמוד שבו
            התרחשה, וסוג הטכנולוגיה המסייעת שבה נעשה שימוש (אם רלוונטי). אנו מתחייבים
            להשיב לכל פנייה בנושא נגישות בתוך 14 ימי עסקים.
          </p>

          <p className="text-[#7E8CA0] text-sm mt-12">הצהרת הנגישות עודכנה לאחרונה בתאריך: 11 ביולי 2026.</p>
        </article>
      </main>
    </>
  )
}
