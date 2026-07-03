const SERVICES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M9 12h6M9 16h6M9 8h3" />
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <circle cx="18" cy="18" r="4" fill="#3B82F6" stroke="none" />
        <path d="M16.5 18l1 1 2-2" stroke="white" strokeWidth="1.5" />
      </svg>
    ),
    title: 'עיבוד מסמכים חכם',
    desc: 'חילוץ אוטומטי של נתונים מחשבוניות, קבלות, דפי בנק וחוזים — ביטול מלא של הזנה ידנית.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <circle cx="5" cy="12" r="2" />
        <circle cx="19" cy="12" r="2" />
        <circle cx="12" cy="5" r="2" />
        <path d="M7 12h10M12 7v10" />
        <path d="M7 8l-1-1M17 8l1-1M7 16l-1 1M17 16l1 1" />
      </svg>
    ),
    title: 'אוטומציה של תהליכים',
    desc: 'ביטול הזנת נתונים ומשימות התאמה חוזרות. תנו ל-AI לטפל בשגרה כדי שהצוות שלכם יוכל לטפל בקשרים.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M3 20h18M6 20V14M10 20V10M14 20V14M18 20V6" />
        <path d="M4 10l6-5 5 4 5-7" />
      </svg>
    ),
    title: 'דוחות פיננסיים מבוססי AI',
    desc: 'הפקת דוחות פיננסיים מקצועיים ללקוחות תוך שניות. המערכת מזהה מגמות, חריגות ותובנות אוטומטית.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="M8 12h8M12 8v8" />
        <circle cx="17" cy="7" r="3" fill="#8B5CF6" stroke="none" />
        <path d="M16 7l.8.8 1.7-1.7" stroke="white" strokeWidth="1.3" />
      </svg>
    ),
    title: 'הכנת דוחות מס עם AI',
    desc: 'זיהוי אי-התאמות, מילוי מקדים של דוחות על בסיס נתונים היסטוריים, וגילוי ניכויים שאולי פספסתם.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <path d="M8 10h8M8 14h5" />
      </svg>
    ),
    title: 'תקשורת אוטומטית עם לקוחות',
    desc: 'מעקבים, תזכורות לדדליינים ועדכוני סטטוס — מותאמים אישית בקנה מידה גדול ללא עלות כוח אדם נוסף.',
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-6 h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
    title: 'ניטור ציות רגולטורי',
    desc: 'הישארו מעודכנים בשינויים רגולטוריים עם התראות בזמן אמת. ה-AI מנטר את ספרי החשבונות 24/7.',
  },
]

export default function Services() {
  return (
    <section id="services" className="py-28 bg-[#0A0A0F]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">
            מה אנחנו בונים
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white">
            פתרונות AI שנבנו לאופן שבו
            <br />
            רואי חשבון עובדים בפועל
          </h2>
          <p className="mt-4 text-[#64748B] text-lg max-w-xl mx-auto">
            כל כלי שאנחנו בונים מתוכנן סביב הזרימות, התוכנות ונקודות הכאב הספציפיות של משרדי רואי חשבון.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((s) => (
            <div
              key={s.title}
              className="group rounded-2xl border border-[#1E1E2E] bg-[#111118] p-7 hover:border-blue-500/30 hover:bg-[#13131e] transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-[#1a1a2e] border border-[#1E1E2E] flex items-center justify-center text-[#94A3B8] group-hover:text-blue-400 transition-colors mb-5">
                {s.icon}
              </div>
              <h3 className="text-white font-bold text-lg mb-2">{s.title}</h3>
              <p className="text-[#64748B] text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
