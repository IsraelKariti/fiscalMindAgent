import { useEffect, useMemo, useState } from 'react';
import { api, type Email, type LlmCallSummary } from '../api';
import { formatCompact, formatTimestamp, formatUsd, humanizePurpose, LOCALE } from '../format';
import { useT } from '../i18n';
import { CallDetailModal } from './admin/AdminLlmCalls';
import { MODEL_LABELS } from './admin/shared';
import { ChartCard, ChartEmpty, NEUTRAL, SERIES } from './charts/common';
import { DonutChart } from './charts/DonutChart';
import { LineChart } from './charts/LineChart';
import { summarizeCost, type CostGroup } from './costSummary';

/**
 * The admin-only cost tab (openspec `admin-cost-tab`): where one client's LLM
 * spend went. Loads every call of the client once when the tab opens (no
 * stream subscription — reopening reloads) and aggregates it in the browser
 * with summarizeCost(). Every amount is the cost the call recorded at call
 * time; nothing is repriced. Sent messages come from the emails the view
 * already holds.
 */

const PALETTE = [SERIES.violet, SERIES.cyan, SERIES.pink, SERIES.amber, SERIES.green];

function colorAt(i: number): string {
  return PALETTE[i] ?? NEUTRAL;
}

/** A sum shown as a floor when some calls were unpriced. */
function floorUsd(value: number, unpriced: number): string {
  const base = value === 0 ? '$0' : formatUsd(value);
  return unpriced > 0 ? `${base}+` : base;
}

