import { useEffect, useRef, useState } from 'react';
import type { Email, GoalStatus, MessageChannel, NextScheduled } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';
import { SendNowModal } from './SendNowModal';

type ChannelFilter = 'all' | MessageChannel;

// "Re: X" is the same thread title as "X" — ignore reply/forward prefixes when
// deciding whether a message actually renamed the thread.
function subjectKey(subject: string): string {
  return subject.replace(/^(\s*(re|fwd?)\s*:\s*)+/i, '').trim().toLowerCase();
}

const icon = {
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
};

export function Timeline({
  emails,
  nextScheduled,
  goalStatus,
  onSendNow,
}: {
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
  onSendNow: () => Promise<void>;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [confirmingSendNow, setConfirmingSendNow] = useState(false);
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the user is scrolled near the bottom — sampled on every scroll so the
  // auto-scroll below never yanks someone who is reading older messages.
  const nearBottomRef = useRef(true);
  const didInitRef = useRef(false);

  // The filter only exists when the client actually has (or is about to get)
  // WhatsApp traffic — email-only conversations keep the plain header.
  const hasWhatsApp = emails.some((e) => e.channel === 'whatsapp') || nextScheduled?.channel === 'whatsapp';
  const visibleEmails = filter === 'all' ? emails : emails.filter((e) => e.channel === filter);
  const showScheduled = nextScheduled !== null && (filter === 'all' || nextScheduled.channel === filter);
  const channelLabel = (channel: MessageChannel) => (channel === 'whatsapp' ? t.channelWhatsApp : t.channelEmail);

  const lastEmailId = visibleEmails[visibleEmails.length - 1]?.id ?? null;

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

  const copyConversation = async () => {
    // agent_reasoning is the LLM's internal explanation for the follow-up decision
    // (mainly the chosen send time); absent on client messages and pre-feature emails.
    const messages: { time: string; sender: string; channel: string; status: string; subject: string; body: string; agent_reasoning?: string }[] =
      emails.map((email) => ({
        time: email.sent_at ?? email.created_at,
        sender: email.direction === 'outbound' ? 'agent' : 'client',
        channel: email.channel,
        status: email.status,
        subject: email.subject,
        body: email.body,
        ...(email.reasoning ? { agent_reasoning: email.reasoning } : {}),
      }));
    if (nextScheduled) {
      messages.push({
        time: nextScheduled.scheduledFor,
        sender: 'agent',
        channel: nextScheduled.channel,
        status: 'pending',
        subject: nextScheduled.subject ?? '',
        body: nextScheduled.body ?? '',
        ...(nextScheduled.reasoning ? { agent_reasoning: nextScheduled.reasoning } : {}),
      });
    }
    await navigator.clipboard.writeText(JSON.stringify(messages, null, 2));
    setCopied(true);
    clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="card panel">
      <div className="panel-header">
        <h3>{t.conversationTimeline}</h3>
        <div className="panel-header-actions">
          {hasWhatsApp && (
            <div className="lang-switch channel-filter" role="group" aria-label={t.conversationTimeline}>
              {(['all', 'email', 'whatsapp'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`chip ${filter === option ? 'chip-selected' : ''}`}
                  aria-pressed={filter === option}
                  onClick={() => setFilter(option)}
                >
                  {option === 'all' ? t.filterAll : channelLabel(option)}
                </button>
              ))}
            </div>
          )}
          {visibleEmails.length > 0 && (
            <span className="muted panel-count">
              {visibleEmails.length === 1 ? t.oneMessage : t.nMessages(visibleEmails.length)}
            </span>
          )}
          {(emails.length > 0 || nextScheduled) && (
            <button
              className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
              onClick={copyConversation}
              title={copied ? t.copied : t.copyConversation}
              aria-label={copied ? t.copied : t.copyConversation}
            >
              {copied ? icon.check : icon.copy}
            </button>
          )}
        </div>
      </div>
      <div className="panel-body" ref={bodyRef} onScroll={trackScroll}>
        {visibleEmails.length === 0 && !showScheduled && goalStatus !== 'pending' && (
          <p className="muted">{t.noEmailsExchangedYet}</p>
        )}
        <ol className="timeline">
          {visibleEmails.map((email, i) => {
            const outbound = email.direction === 'outbound';
            const prev = i > 0 ? visibleEmails[i - 1] : undefined;
            // WhatsApp messages have no subject; only email bubbles show a thread title.
            const newSubject =
              email.channel === 'email' &&
              email.subject !== '' &&
              (!prev || subjectKey(email.subject) !== subjectKey(prev.subject));
            return (
              <li key={email.id} className={`timeline-item ${outbound ? 'outbound' : 'inbound'}`}>
                <div className="timeline-meta">
                  <span className="timeline-author">{outbound ? t.agentAuthor : t.clientAuthor}</span>
                  {hasWhatsApp && (
                    <span className={`channel-badge channel-${email.channel}`}>{channelLabel(email.channel)}</span>
                  )}
                  <span className="muted">{formatTimestamp(email.sent_at ?? email.created_at)}</span>
                </div>
                <div className="bubble">
                  {newSubject && <div className="bubble-subject" dir="auto">{email.subject}</div>}
                  <div className="bubble-body" dir="auto">{email.body}</div>
                </div>
              </li>
            );
          })}
          {showScheduled && nextScheduled && (
            <li className="timeline-divider" aria-hidden="true">
              <span className="timeline-divider-label">
                <span className="scheduled-dot" />
                {t.scheduledDivider}
              </span>
            </li>
          )}
          {showScheduled && nextScheduled && (
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
                {hasWhatsApp && (
                  <span className={`channel-badge channel-${nextScheduled.channel}`}>
                    {channelLabel(nextScheduled.channel)}
                  </span>
                )}
                <span className="scheduled-note">{t.willBeSentAt(formatTimestamp(nextScheduled.scheduledFor))}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small send-now-btn"
                  onClick={() => setConfirmingSendNow(true)}
                >
                  {t.sendNow}
                </button>
              </div>
              <div className="bubble bubble-scheduled">
                {nextScheduled.body ? (
                  <>
                    {nextScheduled.channel === 'email' &&
                      nextScheduled.subject &&
                      subjectKey(nextScheduled.subject) !== subjectKey(emails[emails.length - 1]?.subject ?? '') && (
                        <div className="bubble-subject" dir="auto">{nextScheduled.subject}</div>
                      )}
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
      {confirmingSendNow && nextScheduled && (
        <SendNowModal
          scheduledFor={nextScheduled.scheduledFor}
          onSendNow={onSendNow}
          onClose={() => setConfirmingSendNow(false)}
        />
      )}
    </section>
  );
}
