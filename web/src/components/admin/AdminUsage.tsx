import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { api, type Accountant, type LlmDailyUsage } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { formatCompact, formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { ChartCard, ChartEmpty, NEUTRAL, SERIES } from '../charts/common';
import { LineChart, type LineSeries } from '../charts/LineChart';

const RANGES = [7, 30, 90] as const;
type RangeDays = (typeof RANGES)[number];

/* Categorical slots in the palette's fixed order (see charts/common.tsx);
   groups beyond the five slots fold into a neutral "Other" line. */
const SLOT_COLORS = [SERIES.violet, SERIES.cyan, SERIES.pink, SERIES.amber, SERIES.green];

type GroupBy = 'accountant' | 'agent';
type Metric = 'cost' | 'tokens';

const tokensOf = (r: LlmDailyUsage) => r.inputTokens + r.outputTokens + r.thinkingTokens;

function Seg<V extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      className="seg-control"
      role="group"
      aria-label={label}
      style={{ '--seg-i': index, '--seg-n': options.length } as CSSProperties}
    >
      <span className="seg-thumb" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={`seg-option ${value === o.value ? 'seg-active' : ''}`}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * LLM spend analytics: one daily multi-line chart whose lines are either
 * accountants or agent types, scoped by the accountant / agent-type filters.
 * The two comparisons the admin reaches for — every agent of one accountant,
 * and one agent type across every accountant — are (filter accountant +
 * group by agents) and (filter agent type + group by accountants).
 */
export function AdminUsage({ accountants }: { accountants: Accountant[] }) {
  const { t } = useT();
  const [days, setDays] = useState<RangeDays>(30);
  const [data, setData] = useState<{ since: string; rows: LlmDailyUsage[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('accountant');
  const [metric, setMetric] = useState<Metric>('cost');
  const [accountantFilter, setAccountantFilter] = useState('all');
  const [agentTypeFilter, setAgentTypeFilter] = useState('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .adminLlmUsageDaily(days)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t.usageLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const accountantById = useMemo(() => new Map(accountants.map((a) => [a.id, a])), [accountants]);
  const accountantLabel = (id: string) => {
    const a = accountantById.get(id);
    return a ? (a.name ?? a.email) : id.slice(0, 8);
  };
  const groupKeyOf = (r: LlmDailyUsage) => (groupBy === 'accountant' ? r.userId : r.agentType);
  const groupLabelOf = (key: string) => (groupBy === 'accountant' ? accountantLabel(key) : t[getAgentUI(key).nameKey]);

  const metricValue = (r: LlmDailyUsage) => (metric === 'cost' ? (r.cost ?? 0) : tokensOf(r));
  const fmtValue = metric === 'cost' ? formatUsd : formatCompact;

  /* The continuous day axis, since → since+days-1 ("YYYY-MM-DD"): missing days
     must plot as 0, not disappear. Derived from the server's `since`, so the
     browser clock never shifts the buckets. */
  const dayKeys = useMemo(() => {
    if (!data) return [];
    const [y, m, d] = data.since.split('-').map(Number);
    return Array.from({ length: days }, (_, i) => {
      const dt = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + i);
      const mm = String(dt.getMonth() + 1).padStart(2, '0');
      const dd = String(dt.getDate()).padStart(2, '0');
      return `${dt.getFullYear()}-${mm}-${dd}`;
    });
  }, [data, days]);

  const dayLabels = useMemo(
    () =>
      dayKeys.map((k) => {
        const [y, m, d] = k.split('-').map(Number);
        return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).toLocaleDateString(LOCALE, { day: 'numeric', month: 'numeric' });
      }),
    [dayKeys],
  );

  /* Slot colors are assigned from the UNFILTERED totals (by lifetime tokens in
     range — pricing-independent), so toggling a filter never repaints the
     surviving lines. Only the five largest groups get their own line; the rest
     fold into "Other". */
  const slotByKey = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of data?.rows ?? []) {
      const k = groupKeyOf(r);
      totals.set(k, (totals.get(k) ?? 0) + tokensOf(r));
    }
    const ordered = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
    return new Map(ordered.slice(0, SLOT_COLORS.length).map((k, i) => [k, i]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, groupBy]);

  const filtered = useMemo(
    () =>
      (data?.rows ?? []).filter(
        (r) =>
          (accountantFilter === 'all' || r.userId === accountantFilter) &&
          (agentTypeFilter === 'all' || r.agentType === agentTypeFilter),
      ),
    [data, accountantFilter, agentTypeFilter],
  );

  const hasUnpriced = useMemo(() => filtered.some((r) => r.cost === null && tokensOf(r) > 0), [filtered]);

  const { series, groupTable } = useMemo(() => {
    const dayIndex = new Map(dayKeys.map((k, i) => [k, i]));
    const byGroup = new Map<string, { values: number[]; cost: number; input: number; output: number; thinking: number }>();
    for (const r of filtered) {
      const key = groupKeyOf(r);
      let g = byGroup.get(key);
      if (!g) {
        g = { values: new Array<number>(dayKeys.length).fill(0), cost: 0, input: 0, output: 0, thinking: 0 };
        byGroup.set(key, g);
      }
      const i = dayIndex.get(r.day);
      if (i !== undefined) g.values[i] = (g.values[i] ?? 0) + metricValue(r);
      g.cost += r.cost ?? 0;
      g.input += r.inputTokens;
      g.output += r.outputTokens;
      g.thinking += r.thinkingTokens;
    }

    // Chart series: slotted groups keep their color; the rest sum into "Other".
    const slotted = [...byGroup.entries()]
      .filter(([k]) => slotByKey.has(k))
      .sort((a, b) => (slotByKey.get(a[0]) ?? 0) - (slotByKey.get(b[0]) ?? 0));
    const rest = [...byGroup.entries()].filter(([k]) => !slotByKey.has(k));
    const chartSeries: LineSeries[] = slotted.map(([k, g]) => ({
      name: groupLabelOf(k),
      color: SLOT_COLORS[slotByKey.get(k) ?? 0] ?? NEUTRAL,
      values: g.values,
    }));
    if (rest.length > 0) {
      const other = new Array<number>(dayKeys.length).fill(0);
      for (const [, g] of rest) g.values.forEach((v, i) => (other[i] = (other[i] ?? 0) + v));
      chartSeries.push({ name: t.usageOtherSeries, color: NEUTRAL, values: other });
    }

    // Breakdown table: every group unfolded, largest first.
    const totalMetric = [...byGroup.values()].reduce((sum, g) => sum + g.values.reduce((a, b) => a + b, 0), 0);
    const table = [...byGroup.entries()]
      .map(([k, g]) => ({
        key: k,
        label: groupLabelOf(k),
        color: slotByKey.has(k) ? SLOT_COLORS[slotByKey.get(k) ?? 0] : NEUTRAL,
        total: g.values.reduce((a, b) => a + b, 0),
        cost: g.cost,
        input: g.input,
        output: g.output,
        thinking: g.thinking,
      }))
      .sort((a, b) => b.total - a.total)
      .map((row) => ({ ...row, share: totalMetric > 0 ? row.total / totalMetric : 0 }));

    return { series: chartSeries, groupTable: table };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, dayKeys, slotByKey, metric, groupBy, t]);

  const kpis = useMemo(() => {
    let cost = 0;
    let tokens = 0;
    const perDayCost = new Map<string, number>();
    for (const r of filtered) {
      cost += r.cost ?? 0;
      tokens += tokensOf(r);
      perDayCost.set(r.day, (perDayCost.get(r.day) ?? 0) + (r.cost ?? 0));
    }
    let peakDay: string | null = null;
    let peakCost = 0;
    for (const [day, c] of perDayCost) {
      if (c > peakCost) {
        peakCost = c;
        peakDay = day;
      }
    }
    return { cost, tokens, avg: cost / days, peakDay, peakCost };
  }, [filtered, days]);

  const agentTypes = useMemo(() => {
    const types = new Set<string>();
    for (const a of accountants) for (const agent of a.agents) types.add(agent.agentType);
    for (const r of data?.rows ?? []) types.add(r.agentType);
    return [...types];
  }, [accountants, data]);

  const plus = hasUnpriced ? '+' : '';
  const hasData = filtered.length > 0;
  const peakLabel =
    kpis.peakDay !== null
      ? new Date(`${kpis.peakDay}T00:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })
      : '—';

  return (
    <div className={`usage-page${loading && data ? ' usage-stale' : ''}`}>
      <div className="admin-toolbar usage-toolbar">
        <Seg
          label={t.usageRangeDays(days)}
          value={days}
          options={RANGES.map((n) => ({ value: n, label: t.usageRangeDays(n) }))}
          onChange={setDays}
        />
        <Seg
          label={t.usageGroupByLabel}
          value={groupBy}
          options={[
            { value: 'accountant' as const, label: t.usageGroupAccountants },
            { value: 'agent' as const, label: t.usageGroupAgents },
          ]}
          onChange={setGroupBy}
        />
        <label className="usage-filter">
          <span className="usage-filter-label">{t.usageAccountantFilterLabel}</span>
          <select value={accountantFilter} onChange={(e) => setAccountantFilter(e.target.value)}>
            <option value="all">{t.usageAllAccountants}</option>
            {accountants.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name ?? a.email}
              </option>
            ))}
          </select>
        </label>
        <label className="usage-filter">
          <span className="usage-filter-label">{t.usageAgentFilterLabel}</span>
          <select value={agentTypeFilter} onChange={(e) => setAgentTypeFilter(e.target.value)}>
            <option value="all">{t.usageAllAgentTypes}</option>
            {agentTypes.map((type) => (
              <option key={type} value={type}>
                {t[getAgentUI(type).nameKey]}
              </option>
            ))}
          </select>
        </label>
        <Seg
          label={t.usageMetricCost}
          value={metric}
          options={[
            { value: 'cost' as const, label: t.usageMetricCost },
            { value: 'tokens' as const, label: t.usageMetricTokens },
          ]}
          onChange={setMetric}
        />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="stat-row">
        <div className="card stat-tile">
          <span className="stat-label">{t.usageTotalSpend}</span>
          <span className="stat-value" dir="ltr">
            {hasData ? `${formatUsd(kpis.cost)}${plus}` : '—'}
          </span>
          <span className="stat-context">{t.usageInRange(days)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.usageDailyAvg}</span>
          <span className="stat-value" dir="ltr">
            {hasData ? `${formatUsd(kpis.avg)}${plus}` : '—'}
          </span>
          <span className="stat-context">{t.usageInRange(days)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.usageTotalTokens}</span>
          <span className="stat-value" dir="ltr">
            {hasData ? formatCompact(kpis.tokens) : '—'}
          </span>
          <span className="stat-context">{t.usageInRange(days)}</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.usagePeakDay}</span>
          <span className="stat-value" dir="ltr">
            {hasData && kpis.peakDay !== null ? formatUsd(kpis.peakCost) : '—'}
          </span>
          <span className="stat-context">{peakLabel}</span>
        </div>
      </div>

      <ChartCard
        title={metric === 'cost' ? t.usageChartTitle : t.usageChartTitleTokens}
        subtitle={t.usageChartSubtitle}
      >
        {hasData ? (
          <LineChart
            title={metric === 'cost' ? t.usageChartTitle : t.usageChartTitleTokens}
            labels={dayLabels}
            series={series}
            format={fmtValue}
            height={280}
          />
        ) : (
          <ChartEmpty>{loading ? t.loading : t.usageNoData}</ChartEmpty>
        )}
      </ChartCard>

      {hasUnpriced && <p className="muted usage-unpriced-note">{t.usageUnpricedNote}</p>}

      {hasData && (
        <section className="card usage-breakdown">
          <h3 className="chart-title">{t.usageBreakdownTitle}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.usageColGroup}</th>
                  <th>{t.usageColCost}</th>
                  <th>{t.usageColInputTokens}</th>
                  <th>{t.usageColOutputTokens}</th>
                  <th>{t.usageColThinkingTokens}</th>
                  <th>{t.usageColShare}</th>
                </tr>
              </thead>
              <tbody>
                {groupTable.map((row) => (
                  <tr key={row.key}>
                    <td className="admin-table-name">
                      <span className="chart-legend-key" style={{ background: row.color }} />
                      <span className="usage-group-name">{row.label}</span>
                    </td>
                    <td dir="ltr">{formatUsd(row.cost)}</td>
                    <td dir="ltr">{row.input.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{row.output.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{row.thinking.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{`${Math.round(row.share * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
