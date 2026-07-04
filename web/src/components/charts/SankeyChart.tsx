import { ChartTooltip, markCenter, SrTable, useChartBox } from './common';

export interface SankeyNodeDef {
  id: string;
  label: string;
  color: string;
  col: number;
}

export interface SankeyLinkDef {
  source: string;
  target: string;
  value: number;
}

interface LaidNode extends SankeyNodeDef {
  value: number;
  x: number;
  y: number;
  h: number;
  outOff: number;
  inOff: number;
}

const NODE_W = 10;
const NODE_GAP = 14;
const PAD = { top: 10, right: 10, bottom: 10, left: 10 };

export function SankeyChart({
  title,
  nodes,
  links,
  unit,
  height = 210,
}: {
  title: string;
  nodes: SankeyNodeDef[];
  links: SankeyLinkDef[];
  unit: string;
  height?: number;
}) {
  const { ref, width, tip, showTip, hideTip } = useChartBox<HTMLDivElement>();

  const activeLinks = links.filter((l) => l.value > 0);
  const nodeValue = (id: string) =>
    Math.max(
      activeLinks.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0),
      activeLinks.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0),
    );
  const activeNodes = nodes.map((nd) => ({ ...nd, value: nodeValue(nd.id) })).filter((nd) => nd.value > 0);

  const cols = [...new Set(activeNodes.map((nd) => nd.col))].sort((a, b) => a - b);
  const lastCol = cols[cols.length - 1];
  const ready = width > 120 && activeNodes.length > 0 && cols.length > 1;

  const laid = new Map<string, LaidNode>();
  let ribbons: { d: string; color: string; source: string; target: string; value: number }[] = [];

  if (ready) {
    const colX = new Map(
      cols.map((c, i) => [c, PAD.left + (i * (width - PAD.left - PAD.right - NODE_W)) / (cols.length - 1)]),
    );
    const plotH = height - PAD.top - PAD.bottom;
    let scale = Infinity;
    for (const c of cols) {
      const colNodes = activeNodes.filter((nd) => nd.col === c);
      const sum = colNodes.reduce((s, nd) => s + nd.value, 0);
      scale = Math.min(scale, (plotH - (colNodes.length - 1) * NODE_GAP) / sum);
    }
    for (const c of cols) {
      const colNodes = activeNodes.filter((nd) => nd.col === c);
      const colH = colNodes.reduce((s, nd) => s + nd.value * scale, 0) + (colNodes.length - 1) * NODE_GAP;
      let yCursor = PAD.top + (plotH - colH) / 2;
      for (const nd of colNodes) {
        const h = Math.max(2, nd.value * scale);
        laid.set(nd.id, { ...nd, x: colX.get(c) ?? PAD.left, y: yCursor, h, outOff: 0, inOff: 0 });
        yCursor += h + NODE_GAP;
      }
    }
    ribbons = activeLinks.flatMap((l) => {
      const s = laid.get(l.source);
      const t = laid.get(l.target);
      if (!s || !t) return [];
      const th = Math.max(1.5, l.value * scale);
      const sy = s.y + s.outOff;
      const ty = t.y + t.inOff;
      s.outOff += l.value * scale;
      t.inOff += l.value * scale;
      const x0 = s.x + NODE_W;
      const x1 = t.x;
      const cx = (x0 + x1) / 2;
      const d = [
        `M ${x0.toFixed(1)} ${sy.toFixed(1)}`,
        `C ${cx.toFixed(1)} ${sy.toFixed(1)}, ${cx.toFixed(1)} ${ty.toFixed(1)}, ${x1.toFixed(1)} ${ty.toFixed(1)}`,
        `L ${x1.toFixed(1)} ${(ty + th).toFixed(1)}`,
        `C ${cx.toFixed(1)} ${(ty + th).toFixed(1)}, ${cx.toFixed(1)} ${(sy + th).toFixed(1)}, ${x0.toFixed(1)} ${(sy + th).toFixed(1)}`,
        'Z',
      ].join(' ');
      return [{ d, color: t.color, source: s.label, target: t.label, value: l.value }];
    });
  }

  return (
    <div className="chart-block">
      <div className="chart-canvas" ref={ref}>
        {ready && (
          <svg width={width} height={height} role="img" aria-label={title}>
            {ribbons.map((r, i) => (
              <path
                key={i}
                d={r.d}
                fill={r.color}
                className="sankey-link"
                tabIndex={0}
                onPointerMove={(e) => showTip(e, `${r.source} → ${r.target}`, [{ color: r.color, value: String(r.value), label: unit }])}
                onPointerLeave={hideTip}
                onFocus={(e) =>
                  showTip(markCenter(e.currentTarget), `${r.source} → ${r.target}`, [
                    { color: r.color, value: String(r.value), label: unit },
                  ])
                }
                onBlur={hideTip}
              />
            ))}
            {[...laid.values()].map((nd) => (
              <g key={nd.id}>
                <rect
                  x={nd.x}
                  y={nd.y}
                  width={NODE_W}
                  height={nd.h}
                  rx={2}
                  fill={nd.color}
                  className="sankey-node"
                  tabIndex={0}
                  onPointerMove={(e) => showTip(e, nd.label, [{ color: nd.color, value: String(nd.value), label: unit }])}
                  onPointerLeave={hideTip}
                  onFocus={(e) =>
                    showTip(markCenter(e.currentTarget), nd.label, [{ color: nd.color, value: String(nd.value), label: unit }])
                  }
                  onBlur={hideTip}
                />
                <text
                  x={nd.col === lastCol ? nd.x - 7 : nd.x + NODE_W + 7}
                  y={nd.y + nd.h / 2 + 4}
                  textAnchor={nd.col === lastCol ? 'end' : 'start'}
                  className="chart-halo"
                >
                  {nd.label} <tspan className="chart-halo-num">{nd.value}</tspan>
                </text>
              </g>
            ))}
          </svg>
        )}
        <ChartTooltip tip={tip} />
      </div>
      <SrTable
        caption={title}
        head={['מ־', 'אל', unit]}
        rows={activeLinks.map((l) => [
          nodes.find((nd) => nd.id === l.source)?.label ?? l.source,
          nodes.find((nd) => nd.id === l.target)?.label ?? l.target,
          l.value,
        ])}
      />
    </div>
  );
}
