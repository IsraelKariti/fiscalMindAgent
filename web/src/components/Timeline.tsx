import type { Email, GoalStatus, NextScheduled } from '../api';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function Timeline({
  emails,
  nextScheduled,
  goalStatus,
}: {
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
}) {
  return (
    <section className="card">
      <div className="card-header">
        <h3>Conversation timeline</h3>
      </div>
      {emails.length === 0 && !nextScheduled && <p className="muted">No emails exchanged yet.</p>}
      <ol className="timeline">
        {emails.map((email) => {
          const outbound = email.direction === 'outbound';
          return (
            <li key={email.id} className={`timeline-item ${outbound ? 'outbound' : 'inbound'}`}>
              <div className="timeline-meta">
                <span className="timeline-author">{outbound ? 'Agent' : 'Client'}</span>
                <span className="muted">{formatTimestamp(email.sent_at ?? email.created_at)}</span>
              </div>
              <div className="bubble">
                <div className="bubble-subject">{email.subject}</div>
                <div className="bubble-body">{email.body}</div>
              </div>
            </li>
          );
        })}
        {nextScheduled && (
          <li className="timeline-item outbound scheduled">
            <div className="timeline-meta">
              <span className="timeline-author">Agent (scheduled)</span>
              <span className="muted">will send {formatTimestamp(nextScheduled.scheduledFor)}</span>
            </div>
            <div className="bubble bubble-scheduled">
              {nextScheduled.subject ? (
                <>
                  <div className="bubble-subject">{nextScheduled.subject}</div>
                  <div className="bubble-body">{nextScheduled.body}</div>
                </>
              ) : (
                <div className="muted">Scheduled follow-up (draft unavailable)</div>
              )}
            </div>
          </li>
        )}
      </ol>
      {!nextScheduled && goalStatus === 'complete' && (
        <p className="muted timeline-footer">Goal complete — no further follow-ups scheduled.</p>
      )}
    </section>
  );
}
