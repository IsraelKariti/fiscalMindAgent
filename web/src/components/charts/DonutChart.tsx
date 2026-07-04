import { ChartTooltip, markCenter, SrTable, useChartBox } from './common';

export interface DonutDatum {
  label: string;
  value: number;
  color: string;
}

const SIZE = 150;
const R_OUTER = 70;
const R_INNER = 45;
const PAD_ANGLE = 0.03; // ≈2px surface gap between slices at the outer radius

function point(r: number, a: number): string {
  return `${(SIZE / 2 + r * Math.sin(a)).toFixed(2)} ${(SIZE / 2 - r * Math.cos(a)).toFixed(2)}`;
}

function slicePath(a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${point(R_OUTER, a0)}`,
    `A ${R_OUTER} ${R_OUTER} 0 ${large} 1 ${point(R_OUTER, a1)}`,
    `L ${point(R_INNER, a1)}`,
    `A ${R_INNER} ${R_INNER} 0 ${large} 0 ${point(R_INNER, a0)}`,
    'Z',
  ].join(' ');
}

export function DonutChart({
  title,
  data,
  centerLabel,
}: {
  title: string;
  data: DonutDatum[];
  centerLabel: string;
}) {
  const { ref, tip, showTip, hideTip } = useChartBox<HTMLDivElement>();
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return null;

  const tau = Math.PI * 2;
  let acc = 0;
  const arcs = slices.map((d) => {
    const a0 = (acc / total) * tau;
    acc += d.value;
    const a1 = (acc / total) * tau;
    // Shrink each slice by the pad angle so a sliver of surface separates
    // neighbors; slivers keep a visible arc instead of inverting.
    const pad = Math.min(PAD_ANGLE, (a1 - a0) / 3);
    return { ...d, a0: a0 + pad / 2, a1: a1 - pad / 2 };
  });

  const tipRows = (d: DonutDatum) => [
    { color: d.color, value: String(d.value), label: `${Math.round((d.value / total) * 100)}% of ${total}` },
  ];

  const only = arcs.length === 1 ? arcs[0] : undefined;

  return (
    <div className="donut-layout">
      <div className="chart-canvas donut-canvas" ref={ref}>
        <svg width={SIZE} height={SIZE} role="img" aria-label={title}>
          {only ? (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={(R_OUTER + R_INNER) / 2}
              fill="none"
              stroke={only.color}
              strokeWidth={R_OUTER - R_INNER}
              className="donut-slice"
              tabIndex={0}
              onPointerMove={(e) => showTip(e, only.label, tipRows(only))}
              onPointerLeave={hideTip}
              onFocus={(e) => showTip(markCenter(e.currentTarget), only.label, tipRows(only))}
              onBlur={hideTip}
            />
          ) : (
            arcs.map((d, i) => (
              <path
                key={i}
                d={slicePath(d.a0, d.a1)}
                fill={d.color}
                className="donut-slice"
                tabIndex={0}
                onPointerMove={(e) => showTip(e, d.label, tipRows(d))}
                onPointerLeave={hideTip}
                onFocus={(e) => showTip(markCenter(e.currentTarget), d.label, tipRows(d))}
                onBlur={hideTip}
              />
            ))
          )}
          <text x={SIZE / 2} y={SIZE / 2 + 2} textAnchor="middle" className="donut-center-value">
            {total}
          </text>
          <text x={SIZE / 2} y={SIZE / 2 + 18} textAnchor="middle" className="donut-center-label">
            {centerLabel}
          </text>
        </svg>
        <ChartTooltip tip={tip} />
      </div>
      <ul className="chart-legend">
        {slices.map((d, i) => (
          <li key={i} className="chart-legend-item">
            <span className="chart-legend-swatch" style={{ background: d.color }} />
            <span className="chart-legend-label">{d.label}</span>
            <span className="chart-legend-value">{d.value}</span>
          </li>
        ))}
      </ul>
      <SrTable
        caption={title}
        head={['Category', 'Count', 'Share']}
        rows={slices.map((d) => [d.label, d.value, `${Math.round((d.value / total) * 100)}%`])}
      />
    </div>
  );
}