function pct(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export function CostCard({ clientId, emails }: { clientId: string; emails: Email[] }) {
  const { t } = useT();
  const [calls, setCalls] = useState<LlmCallSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCallId, setOpenCallId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCalls(null);
    setError(null);
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

  const sentMessages = useMemo(
    () => emails.filter((e) => e.direction === 'outbound' && e.status !== 'draft').length,
    [emails],
  );
  const summary = useMemo(() => summarizeCost(calls ?? [], sentMessages), [calls, sentMessages]);
  const { totals } = summary;

  const purposeLabel = (purpose: string) => t.llmPurposeLabels[purpose] ?? humanizePurpose(purpose);
  const modelLabel = (model: string) => MODEL_LABELS[model] ?? model;

  const donut = summary.byPurpose.map((g, i) => ({ label: purposeLabel(g.key), value: g.cost, color: colorAt(i) }));
  const dayLabels = summary.byDay.map((d) => new Date(`${d.day}T12:00:00`).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }));

  if (error) return <div className="error-banner">{error}</div>;

  const loaded = calls !== null;
  const hasCalls = loaded && totals.calls > 0;

  return (
    <>
      <div className="stat-row">
        <div className="card stat-tile">
          <span className="stat-label">{t.costTotalLabel}</span>
          <span className="stat-value" dir="ltr">
            {loaded ? floorUsd(totals.cost, totals.unpriced) : '—'}
          </span>
          <span className="stat-context">
            {totals.unpriced > 0 ? t.costUnpricedContext(totals.unpriced) : t.costTotalContext}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.costCallsLabel}</span>
          <span className="stat-value" dir="ltr">
            {loaded ? totals.calls.toLocaleString(LOCALE) : '—'}
          </span>
          <span className="stat-context">
            {totals.failed > 0 ? (
              <span className="stat-flag">
                <span className="stat-flag-dot" />
                {t.costCallsFailed(totals.failed)}
              </span>
            ) : hasCalls ? (
              t.costCallsAllOk
            ) : (
              t.costEmpty
            )}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.costTokensLabel}</span>
          <span className="stat-value" dir="ltr">
            {loaded ? formatCompact(totals.inputTokens + totals.outputTokens + totals.thinkingTokens) : '—'}
          </span>
          <span className="stat-context">
            {t.costTokensContext(
              formatCompact(totals.inputTokens),
              formatCompact(totals.outputTokens),
              formatCompact(totals.cachedTokens),
            )}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="stat-label">{t.costPerMessageLabel}</span>
          <span className="stat-value" dir="ltr">
            {loaded && totals.costPerMessage !== null ? floorUsd(totals.costPerMessage, totals.unpriced) : '—'}
          </span>
          <span className="stat-context">
            {totals.costPerMessage === null ? t.costNoMessagesSent : t.costPerMessageContext(sentMessages)}
          </span>
        </div>
      </div>

      {!loaded && <p className="muted">{t.loading}</p>}
      {loaded && !hasCalls && <p className="muted cost-empty">{t.costEmpty}</p>}

      {hasCalls && (
        <>
          {totals.unpriced > 0 && <p className="muted usage-unpriced-note">{t.costUnpricedNote(totals.unpriced)}</p>}

          <div className="chart-grid">
            <ChartCard title={t.costByTypeTitle} subtitle={t.costByTypeSubtitle} span={3}>
              <div className="cost-by-type">
                <div className="admin-table-wrap">
                  <GroupTable
                    rows={summary.byPurpose}
                    label={purposeLabel}
                    keyHeader={t.costColType}
                    colorAt={colorAt}
                    withFailed
                    withAvg
                  />
                </div>
                {totals.cost > 0 && (
                  <DonutChart title={t.costByTypeTitle} data={donut} centerLabel={t.costDonutCenter} format={formatUsd} />
                )}
              </div>
            </ChartCard>

            <ChartCard title={t.costByModelTitle}>
              <div className="admin-table-wrap">
                <GroupTable rows={summary.byModel} label={modelLabel} keyHeader={t.costColModel} />
              </div>
            </ChartCard>

            <ChartCard title={t.costOverTimeTitle} subtitle={t.costOverTimeSubtitle} span={2}>
              {summary.byDay.length > 0 ? (
                <LineChart
                  title={t.costOverTimeTitle}
                  labels={dayLabels}
                  series={[{ name: t.costDaySeries, color: SERIES.violet, values: summary.byDay.map((d) => d.cost) }]}
                  format={formatUsd}
                  extraTip={(i) => [{ value: String(summary.byDay[i]?.calls ?? 0), label: t.costDayCalls }]}
                  height={240}
                />
              ) : (
                <ChartEmpty>{t.costEmpty}</ChartEmpty>
              )}
            </ChartCard>

            <ChartCard title={t.costTopCallsTitle} subtitle={t.costTopCallsSubtitle} span={3}>
              {summary.top.length > 0 ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{t.costColType}</th>
                        <th>{t.costColModel}</th>
                        <th>{t.costColDate}</th>
                        <th>{t.costColCost}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {summary.top.map((c) => (
                        <tr key={c.id}>
                          <td className="admin-table-name">
                            {purposeLabel(c.purpose)}
                            {c.status === 'error' && <span className="badge badge-danger cost-failed-mark">{t.costFailedMark}</span>}
                          </td>
                          <td dir="ltr">{modelLabel(c.model)}</td>
                          <td>{formatTimestamp(c.createdAt)}</td>
                          <td dir="ltr">{formatUsd(c.cost ?? 0)}</td>
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
                <ChartEmpty>{t.costUnpricedNote(totals.unpriced)}</ChartEmpty>
              )}
            </ChartCard>
          </div>
        </>
      )}

      {openCallId && <CallDetailModal callId={openCallId} onClose={() => setOpenCallId(null)} />}
    </>
  );
}

function GroupTable({
  rows,
  label,
  keyHeader,
  colorAt: color,
  withFailed = false,
  withAvg = false,
}: {
  rows: CostGroup[];
  label: (key: string) => string;
  keyHeader: string;
  colorAt?: (i: number) => string;
  withFailed?: boolean;
  withAvg?: boolean;
}) {
  const { t } = useT();
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>{keyHeader}</th>
          <th>{t.costColCalls}</th>
          {withFailed && <th>{t.costColFailed}</th>}
          <th>{t.costColCost}</th>
          <th>{t.costColShare}</th>
          {withAvg && <th>{t.costColPerCall}</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((g, i) => (
          <tr key={g.key}>
            <td className="admin-table-name">
              {color && <span className="chart-legend-key" style={{ background: color(i) }} />}
              <span className={color ? 'usage-group-name' : undefined}>{label(g.key)}</span>
            </td>
            <td dir="ltr">{g.calls.toLocaleString(LOCALE)}</td>
            {withFailed && <td dir="ltr">{g.failed > 0 ? g.failed.toLocaleString(LOCALE) : '—'}</td>}
            <td dir="ltr">{g.cost === 0 ? '$0' : formatUsd(g.cost)}</td>
            <td dir="ltr">{pct(g.share)}</td>
            {withAvg && <td dir="ltr">{g.avg === 0 ? '$0' : formatUsd(g.avg)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
