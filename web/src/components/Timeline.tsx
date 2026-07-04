import { useEffect, useRef } from 'react';
import type { Email, GoalStatus, NextScheduled } from '../api';
import { formatTimestamp } from '../format';

export function Timeline({
  emails,
  nextScheduled,
  goalStatus,
}: {
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the user is scrolled near the bottom — sampled on every scroll so the
  // auto-scroll below never yanks someone who is reading older messages.
  const nearBottomRef = useRef(true);
  const didInitRef = useRef(false);

  const lastEmailId = emails[emails.length - 1]?.id ?? null;

  const trackScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Open at the latest message; afterwards only follow new messages if the user
  // was already at the bottom. Keyed on the last email id, not the array, so the
  // 15s refresh leaves scroll position alone when nothing changed.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) return;
    if (didInitRef.current && !nearBottomRef.current) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: didInitRef.current && !reduceMotion ? 'smooth' : 'auto' });
    didInitRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastEmailId, nextScheduled?.scheduledFor]);

  return (
    <section className="card panel">
      <div className="panel-header">
        <h3>Conversation timeline</h3>
        {emails.length > 0 && (
          <span className="muted panel-count">
            {emails.length} message{emails.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="panel-body" ref={bodyRef} onScroll={trackScroll}>
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
      </div>
    </section>
  );
}
