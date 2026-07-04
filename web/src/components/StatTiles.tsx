import { useMemo } from 'react';
import type { ClientDocument, Email, GoalStatus, NextScheduled } from '../api';
import { daysSince, LOCALE } from '../format';

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
        <span className="stat-label">מסמכים שנאספו</span>
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
            ? 'לא הוגדרו מסמכים'
            : stats.collected === stats.total
              ? 'הכול נאסף'
              : `${stats.total - stats.collected} חסרים`}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">הודעות שהוחלפו</span>
        <span className="stat-value">{stats.sent + stats.received}</span>
        <span className="stat-context">
          {stats.sent + stats.received === 0 ? 'אין עדיין מיילים' : `${stats.sent} נשלחו · ${stats.received} התקבלו`}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">תגובה אחרונה מהלקוח</span>
        <span className="stat-value">
          {stats.replyDays === null
            ? '—'
            : stats.replyDays === 0
              ? 'היום'
              : stats.replyDays === 1
                ? 'אתמול'
                : `לפני ${stats.replyDays} ימים`}
        </span>
        <span className="stat-context">
          {stats.lastReplyAt === null ? (
            'אין עדיין תגובות'
          ) : (
            <>
              {new Date(stats.lastReplyAt).toLocaleDateString(LOCALE, { dateStyle: 'medium' })}
              {stats.replyDays !== null && stats.replyDays >= STALE_REPLY_DAYS && (
                <span className="stat-flag">
                  <span className="stat-flag-dot" />
                  ללא מענה
                </span>
              )}
            </>
          )}
        </span>
      </div>

      <div className="card stat-tile">
        <span className="stat-label">המעקב הבא</span>
        <span className="stat-value">
          {followUpDate
            ? followUpDate.toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })
            : goalStatus === 'complete'
              ? 'הושלם'
              : '—'}
        </span>
        <span className="stat-context">
          {followUpDate
            ? `בשעה ${followUpDate.toLocaleTimeString(LOCALE, { timeStyle: 'short' })}`
            : goalStatus === 'complete'
              ? 'אין מעקבים נוספים'
              : 'לא מתוכנן'}
        </span>
      </div>
    </div>
  );
}
