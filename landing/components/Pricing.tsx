const FEATURES = [
  'אוטומציות AI ללא הגבלה',
  'עיבוד מסמכים ללא הגבלה',
  'אוטומציה של תקשורת אימייל עם לקוחות',
  'מערכת דוחות מבוססת AI',
  'מודול הכנת דוחות מס',
  'אינטגרציה מלאה עם Priority, חשבשבת ומערכות קיימות',
  'תמיכה שוטפת + שיחת בדיקה חודשית',
]

export default function Pricing() {
  return (
    <section id="pricing" className="py-28 bg-[#0A0A0F]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">
            מחירים
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white">
            תמחור פשוט ושקוף
          </h2>
          <p className="mt-4 text-[#7E8CA0] text-lg max-w-xl mx-auto">
            מחיר אחד, כל היכולות. ללא דמי הקמה. ללא עלויות נסתרות. ביטול בכל עת.
          </p>
        </div>

        <div className="max-w-md mx-auto">
          <div className="rounded-2xl p-8 flex flex-col transition-all duration-300 bg-[#111118] border-2 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.15)]">
            <div className="mb-8">
              <p className="text-[#7E8CA0] text-sm mb-5">לרואי חשבון ומשרדים בכל גודל</p>
              <div className="flex items-end gap-1">
                <span className="text-4xl font-black text-white">₪3,500</span>
                <span className="text-[#7E8CA0] mb-1">/חודש</span>
              </div>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-3 text-sm text-[#94A3B8]">
                  <svg className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {f}
                </li>
              ))}
            </ul>

            <a
              href="#cta"
              className="block text-center py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] bg-blue-500 hover:bg-blue-400 text-white"
            >
              התחילו עכשיו
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
