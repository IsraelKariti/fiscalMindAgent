import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type DashboardClientSummary, type DashboardSummary } from '../api';
import { daysSince, LOCALE } from '../format';
import { useT, type Messages } from '../i18n';
import { ChartCard, ChartEmpty, SERIES } from './charts/common';
import { DonutChart, type DonutDatum } from './charts/DonutChart';
import { LineChart } from './charts/LineChart';
import { startOfWeek, weekLabel, WEEKS, weekStarts } from './charts/weeks';

const STALE_REPLY_DAYS = 7;

interface Props {
  onSelectClient: (clientId: string) => void;
}

/** Collection progress as a 0..1 fraction; a complete client with no documents still counts as done. */
function progressOf(c: DashboardClientSummary): number {
  if (c.docs_total === 0) return c.goal_status === 'complete' ? 1 : 0;
  return c.docs_collected / c.docs_total;
}

interface AttentionItem {
  client: DashboardClientSummary;
  reason: string;
  /** Days waiting — sorts the list most-stuck first. */
  days: number;
}

/** Pending clients that are stuck: silent for a week, or nothing scheduled to chase them. */
function attentionItems(clients: DashboardClientSummary[], t: Messages): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const client of clients) {
    if (client.goal_status === 'complete') continue;
    // Never-replied clients are measured from creation — the first email may still be pending.
    const silentDays = client.last_inbound_at
      ? daysSince(client.last_inbound_at)
      : client.emails_sent > 0
        ? daysSince(client.created_at)
        : null;
    if (silentDays !== null && silentDays >= STALE_REPLY_DAYS) {
      items.push({
        client,
        days: silentDays,
        reason: client.last_inbound_at ? t.silentForDays(silentDays) : t.neverReplied,
      });
    } else if (!client.next_scheduled_for) {
      items.push({ client, days: 0, reason: t.noFollowUpScheduled });
    }
  }
  return items.sort((a, b) => b.days - a.days);
}

