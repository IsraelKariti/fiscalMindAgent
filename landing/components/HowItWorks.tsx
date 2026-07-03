const STEPS = [
  {
    number: '01',
    title: 'שיחת היכרות',
    desc: 'אנחנו בוחנים את התהליכים הקיימים שלכם מקצה לקצה, מזהים את צווארי הבקבוק בעלי ההשפעה הגבוהה ביותר, ומגדירים בדיוק אילו כלי AI יניעו את המחט.',
    detail: 'בדרך כלל 60 דקות. אנחנו עושים את שיעורי הבית לפני השיחה.',
  },
  {
    number: '02',
    title: 'פיתוח מותאם אישית',
    desc: 'הצוות שלנו מעצב ובונה כלי AI המותאמים למשרד שלכם — לא תוכנה מדף, אלא פתרונות שמתאימים לתהליכים המדויקים שלכם.',
    detail: 'זמן פיתוח ממוצע: 2–4 שבועות.',
  },
  {
    number: '03',
    title: 'אינטגרציה',
    desc: 'אנחנו מתחברים בצורה חלקה למערכות הקיימות שלכם — Priority, חשבשבת, QuickBooks, Xero ועוד. ללא כאבי ראש של מיגרציית נתונים.',
    detail: 'אנחנו מטפלים בכל ההגדרות הטכניות.',
  },
  {
    number: '04',
    title: 'תמיכה שוטפת',
    desc: 'בדיקות חודשיות, שיפורים מתמידים במודל וערוץ תמיכה ייעודי. ה-AI שלכם נעשה חכם יותר ככל שאתם משתמשים בו.',
    detail: 'ללא התחייבות. ביטול בכל עת.',
  },
]

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-28 bg-[#070709]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <p className="text-blue-400 text-sm font-semibold tracking-widest uppercase mb-4">
            התהליך
          </p>
          <h2 className="text-4xl md:text-5xl font-extrabold text-white">
            מהשיחה הראשונה
            <br />
            ועד לאוטומציה מלאה
          </h2>
          <p className="mt-4 text-[#64748B] text-lg max-w-xl mx-auto">
            אנחנו מטפלים בהכל. אתם רק צריכים להגיע לשיחת ההיכרות.
          </p>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute left-[calc(50%-1px)] top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-[#1E1E2E] to-transparent" />

          <div className="grid gap-12">
            {STEPS.map((step, i) => (
              <div
                key={step.number}
                className={`relative grid md:grid-cols-2 gap-8 items-center ${
                  i % 2 === 0 ? '' : 'md:[&>*:first-child]:order-last'
                }`}
              >
                <div className={`${i % 2 === 0 ? 'md:text-right md:pl-16' : 'md:pr-16'}`}>
                  <span className="text-6xl font-black text-[#1E1E2E] leading-none block mb-3">
                    {step.number}
                  </span>
                  <h3 className="text-2xl font-bold text-white mb-3">{step.title}</h3>
                  <p className="text-[#94A3B8] leading-relaxed">{step.desc}</p>
                  <p className="text-[#64748B] text-sm mt-3 italic">{step.detail}</p>
                </div>

                <div className="hidden md:flex justify-center relative">
                  <div className="w-12 h-12 rounded-full bg-blue-500 border-4 border-[#0A0A0F] flex items-center justify-center z-10">
                    <span className="text-white text-xs font-bold">{step.number}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
