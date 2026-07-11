'use client'
import { useEffect, useState } from 'react'

const TESTIMONIALS = [
  {
    text: 'מאז שהטמענו את FiscalMind, המשרד חוסך שעות עבודה בכל שבוע. הלקוחות מקבלים תשובות מהר יותר ואנחנו רגועים.',
    name: 'רו״ח דנה כהן',
    role: 'כהן ושות׳ רואי חשבון, תל אביב',
  },
  {
    text: 'המערכת אוספת את המסמכים מהלקוחות בלי שנרים טלפון אחד. זה שינה לחלוטין את שגרת סוף החודש אצלנו.',
    name: 'רו״ח יוסי לוי',
    role: 'לוי חשבונאות, חיפה',
  },
  {
    text: 'חששתי שבינה מלאכותית תסבך אותנו, אבל ההטמעה הייתה פשוטה והצוות שלהם ליווה אותנו בסבלנות בכל שלב.',
    name: 'מיכל בן־דוד',
    role: 'הנהלת חשבונות, רעננה',
  },
  {
    text: 'התזכורות האוטומטיות בוואטסאפ גרמו ללקוחות שלנו להגיש חומרים בזמן. אחוזי האיחור ירדו אצלנו בצורה דרמטית ממש.',
    name: 'רו״ח אבי מזרחי',
    role: 'מזרחי ושות׳, ירושלים',
  },
  {
    text: 'אני מנהלת משרד קטן, והמערכת נותנת לי תחושה של צוות שלם. שווה כל שקל, ממליצה בחום לכל קולגה.',
    name: 'נועה פרידמן',
    role: 'משרד רואי חשבון, הרצליה',
  },
  {
    text: 'בעונת הדוחות האחרונה סיימנו שבועיים לפני היעד. הצוות פנוי סוף סוף לייעוץ אמיתי ללקוחות במקום מרדף אחרי ניירת.',
    name: 'רו״ח עמית שפירא',
    role: 'שפירא ובניו, באר שבע',
  },
  {
    text: 'השירות מדויק לצרכים של משרד ישראלי: עברית, מע״מ, מקדמות — הכול מובן מאליו. מרגיש שנבנה במיוחד בשבילנו.',
    name: 'רו״ח תמר אזולאי',
    role: 'אזולאי יועצים, אשדוד',
  },
  {
    text: 'תוך חודש הבנו כמה זמן בזבזנו קודם. המעקב אחרי מסמכים חסרים פשוט קורה לבד, בלי טבלאות ובלי מיילים.',
    name: 'אורי גולדשטיין',
    role: 'הנהלת חשבונות, פתח תקווה',
  },
  {
    text: 'הלקוחות שלי מבוגרים ולא טכנולוגיים, ובכל זאת ההתכתבות איתם עובדת חלק. זה הפתיע אותי יותר מכל דבר אחר.',
    name: 'רו״ח רונית ברק',
    role: 'ברק ושות׳, נתניה',
  },
  {
    text: 'עברנו מניהול בקבצי אקסל למערכת אחת מסודרת. היום אני יודע בדיוק מה חסר לכל לקוח ומתי זה יגיע.',
    name: 'אלון דהן',
    role: 'משרד הנהלת חשבונות, ראשון לציון',
  },
  {
    text: 'הצטרפנו בספקנות ונשארנו מהתלהבות. התמיכה מגיבה מהר, וכל בקשה שלנו קיבלה מענה אמיתי תוך ימים ספורים בלבד.',
    name: 'רו״ח שירה וייס',
    role: 'וייס רואי חשבון, רמת גן',
  },
  {
    text: 'המשרד שלנו גדל בשלושים אחוז השנה בלי לגייס עובד נוסף. FiscalMind היא הסיבה המרכזית שהצלחנו לעמוד בעומס.',
    name: 'רו״ח משה אברהמי',
    role: 'אברהמי ושות׳, מודיעין',
  },
]

const PER_PAGE = 3
const PAGES: (typeof TESTIMONIALS)[] = []
for (let i = 0; i < TESTIMONIALS.length; i += PER_PAGE) {
  PAGES.push(TESTIMONIALS.slice(i, i + PER_PAGE))
}

function Stars() {
  return (
    <div className="flex gap-1 mb-4" role="img" aria-label="דירוג 5 מתוך 5 כוכבים">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width="14" height="14" viewBox="0 0 24 24" fill="#F59E0B" aria-hidden="true">
          <path d="M12 2l2.9 6.1 6.7.9-4.9 4.7 1.2 6.6L12 17.1l-5.9 3.2 1.2-6.6L2.4 9l6.7-.9L12 2z" />
        </svg>
      ))}
    </div>
  )
}

export default function Testimonials() {
  const [page, setPage] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setPage((p) => (p + 1) % PAGES.length), 7000)
    return () => clearTimeout(t)
  }, [page, paused])

  const prev = () => setPage((p) => (p - 1 + PAGES.length) % PAGES.length)
  const next = () => setPage((p) => (p + 1) % PAGES.length)

  return (
    <section id="testimonials" className="py-28 bg-[#070709]">
      <div
        className="max-w-6xl mx-auto px-6"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">לקוחות ממליצים</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white">מה אומרים עלינו</h2>
        </div>

        <div className="overflow-hidden">
          {/* In RTL, page N sits to the left of page N-1, so a positive translateX reveals it */}
          <div
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(${page * 100}%)` }}
          >
            {PAGES.map((items, pi) => (
              <div
                key={pi}
                aria-hidden={pi !== page}
                className="w-full shrink-0 grid gap-4 md:grid-cols-3 px-1"
              >
                {items.map((t, i) => (
                  <figure
                    key={i}
                    className="rounded-xl border border-[#1E1E2E] bg-[#111118] p-6 flex flex-col transition-colors duration-200 hover:border-[#2a2a3e]"
                  >
                    <Stars />
                    <blockquote className="text-[#94A3B8] text-sm leading-relaxed grow">”{t.text}“</blockquote>
                    <figcaption className="flex items-center gap-3 mt-6 pt-5 border-t border-[#1E1E2E]">
                      <div
                        aria-hidden="true"
                        className="w-9 h-9 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center text-sm font-bold shrink-0"
                      >
                        {t.name.replace('רו״ח ', '').charAt(0)}
                      </div>
                      <div>
                        <p className="text-white text-sm font-semibold">{t.name}</p>
                        <p className="text-[#64748B] text-xs">{t.role}</p>
                      </div>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 mt-10">
          <button
            onClick={prev}
            aria-label="ההמלצות הקודמות"
            className="w-10 h-10 rounded-full border border-[#1E1E2E] bg-[#111118] text-[#94A3B8] flex items-center justify-center transition-colors hover:border-[#2a2a3e] hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="rtl:rotate-180" aria-hidden="true">
              <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex gap-2">
            {PAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setPage(i)}
                aria-label={`עמוד המלצות ${i + 1}`}
                aria-current={page === i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  page === i ? 'w-6 bg-blue-400' : 'w-2 bg-[#1E1E2E] hover:bg-[#2a2a3e]'
                }`}
              />
            ))}
          </div>

          <button
            onClick={next}
            aria-label="ההמלצות הבאות"
            className="w-10 h-10 rounded-full border border-[#1E1E2E] bg-[#111118] text-[#94A3B8] flex items-center justify-center transition-colors hover:border-[#2a2a3e] hover:text-white"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="rtl:rotate-180" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}
