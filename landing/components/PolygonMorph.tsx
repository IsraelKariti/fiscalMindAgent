'use client'
import { useEffect, useRef, useState } from 'react'

// All 4 shapes have exactly 8 points — CSS clip-path only morphs smoothly when counts match.
// Shapes are angular and concave, inspired by arrow / staircase / L / right-arrow silhouettes.
const STATES = [
  {
    // Upward arrow with deep V-notch cut from the bottom
    accent: '#F59E0B',
    from: '#B45309',
    to: '#DC2626',
    shape: 'polygon(50% 4%, 86% 48%, 66% 48%, 66% 82%, 50% 65%, 34% 82%, 34% 48%, 14% 48%)',
    steps: [
      {
        n: '01', label: 'סריקת מסמך', cx: 35, cy: 36,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="12" height="9" rx="1.5" />
            <circle cx="8" cy="8.5" r="2.5" />
            <path d="M6 4l1-2h2l1 2" />
          </svg>
        ),
      },
      {
        n: '02', label: 'חילוץ נתונים', cx: 65, cy: 36,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2v9M5 8l3 3 3-3" />
            <path d="M3 14h10" />
          </svg>
        ),
      },
      {
        n: '03', label: 'אימות ושמירה', cx: 50, cy: 57,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2L3 4.5v3.5c0 3.2 2.2 5.2 5 6 2.8-.8 5-2.8 5-6V4.5z" />
            <path d="M5.5 8l2 2 3-3" />
          </svg>
        ),
      },
    ],
  },
  {
    // Z / staircase — concave on upper-right and lower-left
    accent: '#3B82F6',
    from: '#1D4ED8',
    to: '#0E7490',
    shape: 'polygon(6% 6%, 74% 6%, 74% 46%, 94% 46%, 94% 94%, 32% 94%, 32% 54%, 6% 54%)',
    steps: [
      {
        n: '01', label: 'קבלת נתונים', cx: 30, cy: 28,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 10V5a1 1 0 011-1h10a1 1 0 011 1v5" />
            <path d="M2 10h4l1 2h2l1-2h4" />
            <path d="M8 4v4M6 6l2 2 2-2" />
          </svg>
        ),
      },
      {
        n: '02', label: 'עיבוד אוטומטי', cx: 56, cy: 28,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="2.5" />
            <path d="M8 2v2M8 12v2M2 8h2M12 8h2M3.8 3.8l1.4 1.4M10.8 10.8l1.4 1.4M3.8 12.2l1.4-1.4M10.8 5.2l1.4-1.4" />
          </svg>
        ),
      },
      {
        n: '03', label: 'שליחה ודיווח', cx: 66, cy: 72,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 8L3 4l2 4-2 4 10-4z" />
          </svg>
        ),
      },
    ],
  },
  {
    // Reverse-L — concave on lower-right corner
    accent: '#8B5CF6',
    from: '#6D28D9',
    to: '#BE185D',
    shape: 'polygon(34% 6%, 94% 6%, 94% 66%, 66% 66%, 66% 94%, 6% 94%, 6% 46%, 34% 46%)',
    steps: [
      {
        n: '01', label: 'איסוף נתונים', cx: 62, cy: 28,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <ellipse cx="8" cy="4" rx="5" ry="2" />
            <path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4" />
            <path d="M3 8v3c0 1.1 2.2 2 5 2s5-.9 5-2V8" />
          </svg>
        ),
      },
      {
        n: '02', label: 'ניתוח AI', cx: 44, cy: 56,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 1l1.5 6.5H15L9.5 11l2 5L8 13l-3.5 3 2-5L1 7.5h5.5z" />
          </svg>
        ),
      },
      {
        n: '03', label: 'הגשת דוח', cx: 24, cy: 72,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 1h6l4 4v10H4V1z" />
            <path d="M10 1v4h4" />
            <path d="M6 8h5M6 11h3" />
          </svg>
        ),
      },
    ],
  },
  {
    // Right-pointing arrow with concave V on left side
    accent: '#14B8A6',
    from: '#0F766E',
    to: '#166534',
    shape: 'polygon(6% 26%, 46% 6%, 46% 30%, 94% 50%, 46% 70%, 46% 94%, 6% 74%, 26% 50%)',
    steps: [
      {
        n: '01', label: 'עיבוד נתונים', cx: 28, cy: 22,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="10" height="8" rx="1" />
            <path d="M6 4V2M10 4V2M6 12v2M10 12v2M3 6H1M3 10H1M13 6h2M13 10h2" />
          </svg>
        ),
      },
      {
        n: '02', label: 'ניתוח מגמות', cx: 68, cy: 50,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 12l3-4 2.5 2 4.5-6" />
            <path d="M2 14h12M2 2v12" />
          </svg>
        ),
      },
      {
        n: '03', label: 'הפקת דוח', cx: 28, cy: 78,
        icon: (
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 1h6l4 4v10H4V1z" />
            <path d="M10 1v4h4" />
            <path d="M6 8h5M6 11h3" />
          </svg>
        ),
      },
    ],
  },
]

