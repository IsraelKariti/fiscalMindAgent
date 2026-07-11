'use client'
import { useEffect, useState } from 'react'

const links = [
  { label: 'שירותים', href: '#services' },
  { label: 'איך זה עובד', href: '#how-it-works' },
  // If the Pricing section is commented out in app/page.tsx, comment out this link too
  // { label: 'מחירים', href: '#pricing' },
  // If the Testimonials section is commented out in app/page.tsx, comment out this link too
  { label: 'המלצות', href: '#testimonials' },
  { label: 'שאלות נפוצות', href: '#faq' },
]

// Dashboard lives on its own subdomain; NEXT_PUBLIC_APP_URL is inlined at build
// time so local builds can point at http://localhost:3000 instead.
const LOGIN_URL = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://agent.fiscalmind.app'}/login`

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-[#0A0A0F]/80 backdrop-blur-md border-b border-[#1E1E2E]'
          : 'bg-transparent'
      }`}
    >
      <nav
        aria-label="ניווט ראשי"
        className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between"
      >
        <a href="#" className="flex items-center gap-2.5 select-none" aria-label="FiscalMind — חזרה לראש הדף">
          <img src="/petal-seal.svg" alt="" className="w-7 h-7 rounded-lg" />
          <span className="shimmer-text text-xl font-extrabold tracking-tight">FiscalMind</span>
        </a>

        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#94A3B8] hover:text-white transition-colors"
            >
              {l.label}
            </a>
          ))}
          <a
            href={LOGIN_URL}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#1E1E2E] bg-[#111118] hover:border-[#3B82F6] text-white text-sm font-semibold transition-colors"
          >
            <GoogleIcon />
            התחברות עם Google
          </a>
        </div>

        <button
          className="md:hidden text-[#94A3B8] hover:text-white"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'סגור תפריט' : 'פתח תפריט'}
          aria-expanded={open}
          aria-controls="mobile-menu"
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            {open ? (
              <>
                <line x1="4" y1="4" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="18" y1="4" x2="4" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="19" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="11" x2="19" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <line x1="3" y1="16" x2="19" y2="16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      </nav>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="תפריט נייד"
          className="md:hidden bg-[#0A0A0F]/95 backdrop-blur-md border-b border-[#1E1E2E] px-6 pb-6 flex flex-col gap-4"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm text-[#94A3B8] hover:text-white transition-colors py-1"
              onClick={() => setOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a
            href={LOGIN_URL}
            onClick={() => setOpen(false)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[#1E1E2E] bg-[#111118] hover:border-[#3B82F6] text-white text-sm font-semibold transition-colors"
          >
            <GoogleIcon />
            התחברות עם Google
          </a>
        </nav>
      )}
    </header>
  )
}
