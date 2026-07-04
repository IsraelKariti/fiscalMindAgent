import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type DashboardClientSummary, type DashboardSummary } from '../api';
import { daysSince, LOCALE } from '../format';
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
function attentionItems(clients: DashboardClientSummary[]): AttentionItem[] {
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
        reason: client.last_inbound_at ? `ללא מענה ${silentDays} ימים` : 'טרם התקבלה תגובה כלשהי',
      });
    } else if (!client.next_scheduled_for) {
      items.push({ client, days: 0, reason: 'אין מעקב מתוזמן' });
    }
  }
  return items.sort((a, b) => b.days - a.days);
}

export function Overview({ onSelectClient }: Props) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.dashboard());
      setError(null);
    } catch {
      setError('טעינת הדשבורד נכשלה.');
    }
  }, []);

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
      { label: 'הושלמו', value: complete, color: SERIES.green },
      { label: 'באיסוף פעיל', value: started, color: SERIES.violet },
      { label: 'טרם נאסף דבר', value: notStarted, color: SERIES.amber },
    ];
  }, [data]);

  // Least-progressed first, completed clients sink to the bottom.
  const byProgress = useMemo(
    () => [...(data?.clients ?? [])].sort((a, b) => progressOf(a) - progressOf(b)),
    [data],
  );

  const attention = useMemo(() => attentionItems(data?.clients ?? []), [data]);

  const followUps = useMemo(
    () =>
      (data?.clients ?? [])
        .filter((c) => c.next_scheduled_for !== null)
        .sort((a, b) => a.next_scheduled_for!.localeCompare(b.next_scheduled_for!)),
    [data],
  );

  if (error) return <div className="error-banner">{error}</div>;
  if (!data || !totals) return <div className="muted">טוען…</div>;
  if (data.clients.length === 0) {
    return <div className="screen-center muted">אין עדיין לקוחות — הדשבורד יתמלא כשיתווספו לקוחות.</div>;
  }

  const nextFollowUp = followUps[0]?.next_scheduled_for;
  const docsMissing = totals.docsTotal - totals.docsCollected;

  return (
    <div className="overview">
      <div className="stat-row">
        <div className="card stat-tile">
          <span className="stat-label">לקוחות</span>
          <span className="stat-value">{totals.clients}</span>
          <span className="stat-context">{`${totals.complete} הושלמו · ${totals.pending} בתהליך`}</span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">מסמכים שנאספו</span>
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
            {totals.docsTotal === 0 ? 'לא הוגדרו מסמכים' : docsMissing === 0 ? 'הכול נאסף' : `${docsMissing} חסרים`}
          </span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">הודעות שהוחלפו</span>
          <span className="stat-value">{totals.sent + totals.received}</span>
          <span className="stat-context">
            {totals.sent + totals.received === 0
              ? 'אין עדיין מיילים'
              : `${totals.sent} נשלחו · ${totals.received} התקבלו · ${data.filesTotal} קבצים`}
          </span>
        </div>

        <div className="card stat-tile">
          <span className="stat-label">מעקבים מתוזמנים</span>
          <span className="stat-value">{followUps.length}</span>
          <span className="stat-context">
            {nextFollowUp
              ? `הקרוב: ${new Date(nextFollowUp).toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })}`
              : 'אין מעקבים מתוזמנים'}
          </span>
        </div>
      </div>

      <div className="chart-grid">
        <ChartCard title="פעילות מיילים" subtitle={`כל הלקוחות · ${WEEKS} השבועות האחרונים`} span={2}>
          {totals.sent + totals.received > 0 ? (
            <LineChart
              title="מיילים לפי שבוע, כל הלקוחות"
              labels={activity.labels}
              series={[
                { name: 'נשלחו', color: SERIES.violet, values: activity.sent },
                { name: 'התקבלו', color: SERIES.cyan, values: activity.received },
              ]}
            />
          ) : (
            <ChartEmpty>אין עדיין מיילים</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard title="סטטוס הלקוחות">
          <DonutChart title="לקוחות לפי סטטוס איסוף" data={statusDonut} centerLabel="לקוחות" />
        </ChartCard>

        <ChartCard title="התקדמות לפי לקוח" subtitle="מסמכים שנאספו מתוך המבוקשים" span={2}>
          <ul className="overview-list">
            {byProgress.map((client) => (
              <li key={client.id}>
                <button className="overview-row" onClick={() => onSelectClient(client.id)}>
                  <span className="overview-row-top">
                    <span className="overview-row-name">
                      <span
                        className={`status-dot ${client.goal_status}`}
                        title={client.goal_status === 'complete' ? 'היעד הושלם' : 'איסוף בתהליך'}
                      />
                      {client.name}
                    </span>
                    <span className="overview-row-value">
                      {client.docs_total === 0 ? 'ללא מסמכים' : `${client.docs_collected} / ${client.docs_total}`}
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

        <ChartCard title="דורשים תשומת לב" subtitle={`ללא מענה ${STALE_REPLY_DAYS}+ ימים או ללא מעקב`}>
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
            <ChartEmpty>הכול תקין — אף לקוח לא תקוע</ChartEmpty>
          )}
        </ChartCard>

        <ChartCard title="המעקבים הקרובים" subtitle="מיילים שהסוכן ישלח אוטומטית" span={3}>
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
            <ChartEmpty>אין מעקבים מתוזמנים כרגע</ChartEmpty>
          )}
        </ChartCard>
      </div>
    </div>
  );
}
