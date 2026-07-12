import { useMemo } from 'react';
import type { DashboardClientSummary, DashboardSummary } from '../api';
import { daysSince, displayClientName, LOCALE } from '../format';
import { useT, type Messages } from '../i18n';
import { ChartCard, ChartEmpty } from './charts/common';

// Pieces of the workspace overview shared with the monday.com widget, which
// renders the same stat tiles and needs-attention list from the same dashboard
// payload (fetched over its own authenticated channel).

export const STALE_REPLY_DAYS = 7;

/** Collection progress as a 0..1 fraction; a complete client with no documents still counts as done. */
export function progressOf(c: DashboardClientSummary): number {
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
export function attentionItems(clients: DashboardClientSummary[], t: Messages): AttentionItem[] {
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

/** Clients with a scheduled follow-up, soonest first. */
export function upcomingFollowUps(clients: DashboardClientSummary[]): DashboardClientSummary[] {
  return clients
    .filter((c) => c.next_scheduled_for !== null)
    .sort((a, b) => a.next_scheduled_for!.localeCompare(b.next_scheduled_for!));
}

/** The four headline stat tiles (clients, documents, messages, scheduled follow-ups). */
export function StatRow({ data }: { data: DashboardSummary }) {
  const { t } = useT();

  const totals = useMemo(() => {
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

  const followUps = useMemo(() => upcomingFollowUps(data.clients), [data]);
  const nextFollowUp = followUps[0]?.next_scheduled_for;
  const docsMissing = totals.docsTotal - totals.docsCollected;

  return (
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
  );
}

/** The "needs attention" card: stuck clients, most-stuck first. */
export function NeedsAttentionCard({
  clients,
  onSelectClient,
}: {
  clients: DashboardClientSummary[];
  onSelectClient: (clientId: string) => void;
}) {
  const { t } = useT();
  const attention = useMemo(() => attentionItems(clients, t), [clients, t]);

  return (
    <ChartCard title={t.needsAttention} subtitle={t.attentionSubtitle(STALE_REPLY_DAYS)}>
      {attention.length > 0 ? (
        <ul className="overview-list">
          {attention.map(({ client, reason }) => (
            <li key={client.id}>
              <button className="overview-row" onClick={() => onSelectClient(client.id)}>
                <span className="overview-row-top">
                  <span className="overview-row-name">{displayClientName(client.name)}</span>
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
  );
}
