const TIERS = [
  {
    name: 'בסיסי',
    price: '₪3,500',
    period: '/חודש',
    target: 'רואי חשבון עצמאיים ומשרדים קטנים',
    features: [
      'אוטומציה אחת של תהליך AI',
      'עיבוד מסמכים (עד 500 מסמכים/חודש)',
      'אוטומציה של תקשורת אימייל עם לקוחות',
      'אינטגרציה עם Priority או חשבשבת',
      'שיחת בדיקה חודשית',
    ],
    cta: 'התחילו עכשיו',
    highlight: false,
  },
  {
    name: 'צמיחה',
    price: '₪8,500',
    period: '/חודש',
    target: 'משרדים בינוניים (5–20 עובדים)',
    features: [
      'עד 5 אוטומציות AI',
      'עיבוד מסמכים ללא הגבלה',
      'מערכת דוחות מבוססת AI',
      'מודול הכנת דוחות מס',
      'אינטגרציה מלאה עם מערכות קיימות',
      'תמיכה עדיפות + בדיקות שבועיות',
    ],
    cta: 'התחילו ניסיון חינם',
    highlight: true,
    badge: 'הכי פופולרי',
  },
  {
    name: 'ארגוני',
    price: 'מותאם',
    period: '',
    target: 'משרדים גדולים וקבוצות רו"ח',
    features: [
      'אוטומציות AI ללא הגבלה',
      'אימון מודל מותאם על הנתונים שלכם',
      'פורטל לקוחות תחת המותג שלכם',
      'מהנדס AI ייעודי',
      'הסכם SLA + ביקורת ציות',
      'אפשרות הטמעה פנים-ארגונית',
    ],
    cta: 'צרו קשר',
    highlight: false,
  },
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
          <p className="mt-4 text-[#64748B] text-lg max-w-xl mx-auto">
            ללא דמי הקמה. ללא עלויות נסתרות. ביטול בכל עת.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 items-stretch">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={`relative rounded-2xl p-8 flex flex-col transition-all duration-300 ${
                tier.highlight
                  ? 'bg-[#111118] border-2 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.15)]'
                  : 'bg-[#111118] border border-[#1E1E2E] hover:border-[#2a2a3e]'
              }`}
            >
              {tier.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="px-3 py-1 rounded-full bg-blue-500 text-white text-xs font-bold">
                    {tier.badge}
                  </span>
                </div>
              )}

              <div className="mb-8">
                <h3 className="text-white font-bold text-xl mb-1">{tier.name}</h3>
                <p className="text-[#64748B] text-sm mb-5">{tier.target}</p>
                <div className="flex items-end gap-1">
                  <span className="text-4xl font-black text-white">{tier.price}</span>
                  {tier.period && (
                    <span className="text-[#64748B] mb-1">{tier.period}</span>
                  )}
                </div>
              </div>

              <ul className="space-y-3 flex-1 mb-8">
                {tier.features.map((f) => (
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
                className={`block text-center py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:scale-[1.02] ${
                  tier.highlight
                    ? 'bg-blue-500 hover:bg-blue-400 text-white'
                    : 'border border-[#1E1E2E] hover:border-blue-500/40 text-white hover:bg-[#1a1a2e]'
                }`}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
