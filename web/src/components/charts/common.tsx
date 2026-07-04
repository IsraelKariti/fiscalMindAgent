import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

/* Chart series palette: darker steps of the app's theme hues, validated for
   colorblind separation (worst adjacent ΔE 15.2) and ≥3:1 contrast against
   the card surface. Assign slots in this fixed order, never cycled. */
export const SERIES = {
  violet: '#8b5cf6',
  cyan: '#0ea5c4',
  pink: '#e0559b',
  amber: '#b87e06',
  green: '#0da674',
} as const;

/* Neutral for "Other"/"Unlinked" buckets — de-emphasis, not a series. */
export const NEUTRAL = '#667092';

/* The card surface flattened to a solid color (--surface over --bg): rings
   and gaps that separate touching marks are drawn in this. */
export const SURFACE = '#101628';

export interface TipRow {
  color?: string;
  value: string;
  label: string;
}

export interface TipState {
  x: number;
  y: number;
  flip: boolean;
  title?: string;
  rows: TipRow[];
}

/* Shared per-chart plumbing: a measured container that also anchors the hover
   tooltip. `showTip` takes client coordinates (from a pointer event or a
   focused mark) and positions the tooltip inside the container. */
export function useChartBox<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  const [tip, setTip] = useState<TipState | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const showTip = useCallback(
    (at: { clientX: number; clientY: number }, title: string | undefined, rows: TipRow[]) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = at.clientX - rect.left;
      // Flip to the cursor's left near the right edge — but never in a narrow
      // canvas (a donut), where flipping would push the tooltip off the card.
      setTip({ x, y: at.clientY - rect.top, flip: rect.width > 320 && x > rect.width - 180, title, rows });
    },
    [],
  );

  const hideTip = useCallback(() => setTip(null), []);

  return { ref, width, tip, showTip, hideTip };
}

/* Center of a focused SVG mark, as client coordinates for showTip — keyboard
   focus shows the same tooltip as hover. */
export function markCenter(el: Element): { clientX: number; clientY: number } {
  const r = el.getBoundingClientRect();
  return { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
}

export function ChartTooltip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div className={`chart-tooltip${tip.flip ? ' flip' : ''}`} style={{ left: tip.x, top: tip.y }}>
      {tip.title && <div className="chart-tooltip-title">{tip.title}</div>}
      {tip.rows.map((row, i) => (
        <div className="chart-tooltip-row" key={i}>
          {row.color && <span className="chart-tooltip-key" style={{ background: row.color }} />}
          <span className="chart-tooltip-value">{row.value}</span>
          <span className="chart-tooltip-label">{row.label}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  span,
  children,
}: {
  title: string;
  subtitle?: string;
  span?: 2 | 3;
  children: ReactNode;
}) {
  return (
    <section className={`card chart-card${span ? ` chart-span-${span}` : ''}`}>
      <header className="chart-card-header">
        <h3 className="chart-title">{title}</h3>
        {subtitle && <span className="chart-subtitle">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

export function ChartEmpty({ children }: { children: ReactNode }) {
  return <div className="chart-empty">{children}</div>;
}

/* Screen-reader table twin: every chart's values, reachable without hover. */
export function SrTable({
  caption,
  head,
  rows,
}: {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td key={j}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
