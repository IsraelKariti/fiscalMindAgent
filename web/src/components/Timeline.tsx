import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ApiError, type Email, type GoalStatus, type MessageChannel, type NextScheduled } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';
import { SendNowModal } from './SendNowModal';
import { UpgradeModal } from './UpgradeModal';

type ChannelFilter = 'all' | MessageChannel;

// Order matters: the segmented control's sliding thumb is positioned by index.
const CHANNEL_FILTERS = ['all', 'email', 'whatsapp'] as const satisfies readonly ChannelFilter[];

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
  pause: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M10 5v14M15 5v14" />
    </svg>
  ),
  mail: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
  ),
  whatsapp: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
    </svg>
  ),
};

export function Timeline({
  emails,
  nextScheduled,
  goalStatus,
  paused,
  draftFailed,
  draftStale,
  onSendNow,
  onTogglePause,
  onRetryDraft,
  premiumLocked,
  contactEmail,
}: {
  emails: Email[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
  /** True while the agent's outreach to this client is paused. */
  paused: boolean;
  /** The last drafting attempt threw — show the failure notice with a Retry button. */
  draftFailed: boolean;
  /** Drafting has been "in progress" implausibly long (attempt killed mid-flight) — offer Retry too. */
  draftStale: boolean;
  onSendNow: () => Promise<void>;
  onTogglePause: (paused: boolean) => Promise<void>;
  onRetryDraft: () => Promise<void>;
  /** True on the Standard plan: WhatsApp stays visible but taps open the upgrade modal. */
  premiumLocked: boolean;
  contactEmail: string | null;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [confirmingSendNow, setConfirmingSendNow] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  // Cross-channel filters are premium-only: the Standard plan starts (and stays)
  // on Email, and the other segments open the upgrade modal.
  const [filter, setFilter] = useState<ChannelFilter>(premiumLocked ? 'email' : 'all');
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const bodyRef = useRef<HTMLDivElement>(null);
  // Whether the user is scrolled near the bottom — sampled on every scroll so the
  // auto-scroll below never yanks someone who is reading older messages.
  const nearBottomRef = useRef(true);
  const didInitRef = useRef(false);

  // The filter only exists when the client actually has (or is about to get)
  // WhatsApp traffic — email-only conversations keep the plain header. On the
  // Standard plan the control always shows: the All and WhatsApp segments are
  // the upsell surface (tapping them opens the upgrade modal instead of filtering).
  const hasWhatsApp = emails.some((e) => e.channel === 'whatsapp') || nextScheduled?.channel === 'whatsapp';
  const showChannelFilter = hasWhatsApp || premiumLocked;
  const visibleEmails = filter === 'all' ? emails : emails.filter((e) => e.channel === filter);
  // Pausing preserves the draft and its time, so the bubble stays visible while
  // paused — just with a paused note and a Resume button instead of Send now.
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

  const retryDraft = async () => {
    setRetryBusy(true);
    setRetryError(null);
    try {
      await onRetryDraft();
    } catch (err) {
      setRetryError(err instanceof ApiError ? err.message : t.retryDraftFailed);
    } finally {
      setRetryBusy(false);
    }
  };

  // Regenerating a scheduled draft goes through the same redraft endpoint as the
  // failed-draft Retry: it discards the current draft and has the agent re-plan.
  const regenerateDraft = async () => {
    setRegenBusy(true);
    setRegenError(null);
    try {
      await onRetryDraft();
    } catch (err) {
      setRegenError(err instanceof ApiError ? err.message : t.regenerateFailed);
    } finally {
      setRegenBusy(false);
    }
  };

  const togglePause = async (next: boolean) => {
    setPauseBusy(true);
    setPauseError(null);
    try {
      await onTogglePause(next);
    } catch (err) {
      setPauseError(err instanceof ApiError ? err.message : t.pauseFailed);
    } finally {
      setPauseBusy(false);
    }
  };

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
        status: paused ? 'paused' : 'pending',
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
          {showChannelFilter && (
            <div
              className="seg-control"
              role="group"
              aria-label={t.conversationTimeline}
              style={{ '--seg-i': CHANNEL_FILTERS.indexOf(filter) } as CSSProperties}
            >
              <span className="seg-thumb" aria-hidden="true" />
              {CHANNEL_FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`seg-option ${filter === option ? 'seg-active' : ''}`}
                  aria-pressed={filter === option}
                  onClick={() =>
                    option !== 'email' && premiumLocked ? setShowUpgrade(true) : setFilter(option)
                  }
                >
                  {option !== 'all' && (
                    <span className={`seg-icon seg-icon-${option}`}>
                      {option === 'email' ? icon.mail : icon.whatsapp}
                    </span>
                  )}
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
        {pauseError && <div className="error-banner">{pauseError}</div>}
        {retryError && <div className="error-banner">{retryError}</div>}
        {regenError && <div className="error-banner">{regenError}</div>}
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
            <li className={`timeline-item outbound scheduled ${paused ? 'paused' : ''}`}>
              <div className="timeline-meta">
                <span className="timeline-author">
                  {paused ? (
                    <span className="paused-icon">{icon.pause}</span>
                  ) : (
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
                  )}
                </span>
                {hasWhatsApp && (
                  <span className={`channel-badge channel-${nextScheduled.channel}`}>
                    {channelLabel(nextScheduled.channel)}
                  </span>
                )}
                <span className="scheduled-note">
                  {paused
                    ? t.pausedScheduledNote(formatTimestamp(nextScheduled.scheduledFor))
                    : t.willBeSentAt(formatTimestamp(nextScheduled.scheduledFor))}
                </span>
                {paused ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small resume-btn"
                    onClick={() => togglePause(false)}
                    disabled={pauseBusy}
                  >
                    {pauseBusy ? t.resuming : t.resumeSchedule}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small send-now-btn"
                      onClick={() => setConfirmingSendNow(true)}
                      disabled={regenBusy}
                    >
                      {t.sendNow}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small regenerate-btn"
                      onClick={regenerateDraft}
                      disabled={regenBusy || pauseBusy}
                    >
                      {regenBusy ? t.regeneratingDraft : t.regenerateDraft}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small pause-btn"
                      onClick={() => togglePause(true)}
                      disabled={pauseBusy || regenBusy}
                    >
                      {t.pauseSchedule}
                    </button>
                  </>
                )}
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
          {/* Paused with no preserved draft (a reply obsoleted it while paused, or the
              pause landed mid-redraft): nothing is scheduled and nothing will be until
              the accountant resumes, which has the agent redraft. */}
          {paused && !nextScheduled && goalStatus === 'pending' && (
            <li className="timeline-item outbound scheduled">
              <div className="bubble bubble-scheduled bubble-paused">
                <span className="paused-icon">{icon.pause}</span>
                <span>{t.pausedNotice}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small resume-btn"
                  onClick={() => togglePause(false)}
                  disabled={pauseBusy}
                >
                  {pauseBusy ? t.resuming : t.resumeSchedule}
                </button>
              </div>
            </li>
          )}
          {/* Drafting failed (the attempt threw) or stalled (killed mid-flight and will
              never finish): swap the pulsing placeholder for a notice with a manual retry. */}
          {!paused && !nextScheduled && goalStatus === 'pending' && (draftFailed || draftStale) && (
            <li className="timeline-item outbound scheduled">
              <div className="bubble bubble-scheduled bubble-draft-failed">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                  <path d="M12 9v4M12 17h.01" />
                </svg>
                <span>{draftFailed ? t.draftingFailed : t.draftingStuck}</span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small retry-draft-btn"
                  onClick={retryDraft}
                  disabled={retryBusy}
                >
                  {retryBusy ? t.retryingDraft : t.retryDraft}
                </button>
              </div>
            </li>
          )}
          {/* Goal open but nothing scheduled: the agent is between decisions — a fresh
              client awaiting its first draft, or a follow-up being drafted after a send/reply. */}
          {!paused && !nextScheduled && goalStatus === 'pending' && !draftFailed && !draftStale && (
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
          channel={nextScheduled.channel}
          onSendNow={onSendNow}
          onClose={() => setConfirmingSendNow(false)}
        />
      )}
      {showUpgrade && <UpgradeModal contactEmail={contactEmail} onClose={() => setShowUpgrade(false)} />}
    </section>
  );
}
