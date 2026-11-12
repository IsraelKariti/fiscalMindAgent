import { useEffect, useMemo, useState } from 'react';
import { api, type LlmCallSummary } from '../api';
import { formatCompact, formatTimestamp, formatUsd, humanizePurpose, LOCALE } from '../format';
import { useT } from '../i18n';
import { CallDetailModal } from './admin/AdminLlmCalls';
import { MODEL_LABELS } from './admin/shared';
import { ChartCard, ChartEmpty, NEUTRAL, Seg, SERIES } from './charts/common';
import { LineChart } from './charts/LineChart';
import {
  bucketCalls,
  bucketLabel,
  costGraphOptions,
  OTHER_KEY,
  presetRange,
  type GroupBy,
  type Measure,
  type RangePreset,
} from './costGraph';
import { localDay } from './costSummary';

/**
 * The admin-only cost graph tab (openspec `admin-cost-graph-tab`): one line
 * chart of the client's LLM calls the admin filters by type, model and date
 * range, groups by day / week / month and reads as cost, calls or tokens.
 * Loads the calls once when the tab opens (same route as the cost tab) and
 * does every computation in the browser with costGraph.ts. Clicking a bucket
 * lists its calls; the controls (not the custom dates) are remembered in
 * localStorage so the next client opens with the same view.
 */

const STORAGE_KEY = 'fm.costGraph';
/* The sixth own line gets a blue slot the shared palette does not carry; "other" is neutral. */
const PALETTE = [SERIES.violet, SERIES.cyan, SERIES.pink, SERIES.amber, SERIES.green, '#4f7be0'];
const PRESETS: RangePreset[] = [7, 30, 90, 'all'];
const GROUPS: GroupBy[] = ['day', 'week', 'month'];
const MEASURES: Measure[] = ['cost', 'calls', 'tokens'];

interface Stored {
  purpose: string | null;
  model: string | null;
  preset: RangePreset;
  groupBy: GroupBy;
  measure: Measure;
}

const DEFAULTS: Stored = { purpose: null, model: null, preset: 'all', groupBy: 'day', measure: 'cost' };

function readStored(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const v = JSON.parse(raw) as Partial<Record<keyof Stored, unknown>>;
    return {
      purpose: typeof v.purpose === 'string' ? v.purpose : null,
      model: typeof v.model === 'string' ? v.model : null,
      preset: PRESETS.includes(v.preset as RangePreset) ? (v.preset as RangePreset) : 'all',
      groupBy: GROUPS.includes(v.groupBy as GroupBy) ? (v.groupBy as GroupBy) : 'day',
      measure: MEASURES.includes(v.measure as Measure) ? (v.measure as Measure) : 'cost',
    };
  } catch {
    return DEFAULTS;
  }
}

function writeStored(s: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage blocked (private mode): the tab still works with defaults.
  }
}

