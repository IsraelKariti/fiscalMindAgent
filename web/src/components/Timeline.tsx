import { useEffect, useRef } from 'react';
import type { Email, GoalStatus, NextScheduled } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';

export function Timeline({
  emails,
  nextScheduled,
  goalStatus,
}: {
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
}) {
  const { t } = useT();
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
        <h3>{t.conversationTimeline}</h3>
        {emails.length > 0 && (
          <span className="muted panel-count">
            {emails.length === 1 ? t.oneMessage : t.nMessages(emails.length)}
          </span>
        )}
      </div>
      <div className="panel-body" ref={bodyRef} onScroll={trackScroll}>
        {emails.length === 0 && !nextScheduled && goalStatus !== 'pending' && (
          <p className="muted">{t.noEmailsExchangedYet}</p>
        )}
        <ol className="timeline">
          {emails.map((email) => {
            const outbound = email.direction === 'outbound';
            return (
              <li key={email.id} className={`timeline-item ${outbound ? 'outbound' : 'inbound'}`}>
                <div className="timeline-meta">
                  <span className="timeline-author">{outbound ? t.agentAuthor : t.clientAuthor}</span>
                  <span className="muted">{formatTimestamp(email.sent_at ?? email.created_at)}</span>
                </div>
                <div className="bubble">
                  <div className="bubble-subject" dir="auto">{email.subject}</div>
                  <div className="bubble-body" dir="auto">{email.body}</div>
                </div>
              </li>
            );
          })}
          {nextScheduled && (
            <li className="timeline-divider" aria-hidden="true">
              <span className="timeline-divider-label">
                <span className="scheduled-dot" />
                {t.scheduledDivider}
              </span>
            </li>
          )}
          {nextScheduled && (
            <li className="timeline-item outbound scheduled">
              <div className="timeline-meta">
                <span className="timeline-author">
                  <svg
                    className="scheduled-clock"
                    viewBox="0 0 16 16"
                    width="12"
                    height="12"
                    aria-hidden="true"
                  >
                    <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {t.agentNotSentYet}
                </span>
                <span className="scheduled-note">{t.willBeSentAt(formatTimestamp(nextScheduled.scheduledFor))}</span>
              </div>
              <div className="bubble bubble-scheduled">
                {nextScheduled.subject ? (
                  <>
                    <div className="bubble-subject" dir="auto">{nextScheduled.subject}</div>
                    <div className="bubble-body" dir="auto">{nextScheduled.body}</div>
                  </>
                ) : (
                  <div className="muted">{t.scheduledDraftUnavailable}</div>
                )}
              </div>
            </li>
          )}
          {/* Goal open but nothing scheduled: the agent is between decisions — a fresh
              client awaiting its first draft, or a follow-up being drafted after a send/reply. */}
          {!nextScheduled && goalStatus === 'pending' && (
            <li className="timeline-item outbound scheduled drafting">
              <div className="bubble bubble-scheduled bubble-drafting">
                <svg
                  className="scheduled-clock drafting-clock"
                  viewBox="0 0 16 16"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <span>{t.draftingEmail(emails.length === 0)}</span>
              </div>
            </li>
          )}
        </ol>
        {!nextScheduled && goalStatus === 'complete' && (
          <p className="muted timeline-footer">{t.goalCompleteFooter}</p>
        )}
      </div>
    </section>
  );
}
