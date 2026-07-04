import { type KeyboardEvent, type PointerEvent, useState } from 'react';
import { ChartTooltip, SrTable, SURFACE, useChartBox } from './common';

export interface LineSeries {
  name: string;
  color: string;
  values: number[];
}

const PAD = { top: 14, right: 34, bottom: 26, left: 34 };

function niceStep(max: number): number {
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, raw)));
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
}: {
  title: string;
  labels: string[];
  series: LineSeries[];
  area?: boolean;
  height?: number;
}) {
  const { ref, width, tip, showTip, hideTip } = useChartBox<HTMLDivElement>();
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const n = labels.length;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const maxV = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(maxV);
  const yMax = Math.ceil(maxV / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= yMax; t += step) ticks.push(t);

  const at = (s: LineSeries, i: number) => s.values[i] ?? 0;
  const x = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i * plotW) / (n - 1));
  const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

  const setHover = (i: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    setHoverIdx(i);
    showTip(
      { clientX: el.getBoundingClientRect().left + x(i), clientY },
      labels[i],
      series.map((s) => ({ color: s.color, value: String(at(s, i)), label: s.name })),
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
    const i = n <= 1 ? 0 : Math.min(n - 1, Math.max(0, Math.round(((px - PAD.left) / plotW) * (n - 1))));
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
  const endYs = series.map((s) => y(at(s, n - 1)));
  const [e0, e1] = [endYs[0], endYs[1]];
  if (endYs.length === 2 && e0 !== undefined && e1 !== undefined && Math.abs(e0 - e1) < 15) {
    const mid = (e0 + e1) / 2;
    endYs[e0 <= e1 ? 0 : 1] = mid - 8;
    endYs[e0 <= e1 ? 1 : 0] = mid + 8;
  }

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
                  x1={PAD.left}
                  x2={width - PAD.right}
                  y1={y(t)}
                  y2={y(t)}
                  className={t === 0 ? 'chart-axis-line' : 'chart-grid-line'}
                />
                <text x={PAD.left - 7} y={y(t) + 3.5} textAnchor="end" className="chart-tick-label">
                  {t.toLocaleString()}
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
            {series.map((s, si) => (
              <text key={s.name} x={x(n - 1) + 9} y={(endYs[si] ?? 0) + 4} className="chart-halo">
                {at(s, n - 1).toLocaleString()}
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
              <span className="chart-legend-value">{s.values.reduce((a, b) => a + b, 0)}</span>
            </li>
          ))}
        </ul>
      )}
      <SrTable
        caption={title}
        head={['Period', ...series.map((s) => s.name)]}
        rows={labels.map((label, i) => [label, ...series.map((s) => at(s, i))])}
      />
    </div>
  );
}
