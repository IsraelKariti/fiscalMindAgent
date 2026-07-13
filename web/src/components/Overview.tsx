import { useCallback, useEffect, useMemo, useState } from 'react';
import { type DashboardSummary } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { displayClientName, LOCALE } from '../format';
import { useT } from '../i18n';
import { ChartCard, ChartEmpty, SERIES } from './charts/common';
import { DonutChart, type DonutDatum } from './charts/DonutChart';
import { LineChart } from './charts/LineChart';
import { startOfWeek, weekLabel, WEEKS, weekStarts } from './charts/weeks';
import { NeedsAttentionCard, progressOf, StatRow, upcomingFollowUps } from './overviewParts';

interface Props {
  onSelectClient: (clientId: string) => void;
}

export function Overview({ onSelectClient }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch {
      setError(t.dashboardLoadFailed);
    }
  }, [api, t]);

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

  const messagesTotal = useMemo(
    () => (data?.clients ?? []).reduce((sum, c) => sum + c.emails_sent + c.emails_received, 0),
    [data],
  );

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

  const followUps = useMemo(() => upcomingFollowUps(data?.clients ?? []), [data]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!data) return <div className="muted">{t.loading}</div>;
  if (data.clients.length === 0) {
    return <div className="screen-center muted">{t.dashboardFillsUp}</div>;
  }

  return (
    <div className="overview">
      <StatRow data={data} />

      <div className="chart-grid">
        <ChartCard title={t.emailActivity} subtitle={t.allClientsLastWeeks(WEEKS)} span={2}>
          {messagesTotal > 0 ? (
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
                        className={`status-dot ${client.overdue_stopped ? 'overdue' : client.goal_status}`}
                        title={
                          client.overdue_stopped
                            ? t.goalOverdueTitle
                            : client.goal_status === 'complete'
                              ? t.goalCompleteTitle
                              : t.goalPendingTitle
                        }
                      />
                      {displayClientName(client.name)}
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

        <NeedsAttentionCard clients={data.clients} onSelectClient={onSelectClient} />

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
                      <span className="overview-chip-name">{displayClientName(client.name)}</span>
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
