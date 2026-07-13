import { type KeyboardEvent, type PointerEvent, useState } from 'react';
import { useT } from '../../i18n';
import { ChartTooltip, SrTable, SURFACE, useChartBox } from './common';

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

const PAD = { top: 14, right: 34, bottom: 26, left: 34 };

/** Steps below `minStep` are never offered — integer data keeps integer ticks. */
function niceStep(max: number, minStep: number): number {
  const raw = Math.max(minStep, max / 4);
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5]) {
    if (m * mag >= raw) return m * mag;
  }
  return 10 * mag;
}

export function LineChart({
  title,
  labels,
  series,
  area = false,
  height = 200,
  format,
}: {
  title: string;
  labels: string[];
  series: LineSeries[];
  area?: boolean;
  height?: number;
  /** Value renderer for ticks, tooltip, end labels and legend totals (default: toLocaleString). */
  format?: (value: number) => string;
}) {
  const { t } = useT();
  const { ref, width, tip, showTip, hideTip } = useChartBox<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const fmt = format ?? ((v: number) => v.toLocaleString());

  const n = labels.length;
  const plotH = height - PAD.top - PAD.bottom;
  // Fractional data (LLM dollar costs) gets a fractional scale; integer data
  // keeps the old ≥1 steps so count charts never show 0.5 gridlines.
  const dataMax = Math.max(0, ...series.flatMap((s) => s.values));
  const allInts = series.every((s) => s.values.every((v) => Number.isInteger(v)));
  const maxV = dataMax > 0 ? dataMax : 1;
  const step = niceStep(maxV, allInts ? 1 : maxV / 1e6);
  const tickCount = Math.max(1, Math.ceil(maxV / step - 1e-9));
  const yMax = tickCount * step;
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => i * step);
  // Left pad grows with the widest tick label (formatted costs run long).
  const padLeft = Math.max(PAD.left, 12 + Math.max(...ticks.map((v) => fmt(v).length)) * 6.5);
  const plotW = Math.max(0, width - padLeft - PAD.right);

  const at = (s: LineSeries, i: number) => s.values[i] ?? 0;
  const x = (i: number) => padLeft + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const setHover = (i: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    setHoverIdx(i);
    showTip(
      { clientX: el.getBoundingClientRect().left + x(i), clientY },
      labels[i],
      series.map((s) => ({ color: s.color, value: fmt(at(s, i)), label: s.name })),
    );
  };

  const clearHover = () => {
    setHoverIdx(null);
    hideTip();
  };

  const hoverAtMidPlot = (i: number) => {
    const el = ref.current;
    if (!el) return;
    setHover(i, el.getBoundingClientRect().top + PAD.top + plotH / 2);
  };

  const handlePointer = (e: PointerEvent<SVGSVGElement>) => {
    if (plotW <= 0) return;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const i = n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((px - padLeft) / plotW) * (n - 1))));
    setHover(i, e.clientY);
  };

  const handleKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const cur = hoverIdx ?? n - 1;
    hoverAtMidPlot(Math.min(n - 1, Math.max(0, cur + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  if (n === 0 || series.length === 0) return null;

  const labelEvery = plotW > 0 ? Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 64)))) : 1;

  // Direct labels on each series' endpoint; nudge apart when two collide.
  // With three or more converging series, nudging detaches labels from their
  // lines — drop the end labels and let the legend + tooltip carry identity.
  const endYs = series.map((s) => y(at(s, n - 1)));
  const [e0, e1] = [endYs[0], endYs[1]];
  if (endYs.length === 2 && e0 !== undefined && e1 !== undefined && Math.abs(e0 - e1) < 15) {
    const mid = (e0 + e1) / 2;
    endYs[e0 <= e1 ? 0 : 1] = mid - 8;
    endYs[e0 <= e1 ? 1 : 0] = mid + 8;
  }
  const sortedEndYs = [...endYs].sort((a, b) => a - b);
  const showEndLabels =
    series.length <= 2 || sortedEndYs.every((v, i) => i === 0 || v - (sortedEndYs[i - 1] ?? 0) >= 14);

  return (
    <div className="chart-block">
      <div className="chart-canvas" ref={ref}>
        {plotW > 40 && (
          <svg
            width={width}
            height={height}
            role="img"
            aria-label={title}
            tabIndex={0}
            onPointerMove={handlePointer}
            onPointerLeave={clearHover}
            onFocus={() => hoverAtMidPlot(hoverIdx ?? n - 1)}
            onBlur={clearHover}
            onKeyDown={handleKey}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={padLeft}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'chart-axis-line' : 'chart-grid-line'}
                />
                <text x={padLeft - 7} y={y(t) + 3.5} textAnchor="end" className="chart-tick-label">
                  {fmt(t)}
                </text>
              </g>
            ))}
            {labels.map((label, i) =>
              i % labelEvery === 0 ? (
                <text key={i} x={x(i)} y={height - PAD.bottom + 17} textAnchor="middle" className="chart-tick-label">
                  {label}
                </text>
              ) : null,
            )}
            {hoverIdx !== null && (
              <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={PAD.top} y2={PAD.top + plotH} className="chart-crosshair" />
            )}
            {series.map((s) => {
              const line = s.values
                .map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(2)} ${y(v).toFixed(2)}`)
                .join(' ');
              return (
                <g key={s.name}>
                  {area && (
                    <path
                      d={`${line} L ${x(n - 1).toFixed(2)} ${y(0)} L ${x(0).toFixed(2)} ${y(0)} Z`}
                      fill={s.color}
                      opacity={0.12}
                    />
                  )}
                  <path d={line} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  {hoverIdx !== null && (
                    <circle cx={x(hoverIdx)} cy={y(at(s, hoverIdx))} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                  )}
                  <circle cx={x(n - 1)} cy={y(at(s, n - 1))} r={4} fill={s.color} stroke={SURFACE} strokeWidth={2} />
                </g>
              );
            })}
            {showEndLabels &&
              series.map((s, si) => (
                <text key={s.name} x={x(n - 1) + 9} y={(endYs[si] ?? 0) + 4} className="chart-halo">
                  {fmt(at(s, n - 1))}
                </text>
              ))}
          </svg>
        )}
        <ChartTooltip tip={tip} />
      </div>
      {series.length >= 2 && (
        <ul className="chart-legend chart-legend-row">
          {series.map((s) => (
            <li key={s.name} className="chart-legend-item">
              <span className="chart-legend-key" style={{ background: s.color }} />
              <span className="chart-legend-label">{s.name}</span>
              <span className="chart-legend-value">{fmt(s.values.reduce((a, b) => a + b, 0))}</span>
            </li>
          ))}
        </ul>
      )}
      <SrTable
        caption={title}
        head={[t.srPeriod, ...series.map((s) => s.name)]}
        rows={labels.map((label, i) => [label, ...series.map((s) => fmt(at(s, i)))])}
      />
    </div>
  );
}
