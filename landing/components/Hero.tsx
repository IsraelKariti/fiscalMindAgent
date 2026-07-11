'use client'
import { useState, useCallback } from 'react'
import PolygonMorph from './PolygonMorph'

const STATS = [
  { value: '+10', label: 'שעות חסכון שבועיות' },
  { value: '+50', label: 'משרדים אוטומטיים' },
  { value: '98%', label: 'שימור לקוחות' },
]

export default function Hero() {
  const [accentColor, setAccentColor] = useState('#3B82F6')

  const handleAccentChange = useCallback((color: string) => {
    setAccentColor(color)
  }, [])

  return (
    <section
      id="hero"
      className="relative overflow-hidden pt-16"
      style={{
        background: `radial-gradient(ellipse 60% 80% at 20% 50%, ${accentColor}18 0%, transparent 70%), #0A0A0F`,
        transition: 'background 1.4s ease',
      }}
    >
      <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.03] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 w-full grid md:grid-cols-2 gap-12 md:items-center py-24 md:min-h-screen">
        <div className="animate-fade-in-up">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#1E1E2E] bg-[#111118] text-xs text-[#94A3B8] mb-8">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ background: accentColor }}
            />
            מבוסס בינה מלאכותית לרואי חשבון
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-extrabold leading-[1.15] tracking-tight mb-6">
            <span className="block text-white">הצד החכם</span>
            <span
              className="block"
              style={{ color: accentColor, transition: 'color 1.2s ease' }}
            >
              של הנהלת החשבונות.
            </span>
          </h1>

          <p className="text-lg text-[#94A3B8] leading-relaxed mb-10 max-w-md">
            FiscalMind בונה פתרונות בינה מלאכותית מותאמים אישית שמייעלים את העבודה השגרתית — כדי שתוכלו להתמקד בלקוחות.
          </p>

          <div className="flex flex-wrap items-center gap-6 mb-14 animate-fade-in-up-delay-1">
            <a href="#how-it-works" className="arrow-link">
              <span aria-hidden="true">←</span>
              <span>איך זה עובד</span>
            </a>
          </div>

          <div className="flex gap-8 animate-fade-in-up-delay-2">
            {STATS.map((s) => (
              <div key={s.label}>
                <p
                  className="text-2xl font-bold"
                  style={{ color: accentColor, transition: 'color 1.2s ease' }}
                >
                  {s.value}
                </p>
                <p className="text-xs text-[#7E8CA0] mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative h-[320px] md:h-[520px] animate-fade-in-up-delay-3">
          <PolygonMorph onAccentChange={handleAccentChange} />
        </div>
      </div>
    </section>
  )
}
