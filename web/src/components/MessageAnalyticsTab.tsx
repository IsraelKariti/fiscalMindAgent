import { useEffect, useState } from 'react';
import { api, type MessageAnalytics } from '../api';
import { formatUsd, LOCALE } from '../format';
import { useT } from '../i18n';
import { ChartCard, ChartEmpty, NEUTRAL, Seg, SERIES } from './charts/common';
import { LineChart } from './charts/LineChart';
import { parseDay } from './costGraph';
import { localDay } from './costSummary';
import {
  ANALYTICS_PRESETS,
  analyticsPresetRange,
  durationParts,
  formatPercent,
  readStoredPreset,
  waitCurveIndex,
  waitLabel,
  writeStoredPreset,
  type AnalyticsPreset,
} from './messageAnalytics';

/**
 * The admin-only analytics tab of the Settings view (openspec
 * `discarded-message-analytics`): what became of the agent's outbound drafts
 * in a date range — how many were discarded before they were sent, why, what
 * started the cycles that wrote them, how long they lived, the weekly trend
 * and the clients that wasted the most. The figures come from one admin route
 * per range; the preset is remembered in localStorage.
 */
export function MessageAnalyticsTab({ agentInstanceId, onOpenClient }: { agentInstanceId: string; onOpenClient: (clientId: string) => void }) {
  const { t } = useT();
  const [preset, setPreset] = useState<AnalyticsPreset | 'custom'>(readStoredPreset);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [data, setData] = useState<MessageAnalytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = localDay(new Date());

  useEffect(() => {
    // The first reply ("all") already covers the range the preset resolved to.
    if (data && data.from === from && data.to === to) return;
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .adminGetMessageAnalytics(agentInstanceId, from && to ? { from, to } : {})
      .then((d) => {
        if (cancelled) return;
        setData(d);
        // First load: give the remembered preset its dates for this instance.
        if (from === null || to === null) {
          const p = preset === 'custom' ? 'all' : preset;
          const range = analyticsPresetRange(p, today, d.firstDraftDay);
          setPreset(p);
          setFrom(range.from);
          setTo(range.to);
        }
      })
      .catch(() => {
        if (!cancelled) setError(t.analyticsLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentInstanceId, from, to]);

  useEffect(() => {
    if (preset !== 'custom') writeStoredPreset(preset);
  }, [preset]);

  const choosePreset = (p: AnalyticsPreset) => {
    const range = analyticsPresetRange(p, today, data?.firstDraftDay ?? null);
    setPreset(p);
    setFrom(range.from);
    setTo(range.to);
  };
  const chooseDate = (which: 'from' | 'to', value: string) => {
    if (!value) return;
    (which === 'from' ? setFrom : setTo)(value);
    setPreset('custom');
  };

  const cost = (c: { known: number; unknown: number }) => `${c.known === 0 ? '$0' : formatUsd(c.known)}${c.unknown > 0 ? '+' : ''}`;
  const duration = (ms: number | null) =>
    ms === null ? '—' : durationParts(ms).map((p) => `${p.value} ${t.analyticsUnit[p.unit]}`).join(' ');
  const reasonLabel = (r: string) => t.analyticsReason[r] ?? r;
  const triggerLabel = (tr: string | null) => (tr === null ? t.analyticsTriggerUnknown : (t.analyticsTrigger[tr] ?? tr));
  const weekLabel = (day: string) => parseDay(day).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' });

  const loaded = data !== null && from !== null && to !== null;
  const empty = loaded && data.tiles.written === 0;

  return (
    <div className="cost-graph message-analytics">
      <div className="usage-toolbar">
        <div className="admin-toolbar usage-toolbar-row">
          <span className="usage-filter-label">{t.costGraphRangeLabel}</span>
          <Seg
            label={t.costGraphRangeLabel}
            value={preset}
            options={ANALYTICS_PRESETS.map((p) => ({ value: p as AnalyticsPreset | 'custom', label: p === 'all' ? t.costGraphPresetAll : t.costGraphPresetDays(p) }))}
            onChange={(p) => {
              if (p !== 'custom') choosePreset(p);
            }}
          />
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphFrom}</span>
            <input type="date" value={from ?? ''} max={to ?? undefined} onChange={(e) => chooseDate('from', e.target.value)} />
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.costGraphTo}</span>
            <input type="date" value={to ?? ''} min={from ?? undefined} onChange={(e) => chooseDate('to', e.target.value)} />
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && !loaded && <p className="muted">{t.loading}</p>}
      {empty && <p className="muted cost-empty">{t.analyticsEmpty}</p>}

      {loaded && !empty && (
        <>
          <div className="stat-row">
            <div className="card stat-tile">
              <span className="stat-label">{t.analyticsWritten}</span>
              <span className="stat-value" dir="ltr">
                {data.tiles.written.toLocaleString(LOCALE)}
              </span>
              <span className="stat-context">{t.analyticsWrittenContext(data.tiles.sent, data.tiles.pending)}</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.analyticsDiscarded}</span>
              <span className="stat-value" dir="ltr">
                {data.tiles.discarded.toLocaleString(LOCALE)}
              </span>
              <span className="stat-context">{t.analyticsDiscardRate(formatPercent(data.tiles.discardRate))}</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.analyticsDiscardedCost}</span>
              <span className="stat-value" dir="ltr">
                {cost(data.tiles.discardedCost)}
              </span>
              <span className="stat-context">
                {data.tiles.discardedCost.unknown > 0 ? t.analyticsUnknownCost(data.tiles.discardedCost.unknown) : t.analyticsDiscardedCostContext}
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.analyticsAllCost}</span>
              <span className="stat-value" dir="ltr">
                {cost(data.tiles.allCost)}
              </span>
              <span className="stat-context">{t.analyticsWasteShare(formatPercent(data.tiles.wasteShare))}</span>
            </div>
          </div>

          <div className="chart-grid">
            <ChartCard title={t.analyticsReasonsTitle} subtitle={t.analyticsReasonsSubtitle}>
              {data.reasons.length === 0 ? (
                <ChartEmpty>{t.analyticsNoDiscards}</ChartEmpty>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.analyticsColReason}</th>
                        <th>{t.analyticsColCount}</th>
                        <th>{t.costColShare}</th>
                        <th>{t.costColCost}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.reasons.map((r) => (
                        <tr key={r.reason}>
                          <td className="admin-table-name">{reasonLabel(r.reason)}</td>
                          <td dir="ltr">{r.count}</td>
                          <td dir="ltr">{formatPercent(r.share)}</td>
                          <td dir="ltr">{cost(r.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>

            <ChartCard title={t.analyticsLifetimeTitle} subtitle={t.analyticsLifetimeSubtitle} span={2}>
              {data.lifetime.known === 0 ? (
                <ChartEmpty>{t.analyticsNoLifetimes}</ChartEmpty>
              ) : (
                <div className="analytics-lifetime">
                  <dl className="analytics-lifetime-stats">
                    <div>
                      <dt>{t.analyticsMedianLife}</dt>
                      <dd dir="auto">{duration(data.lifetime.medianMs)}</dd>
                    </div>
                    <div>
                      <dt>{t.analyticsAverageLife}</dt>
                      <dd dir="auto">{duration(data.lifetime.averageMs)}</dd>
                    </div>
                    <div>
                      <dt>{t.analyticsWaitShare}</dt>
                      <dd dir="auto">
                        {formatPercent(data.lifetime.medianWaitShare)}
                        <span className="muted analytics-lifetime-note"> {t.analyticsWaitShareContext(data.lifetime.waitShareKnown)}</span>
                      </dd>
                    </div>
                  </dl>
                  {data.lifetime.waitCurve.total === 0 ? (
                    <ChartEmpty>{t.analyticsNoWaitCurve}</ChartEmpty>
                  ) : (
                    <div className="analytics-wait-curve">
                      <div className="chart-card-subtitle">{t.analyticsWaitCurveSubtitle}</div>
                      <LineChart
                        title={t.analyticsWaitCurveTitle}
                        labels={data.lifetime.waitCurve.points.map((_, i) => waitLabel(i * data.lifetime.waitCurve.stepSeconds))}
                        series={[
                          {
                            name: t.analyticsWaitCurveSeries,
                            color: SERIES.pink,
                            values: data.lifetime.waitCurve.points.map((p) => Math.round((100 * p.avoided) / data.lifetime.waitCurve.total)),
                          },
                        ]}
                        format={(v) => `${v}%`}
                        extraTip={(i) => {
                          const p = data.lifetime.waitCurve.points[i];
                          if (!p) return [];
                          return [
                            { value: `${p.avoided} / ${data.lifetime.waitCurve.total}`, label: t.analyticsWaitCurveCount },
                            { value: cost(p.cost), label: t.analyticsWaitCurveCost },
                          ];
                        }}
                        marker={{
                          index: waitCurveIndex(data.currentQuietSeconds, data.lifetime.waitCurve.stepSeconds, data.lifetime.waitCurve.points.length),
                          label: `${t.analyticsWaitCurveNow}: ${waitLabel(data.currentQuietSeconds)}`,
                        }}
                        area
                        height={240}
                      />
                    </div>
                  )}
                </div>
              )}
            </ChartCard>

            <ChartCard title={t.analyticsTriggersTitle} subtitle={t.analyticsTriggersSubtitle} span={3}>
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t.analyticsColTrigger}</th>
                      <th>{t.analyticsWritten}</th>
                      <th>{t.analyticsColSent}</th>
                      <th>{t.analyticsDiscarded}</th>
                      <th>{t.analyticsColRate}</th>
                      <th>{t.analyticsDiscardedCost}</th>
                      <th>{t.analyticsColTopReason}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.triggers.map((row) => (
                      <tr key={row.trigger ?? '__none__'}>
                        <td className="admin-table-name">{triggerLabel(row.trigger)}</td>
                        <td dir="ltr">{row.written}</td>
                        <td dir="ltr">{row.sent}</td>
                        <td dir="ltr">{row.discarded}</td>
                        <td dir="ltr">{formatPercent(row.discardRate)}</td>
                        <td dir="ltr">{cost(row.discardedCost)}</td>
                        <td>{row.topReason ? reasonLabel(row.topReason) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ChartCard>

            <ChartCard title={t.analyticsWeeksTitle} subtitle={t.analyticsWeeksSubtitle} span={3}>
              {data.weeks.length > 0 ? (
                <LineChart
                  title={t.analyticsWeeksTitle}
                  labels={data.weeks.map((w) => weekLabel(w.weekStart))}
                  series={[
                    { name: t.analyticsWritten, color: SERIES.violet, values: data.weeks.map((w) => w.written) },
                    { name: t.analyticsDiscarded, color: SERIES.pink, values: data.weeks.map((w) => w.discarded) },
                  ]}
                  extraTip={(i) => {
                    const w = data.weeks[i];
                    if (!w) return [];
                    return [
                      { value: cost(w.discardedCost), label: t.analyticsDiscardedCost },
                      { value: formatPercent(w.written === 0 ? null : w.discarded / w.written), label: t.analyticsColRate },
                    ];
                  }}
                  height={260}
                />
              ) : (
                <ChartEmpty>{t.analyticsEmpty}</ChartEmpty>
              )}
            </ChartCard>

            <ChartCard title={t.analyticsClientsTitle} subtitle={t.analyticsClientsSubtitle} span={3}>
              {data.topClients.length === 0 ? (
                <ChartEmpty>{t.analyticsNoDiscards}</ChartEmpty>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.analyticsColClient}</th>
                        <th>{t.analyticsDiscarded}</th>
                        <th>{t.analyticsWritten}</th>
                        <th>{t.analyticsColRate}</th>
                        <th>{t.analyticsDiscardedCost}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {data.topClients.map((c) => (
                        <tr key={c.clientId}>
                          <td className="admin-table-name">
                            {c.name}
                            {c.deleted && <span className="badge badge-danger cost-failed-mark">{t.analyticsDeletedMark}</span>}
                          </td>
                          <td dir="ltr">{c.discarded}</td>
                          <td dir="ltr">{c.written}</td>
                          <td dir="ltr">{formatPercent(c.discardRate)}</td>
                          <td dir="ltr" style={{ color: c.discardedCost.known > 0 ? undefined : NEUTRAL }}>
                            {cost(c.discardedCost)}
                          </td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-small" onClick={() => onOpenClient(c.clientId)}>
                              {t.analyticsOpenClient}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ChartCard>
          </div>
          <p className="muted usage-unpriced-note">{t.analyticsTimeZoneNote(data.timeZone)}</p>
        </>
      )}
    </div>
  );
}