interface PolygonMorphProps {
  onAccentChange?: (color: string) => void
}

export default function PolygonMorph({ onAccentChange }: PolygonMorphProps) {
  const [index, setIndex] = useState(0)
  const [prevGrad, setPrevGrad] = useState({ from: STATES[0].from, to: STATES[0].to })
  const [topVisible, setTopVisible] = useState(true)
  const [contentVisible, setContentVisible] = useState(true)
  const indexRef = useRef(0)

  useEffect(() => {
    indexRef.current = index
  }, [index])

  useEffect(() => {
    const interval = setInterval(() => {
      const cur = indexRef.current
      const next = (cur + 1) % STATES.length

      setContentVisible(false)

      setTimeout(() => {
        setPrevGrad({ from: STATES[cur].from, to: STATES[cur].to })
        setTopVisible(false)
        setIndex(next)
        onAccentChange?.(STATES[next].accent)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTopVisible(true)
          })
        })

        setTimeout(() => setContentVisible(true), 500)
      }, 300)
    }, 3800)

    return () => clearInterval(interval)
  }, [onAccentChange])

  const state = STATES[index]

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div
        aria-hidden="true"
        className="relative w-[290px] h-[310px] md:w-[420px] md:h-[460px]"
        style={{
          clipPath: state.shape,
          transition: 'clip-path 1400ms cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'clip-path',
        }}
      >
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(135deg, ${prevGrad.from}, ${prevGrad.to})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, ${state.from}, ${state.to})`,
            opacity: topVisible ? 1 : 0,
            transition: 'opacity 900ms ease',
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at 30% 30%, rgba(255,255,255,0.12) 0%, transparent 60%)',
          }}
        />

        <div
          className="absolute inset-0"
          style={{ opacity: contentVisible ? 1 : 0, transition: 'opacity 300ms ease' }}
        >
          <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
            {state.steps.map((step, i) => {
              if (i === 0) return null
              const prev = state.steps[i - 1]
              return (
                <line
                  key={i}
                  x1={`${prev.cx}%`}
                  y1={`${prev.cy}%`}
                  x2={`${step.cx}%`}
                  y2={`${step.cy}%`}
                  stroke="rgba(255,255,255,0.28)"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>

          {state.steps.map((step) => (
            <div
              key={step.n}
              className="absolute"
              style={{
                left: `${step.cx}%`,
                top: `${step.cy}%`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-white/20 border border-white/35">
                  {step.icon}
                  <span className="text-white/70 text-[9px] md:text-[10px] font-bold leading-none">{step.n}</span>
                </div>
                <span
                  className="hidden md:block text-white text-[11px] font-semibold whitespace-nowrap leading-none"
                  style={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
                >
                  {step.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        {STATES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`הצג הדגמה ${i + 1} מתוך ${STATES.length}`}
            aria-current={i === index}
            className="w-2 h-2 rounded-full transition-all duration-300"
            style={{
              background: i === index ? state.accent : '#64748B',
              transform: i === index ? 'scale(1.3)' : 'scale(1)',
            }}
          />
        ))}
      </div>
    </div>
  )
}