export function CostGraphCard({ clientId }: { clientId: string }) {
  const { t } = useT();
  const [calls, setCalls] = useState<LlmCallSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  const [initial] = useState(readStored);
  const [purpose, setPurpose] = useState<string | null>(initial.purpose);
  const [model, setModel] = useState<string | null>(initial.model);
  const [preset, setPreset] = useState<RangePreset | 'custom'>(initial.preset);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>(initial.groupBy);
  const [measure, setMeasure] = useState<Measure>(initial.measure);
  const [selected, setSelected] = useState<number | null>(null);

  const today = localDay(new Date());

  useEffect(() => {
    let cancelled = false;
    setCalls(null);
    setError(null);
    setSelected(null);
    api
      .adminGetClientLlmCalls(clientId)
      .then(({ calls: rows }) => {
        if (!cancelled) setCalls(rows);
      })
      .catch(() => {
        if (!cancelled) setError(t.costLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  const options = useMemo(() => costGraphOptions(calls ?? []), [calls]);

  // Once the calls are known: drop a remembered type/model this client lacks,
  // and give the remembered preset its dates for this client.
  useEffect(() => {
    if (calls === null) return;
    if (purpose !== null && !options.purposes.includes(purpose)) setPurpose(null);
    if (model !== null && !options.models.includes(model)) setModel(null);
    const p = preset === 'custom' ? 'all' : preset;
    const range = presetRange(p, today, options.life);
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calls]);

  useEffect(() => {
    writeStored({ purpose, model, preset: preset === 'custom' ? 'all' : preset, groupBy, measure });
  }, [purpose, model, preset, groupBy, measure]);

  const graph = useMemo(
    () => bucketCalls(calls ?? [], { purpose, model, from, to, groupBy, measure }),
    [calls, purpose, model, from, to, groupBy, measure],
  );

  const purposeLabel = (key: string) => (key === OTHER_KEY ? t.costGraphOther : (t.llmPurposeLabels[key] ?? humanizePurpose(key)));
  const modelLabel = (key: string) => MODEL_LABELS[key] ?? key;
  const fmtCost = (v: number) => (v === 0 ? '$0' : formatUsd(v));
  const fmt = measure === 'cost' ? fmtCost : measure === 'tokens' ? formatCompact : (v: number) => v.toLocaleString(LOCALE);
  const presetLabel = (p: RangePreset) => (p === 'all' ? t.costGraphPresetAll : t.costGraphPresetDays(p));
  const groupLabel = (g: GroupBy) => (g === 'day' ? t.costGraphGroupDay : g === 'week' ? t.costGraphGroupWeek : t.costGraphGroupMonth);
  const measureLabel = (m: Measure) =>
    m === 'cost' ? t.costGraphMeasureCost : m === 'calls' ? t.costGraphMeasureCalls : t.costGraphMeasureTokens;

  const choosePreset = (p: RangePreset) => {
    const range = presetRange(p, today, options.life);
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
    setSelected(null);
  };
  const chooseDate = (which: 'from' | 'to', value: string) => {
    if (!value) return;
    (which === 'from' ? setFrom : setTo)(value);
    setPreset('custom');
    setSelected(null);
  };
  const change = <V,>(set: (v: V) => void) => (v: V) => {
    set(v);
    setSelected(null);
  };

  if (error) return <div className="error-banner">{error}</div>;

  const loaded = calls !== null;
  const labels = graph.keys.map((k) => bucketLabel(k, groupBy, LOCALE));
  const series = graph.series.map((s, i) => ({
    name: purposeLabel(s.key),
    color: s.key === OTHER_KEY ? NEUTRAL : (PALETTE[i] ?? NEUTRAL),
    values: s.values,
  }));
  const bucket = selected !== null ? graph.buckets[selected] : undefined;
  const summaryCost = `${fmtCost(graph.summary.cost)}${graph.summary.unpriced > 0 ? '+' : ''}`;

  return (
    <div className="cost-graph">
      <div className="usage-toolbar">
        <div className="admin-toolbar usage-toolbar-row">
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphTypeLabel}</span>
            <select value={purpose ?? 'all'} onChange={(e) => change(setPurpose)(e.target.value === 'all' ? null : e.target.value)}>
              <option value="all">{t.costGraphAllTypes}</option>
              {options.purposes.map((p) => (
                <option key={p} value={p}>
                  {purposeLabel(p)}
                </option>
              ))}
            </select>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphModelLabel}</span>
            <select value={model ?? 'all'} onChange={(e) => change(setModel)(e.target.value === 'all' ? null : e.target.value)}>
              <option value="all">{t.costGraphAllModels}</option>
              {options.models.map((m) => (
                <option key={m} value={m}>
                  {modelLabel(m)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-toolbar usage-toolbar-row">
          <span className="usage-filter-label">{t.costGraphRangeLabel}</span>
          <Seg
            label={t.costGraphRangeLabel}
            value={preset}
            options={PRESETS.map((p) => ({ value: p as RangePreset | 'custom', label: presetLabel(p) }))}
            onChange={(p) => {
              if (p !== 'custom') choosePreset(p);
            }}
          />
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphFrom}</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => chooseDate('from', e.target.value)} />
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphTo}</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => chooseDate('to', e.target.value)} />
          </label>
        </div>
        <div className="admin-toolbar usage-toolbar-row">
          <span className="usage-filter-label">{t.costGraphGroupLabel}</span>
          <Seg
            label={t.costGraphGroupLabel}
            value={groupBy}
            options={GROUPS.map((g) => ({ value: g, label: groupLabel(g) }))}
            onChange={change(setGroupBy)}
          />
          <span className="usage-filter-label">{t.costGraphMeasureLabel}</span>
          <Seg
            label={t.costGraphMeasureLabel}
            value={measure}
            options={MEASURES.map((m) => ({ value: m, label: measureLabel(m) }))}
            onChange={change(setMeasure)}
          />
        </div>
      </div>

      {!loaded && <p className="muted">{t.loading}</p>}
      {loaded && calls.length === 0 && <p className="muted cost-empty">{t.costEmpty}</p>}

      {loaded && calls.length > 0 && (
        <>
          <p className="muted cost-graph-summary" dir="auto">
            {t.costGraphSummary(graph.summary.calls, summaryCost)}
          </p>

          <ChartCard title={t.costGraphTitle} subtitle={t.costGraphSubtitle}>
            {series.length > 0 ? (
              <LineChart
                title={t.costGraphTitle}
                labels={labels}
                series={series}
                format={fmt}
                extraTip={(i) => [{ value: String(graph.buckets[i]?.length ?? 0), label: t.costDayCalls }]}
                onSelect={(i) => setSelected((cur) => (cur === i ? null : i))}
                selectedIdx={selected}
                height={280}
              />
            ) : (
              <ChartEmpty>{t.costGraphNoneInRange}</ChartEmpty>
            )}
          </ChartCard>

          {bucket && selected !== null && (
            <section className="card chart-card cost-graph-bucket">
              <header className="chart-card-header cost-graph-bucket-header">
                <div>
                  <h3 className="chart-title">{labels[selected]}</h3>
                  <span className="chart-subtitle">{t.costGraphBucketCalls(bucket.length)}</span>
                </div>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setSelected(null)}>
                  {t.costGraphClose}
                </button>
              </header>
              {bucket.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.costColType}</th>
                        <th>{t.costColModel}</th>
                        <th>{t.costColDate}</th>
                        <th>{t.costColTokens}</th>
                        <th>{t.costColCost}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.map((c) => (
                        <tr key={c.id}>
                          <td className="admin-table-name">
                            {purposeLabel(c.purpose)}
                            {c.status === 'error' && <span className="badge badge-danger cost-failed-mark">{t.costFailedMark}</span>}
                          </td>
                          <td dir="ltr">{modelLabel(c.model)}</td>
                          <td>{formatTimestamp(c.createdAt)}</td>
                          <td dir="ltr">{formatCompact(c.inputTokens + c.outputTokens + c.thinkingTokens)}</td>
                          <td dir="ltr">{c.cost === null ? '—' : fmtCost(c.cost)}</td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpenCallId(c.id)}>
                              {t.costOpenCall}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <ChartEmpty>{t.costGraphNoneInRange}</ChartEmpty>
              )}
            </section>
          )}
        </>
      )}

      {openCallId && <CallDetailModal callId={openCallId} onClose={() => setOpenCallId(null)} />}
    </div>
  );
}
