import { useMemo } from 'react';
import type { ClientDocument, Email, GoalStatus, NextScheduled } from '../api';
import { daysSince, formatDateOnly, LOCALE } from '../format';
import { useT } from '../i18n';

interface Props {
  documents: ClientDocument[];
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
  /** Doc collector: the collection due date ("YYYY-MM-DD"), shown on the follow-up tile. */
  dueDate?: string | null;
  /** Doc collector: the agent stopped because the due date passed — flag the follow-up tile. */
  overdueStopped?: boolean;
}

const STALE_REPLY_DAYS = 7;

export function StatTiles({ documents, emails, nextScheduled, goalStatus, dueDate = null, overdueStopped = false }: Props) {
  const { t } = useT();
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
        <span className="stat-label">{t.docsCollectedLabel}</span>
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
            ? t.noDocsDefined
            : stats.collected === stats.total
              ? t.allCollected
              : t.nMissing(stats.total - stats.collected)}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">{t.messagesExchangedLabel}</span>
        <span className="stat-value">{stats.sent + stats.received}</span>
        <span className="stat-context">
          {stats.sent + stats.received === 0 ? t.noEmailsYet : t.sentReceived(stats.sent, stats.received)}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">{t.lastClientReply}</span>
        <span className="stat-value">
          {stats.replyDays === null
            ? '—'
            : stats.replyDays === 0
              ? t.today
              : stats.replyDays === 1
                ? t.yesterday
                : t.daysAgo(stats.replyDays)}
        </span>
        <span className="stat-context">
          {stats.lastReplyAt === null ? (
            t.noRepliesYet
          ) : (
            <>
              {new Date(stats.lastReplyAt).toLocaleDateString(LOCALE, { dateStyle: 'medium' })}
              {stats.replyDays !== null && stats.replyDays >= STALE_REPLY_DAYS && (
                <span className="stat-flag">
                  <span className="stat-flag-dot" />
                  {t.noReplyFlag}
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">{t.nextFollowUpLabel}</span>
        <span className="stat-value">
          {followUpDate
            ? followUpDate.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })
            : goalStatus === 'complete'
              ? t.doneLabel
              : '—'}
        </span>
        <span className="stat-context">
          {followUpDate
            ? t.atTime(followUpDate.toLocaleTimeString(LOCALE, { timeStyle: 'short' }))
            : goalStatus === 'complete'
              ? t.noFurtherFollowUps
              : t.notScheduled}
          {dueDate && goalStatus === 'pending' && (
            <>
              {' · '}
              {t.dueDateContext(formatDateOnly(dueDate))}
              {overdueStopped && (
                <span className="stat-flag">
                  <span className="stat-flag-dot" />
                  {t.overdueFlag}
                </span>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  );
}