export function Overview({ onSelectClient }: Props) {
  const { t } = useT();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch {
      setError(t.dashboardLoadFailed);
    }
  }, [t]);

  // Keep the numbers current while the user watches: refetch every 30s when
  // the tab is visible, and immediately when it becomes visible again.
  useEffect(() => {
    load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = setInterval(refreshIfVisible, 30_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  const totals = useMemo(() => {
    if (!data) return null;
    const complete = data.clients.filter((c) => c.goal_status === 'complete').length;
    return {
      clients: data.clients.length,
      complete,
      pending: data.clients.length - complete,
      docsTotal: data.clients.reduce((sum, c) => sum + c.docs_total, 0),
      docsCollected: data.clients.reduce((sum, c) => sum + c.docs_collected, 0),
      sent: data.clients.reduce((sum, c) => sum + c.emails_sent, 0),
      received: data.clients.reduce((sum, c) => sum + c.emails_received, 0),
    };
  }, [data]);

  const activity = useMemo(() => {
    const starts = weekStarts();
    const index = new Map(starts.map((d, i) => [d.getTime(), i]));
    const sent = new Array<number>(WEEKS).fill(0);
    const received = new Array<number>(WEEKS).fill(0);
    for (const e of data?.activity ?? []) {
      const i = index.get(startOfWeek(new Date(e.at)).getTime());
      if (i === undefined) continue;
      if (e.direction === 'outbound') sent[i] = (sent[i] ?? 0) + 1;
      else received[i] = (received[i] ?? 0) + 1;
    }
    return { labels: starts.map(weekLabel), sent, received };
  }, [data]);

  const statusDonut = useMemo<DonutDatum[]>(() => {
    const clients = data?.clients ?? [];
    const complete = clients.filter((c) => c.goal_status === 'complete').length;
    const started = clients.filter((c) => c.goal_status === 'pending' && c.docs_collected > 0).length;
    const notStarted = clients.length - complete - started;
    return [
      { label: t.statusComplete, value: complete, color: SERIES.green },
      { label: t.statusActive, value: started, color: SERIES.violet },
      { label: t.statusNotStarted, value: notStarted, color: SERIES.amber },
    ];
  }, [data, t]);

  // Least-progressed first, completed clients sink to the bottom.
  const byProgress = useMemo(
    () => [...(data?.clients ?? [])].sort((a, b) => progressOf(a) - progressOf(b)),
    [data],
  );

  const attention = useMemo(() => attentionItems(data?.clients ?? [], t), [data, t]);

  const followUps = useMemo(
    () =>
      (data?.clients ?? [])
        .filter((c) => c.next_scheduled_for !== null)
        .sort((a, b) => a.next_scheduled_for!.localeCompare(b.next_scheduled_for!)),
    [data],
  );

  if (error) return <div className="error-banner">{error}</div>;
  if (!data || !totals) return <div className="muted">{t.loading}</div>;
  if (data.clients.length === 0) {
    return <div className="screen-center muted">{t.dashboardFillsUp}</div>;
  }

  const nextFollowUp = followUps[0]?.next_scheduled_for;
  const docsMissing = totals.docsTotal - totals.docsCollected;

  return (
    <div className="overview">
      <div className="stat-row">
        <div className="card stat-tile">
          <span className="stat-label">{t.clientsLabel}</span>
          <span className="stat-value">{totals.clients}</span>
          <span className="stat-context">{t.completeAndPending(totals.complete, totals.pending)}</span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">{t.docsCollectedLabel}</span>
          <span className="stat-value">
            {totals.docsTotal === 0 ? '—' : `${totals.docsCollected} / ${totals.docsTotal}`}
          </span>
          {totals.docsTotal > 0 && (
            <div className="stat-meter">
              <div
                className={`stat-meter-fill ${docsMissing === 0 ? 'complete' : ''}`}
                style={{ width: `${(totals.docsCollected / totals.docsTotal) * 100}%` }}
              />
            </div>
          )}
          <span className="stat-context">
            {totals.docsTotal === 0 ? t.noDocsDefined : docsMissing === 0 ? t.allCollected : t.nMissing(docsMissing)}
          </span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">{t.messagesExchangedLabel}</span>
          <span className="stat-value">{totals.sent + totals.received}</span>
          <span className="stat-context">
            {totals.sent + totals.received === 0
              ? t.noEmailsYet
              : t.sentReceivedFiles(totals.sent, totals.received, data.filesTotal)}
          </span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">{t.scheduledFollowUpsLabel}</span>
          <span className="stat-value">{followUps.length}</span>
          <span className="stat-context">
            {nextFollowUp
              ? t.nextAt(new Date(nextFollowUp).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' }))
              : t.noScheduledFollowUps}
          </span>
        </div>
      </div>

      <div className="chart-grid">
        <ChartCard title={t.emailActivity} subtitle={t.allClientsLastWeeks(WEEKS)} span={2}>
          {totals.sent + totals.received > 0 ? (
            <LineChart
              title={t.emailsPerWeekAllClients}
              labels={activity.labels}
              series={[
                { name: t.seriesSent, color: SERIES.violet, values: activity.sent },
                { name: t.seriesReceived, color: SERIES.cyan, values: activity.received },
              ]}
            />
          ) : (
            <ChartEmpty>{t.noEmailsYet}</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard title={t.clientStatus}>
          <DonutChart title={t.clientsByStatus} data={statusDonut} centerLabel={t.clientsLabel} />
        </ChartCard>

        <ChartCard title={t.progressByClient} subtitle={t.collectedOfRequested} span={2}>
          <ul className="overview-list">
            {byProgress.map((client) => (
              <li key={client.id}>
                <button className="overview-row" onClick={() => onSelectClient(client.id)}>
                  <span className="overview-row-top">
                    <span className="overview-row-name">
                      <span
                        className={`status-dot ${client.goal_status}`}
                        title={client.goal_status === 'complete' ? t.goalCompleteTitle : t.goalPendingTitle}
                      />
                      {client.name}
                    </span>
                    <span className="overview-row-value">
                      {client.docs_total === 0 ? t.noDocuments : `${client.docs_collected} / ${client.docs_total}`}
                    </span>
                  </span>
                  <span className="stat-meter">
                    <span
                      className={`stat-meter-fill ${progressOf(client) === 1 ? 'complete' : ''}`}
                      style={{ width: `${progressOf(client) * 100}%` }}
                    />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </ChartCard>

        <ChartCard title={t.needsAttention} subtitle={t.attentionSubtitle(STALE_REPLY_DAYS)}>
          {attention.length > 0 ? (
            <ul className="overview-list">
              {attention.map(({ client, reason }) => (
                <li key={client.id}>
                  <button className="overview-row" onClick={() => onSelectClient(client.id)}>
                    <span className="overview-row-top">
                      <span className="overview-row-name">{client.name}</span>
                      <span className="stat-flag">
                        <span className="stat-flag-dot" />
                        {reason}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ChartEmpty>{t.allClear}</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard title={t.upcomingFollowUps} subtitle={t.upcomingFollowUpsSubtitle} span={3}>
          {followUps.length > 0 ? (
            <ul className="overview-chips">
              {followUps.map((client) => {
                const when = new Date(client.next_scheduled_for!);
                return (
                  <li key={client.id}>
                    <button className="overview-chip" onClick={() => onSelectClient(client.id)}>
                      <span className="overview-chip-when">
                        {when.toLocaleDateString(LOCALE, { weekday: 'short', month: 'short', day: 'numeric' })}
                        {' · '}
                        {when.toLocaleTimeString(LOCALE, { timeStyle: 'short' })}
                      </span>
                      <span className="overview-chip-name">{client.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ChartEmpty>{t.noFollowUpsRightNow}</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
