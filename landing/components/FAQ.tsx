'use client'
import { useState } from 'react'

const ITEMS = [
  {
    q: 'האם אני צריך ידע טכני כדי להשתמש ב-FiscalMind?',
    a: 'בכלל לא. אנחנו מטפלים בכל ההטמעה הטכנית, האינטגרציה והתחזוקה. הצוות שלכם מתממשק עם ממשקים פשוטים ומוכרים — אנחנו עושים את עבודת ה-AI מאחורי הקלעים.',
  },
  {
    q: 'כמה זמן לוקחת ההקמה?',
    a: 'רוב המשרדים מופעלים תוך 2–4 שבועות משיחת ההיכרות. פרויקטים ארגוניים מורכבים יכולים לקחת 6–8 שבועות. אנחנו נותנים לכם לוח זמנים מוגדר לאחר הביקורת הראשונית.',
  },
  {
    q: 'עם אילו תוכנות חשבונאות אתם מתממשקים?',
    a: 'אנחנו מתממשקים עם Priority, חשבשבת, Sage, QuickBooks, Xero, FreshBooks, Microsoft 365, Google Workspace ועוד. אם אתם משתמשים במשהו אחר — שאלו אותנו, בדרך כלל נוכל לבנות חיבור.',
  },
  {
    q: 'האם נתוני הלקוחות שלי מאובטחים?',
    a: 'כן. כל הנתונים מוצפנים במנוחה ובמעבר. אנחנו לא משתמשים בנתוני הלקוחות שלכם לאימון מודלים משותפים. הנתונים שלכם נשארים בסביבה מבודדת משלכם. אנחנו שמחים לחתום על NDA והסכם עיבוד נתונים.',
  },
  {
    q: 'האם ניתן לבטל בכל עת?',
    a: 'כן. כל התוכניות הן חודש לחודש ללא חוזים ארוכי טווח. אנחנו נייצא את הנתונים והתצורות שלכם בצורה מסודרת אם תחליטו לעזוב.',
  },
  {
    q: 'האם אתם מציעים ניסיון חינם?',
    a: 'תוכנית הצמיחה כוללת ניסיון חינם של 14 יום עם גישה מלאה. תוכניות הבסיסי והארגוני מתחילות עם שיחת היכרות חינמית והצעת מחיר מפורטת — ללא התחייבות.',
  },
]

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null)

  return (
    <section id="faq" className="py-28 bg-[#070709]">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">שאלות נפוצות</p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white">
            שאלות נפוצות
          </h2>
        </div>

        <div className="space-y-3">
          {ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-[#1E1E2E] bg-[#111118] overflow-hidden transition-all duration-200 hover:border-[#2a2a3e]"
            >
              <button
                className="w-full text-right px-6 py-5 flex items-center justify-between gap-4"
                onClick={() => setOpen(open === i ? null : i)}
              >
                <span className="text-white font-medium text-sm md:text-base">{item.q}</span>
                <span
                  className="text-[#64748B] shrink-0 transition-transform duration-300"
                  style={{ transform: open === i ? 'rotate(45deg)' : 'rotate(0)' }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              </button>

              <div
                className="overflow-hidden transition-all duration-300"
                style={{ maxHeight: open === i ? '300px' : '0px' }}
              >
                <p className="px-6 pb-5 text-[#94A3B8] text-sm leading-relaxed text-right">{item.a}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
