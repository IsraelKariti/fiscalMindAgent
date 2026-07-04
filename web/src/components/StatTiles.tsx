import { useMemo } from 'react';
import type { ClientDocument, Email, GoalStatus, NextScheduled } from '../api';
import { daysSince } from '../format';

interface Props {
  documents: ClientDocument[];
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
}

const STALE_REPLY_DAYS = 7;

export function StatTiles({ documents, emails, nextScheduled, goalStatus }: Props) {
  const stats = useMemo(() => {
    const collected = documents.filter((d) => d.status === 'collected').length;
    const total = documents.length;

    const delivered = emails.filter((e) => e.status !== 'draft');
    const sent = delivered.filter((e) => e.direction === 'outbound').length;
    const received = delivered.length - sent;

    const lastReplyAt = delivered
      .filter((e) => e.direction === 'inbound')
      .reduce<string | null>((latest, e) => {
        const ts = e.sent_at ?? e.created_at;
        return latest === null || ts > latest ? ts : latest;
      }, null);
    const replyDays = lastReplyAt === null ? null : daysSince(lastReplyAt);

    return { collected, total, sent, received, lastReplyAt, replyDays };
  }, [documents, emails]);

  const followUpDate = nextScheduled ? new Date(nextScheduled.scheduledFor) : null;

  return (
    <div className="stat-row">
      <div className="card stat-tile">
        <span className="stat-label">Documents collected</span>
        <span className="stat-value">{stats.total === 0 ? '—' : `${stats.collected} / ${stats.total}`}</span>
        {stats.total > 0 && (
          <div className="stat-meter">
            <div
              className={`stat-meter-fill ${stats.collected === stats.total ? 'complete' : ''}`}
              style={{ width: `${(stats.collected / stats.total) * 100}%` }}
            />
          </div>
        )}
        <span className="stat-context">
          {stats.total === 0
            ? 'No documents configured'
            : stats.collected === stats.total
              ? 'All collected'
              : `${stats.total - stats.collected} outstanding`}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">Messages exchanged</span>
        <span className="stat-value">{stats.sent + stats.received}</span>
        <span className="stat-context">
          {stats.sent + stats.received === 0 ? 'No emails yet' : `${stats.sent} sent · ${stats.received} received`}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">Last client reply</span>
        <span className="stat-value">
          {stats.replyDays === null
            ? '—'
            : stats.replyDays === 0
              ? 'Today'
              : stats.replyDays === 1
                ? 'Yesterday'
                : `${stats.replyDays} days ago`}
        </span>
        <span className="stat-context">
          {stats.lastReplyAt === null ? (
            'No replies yet'
          ) : (
            <>
              {new Date(stats.lastReplyAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
              {stats.replyDays !== null && stats.replyDays >= STALE_REPLY_DAYS && (
                <span className="stat-flag">
                  <span className="stat-flag-dot" />
                  stale
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">Next follow-up</span>
        <span className="stat-value">
          {followUpDate
            ? followUpDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : goalStatus === 'complete'
              ? 'Complete'
              : '—'}
        </span>
        <span className="stat-context">
          {followUpDate
            ? `at ${followUpDate.toLocaleTimeString(undefined, { timeStyle: 'short' })}`
            : goalStatus === 'complete'
              ? 'No further follow-ups'
              : 'None scheduled'}
        </span>
      </div>
    </div>
  );
}
