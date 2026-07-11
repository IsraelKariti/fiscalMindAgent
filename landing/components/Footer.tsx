const LINKS = {
  מוצר: [
    { label: 'שירותים', href: '#services' },
    { label: 'איך זה עובד', href: '#how-it-works' },
    { label: 'שאלות נפוצות', href: '#faq' },
  ],
  חברה: [
    { label: 'אודות', href: '#' },
    { label: 'בלוג', href: '#' },
    { label: 'קריירה', href: '#' },
    { label: 'צור קשר', href: 'mailto:admin@fiscalmind.app' },
  ],
  משפטי: [
    { label: 'מדיניות פרטיות', href: '#' },
    { label: 'תנאי שימוש', href: '#' },
    { label: 'מדיניות עוגיות', href: '#' },
    { label: 'הצהרת נגישות', href: '/accessibility' },
  ],
}

export default function Footer() {
  return (
    <footer className="border-t border-[#1E1E2E] bg-[#070709] pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid md:grid-cols-4 gap-12 mb-12">
          <div>
            <span className="flex items-center gap-2.5 mb-3">
              <img src="/petal-seal.svg" alt="" className="w-7 h-7 rounded-lg" />
              <span className="shimmer-text text-xl font-extrabold tracking-tight">FiscalMind</span>
            </span>
            <p className="text-[#64748B] text-sm leading-relaxed max-w-xs">
              פתרונות AI מותאמים אישית למשרדי רואי חשבון. הצד החכם של הנהלת החשבונות.
            </p>

            <div className="flex gap-4 mt-6">
              <a
                href="#"
                aria-label="LinkedIn"
                className="w-9 h-9 rounded-lg border border-[#1E1E2E] flex items-center justify-center text-[#64748B] hover:text-white hover:border-[#3B82F6]/40 transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z" />
                  <circle cx="4" cy="4" r="2" />
                </svg>
              </a>
              <a
                href="#"
                aria-label="Twitter / X"
                className="w-9 h-9 rounded-lg border border-[#1E1E2E] flex items-center justify-center text-[#64748B] hover:text-white hover:border-[#3B82F6]/40 transition-colors"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
            </div>
          </div>

          {Object.entries(LINKS).map(([group, items]) => (
            <nav key={group} aria-label={group}>
              <h4 className="text-white font-semibold text-sm mb-4">{group}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      className="text-[#64748B] hover:text-white text-sm transition-colors"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="border-t border-[#1E1E2E] pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[#64748B] text-sm">
            © {new Date().getFullYear()} FiscalMind. כל הזכויות שמורות.
          </p>
          <p className="text-[#64748B] text-sm">
            נבנה עבור רואי חשבון, על ידי אנשים שמבינים מספרים.
          </p>
        </div>
      </div>
    </footer>
  )
}
