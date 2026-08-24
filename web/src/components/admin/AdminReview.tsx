import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type ReviewMessage } from '../../api';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';

const POLL_MS = 30_000;

const timeFmt = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

type PendingAction =
  | { kind: 'approve'; message: ReviewMessage }
  | { kind: 'regenerate'; message: ReviewMessage }
  | { kind: 'pauseClient'; message: ReviewMessage }
  | { kind: 'resumeClient'; message: ReviewMessage };

interface Props {
  /** Keeps the nav badge in sync with what this screen just fetched/changed. */
  onCountChanged: (count: number) => void;
}

/**
 * The pilot message review queue (#/review): every draft a review-mode agent
 * wrote waits here until the admin approves it (sends at its scheduled time,
 * or immediately when that time already passed) or asks for a redraft. Also
 * offers the per-client emergency pause right where a bad message shows up.
 */
export function AdminReview({ onCountChanged }: Props) {
  const { t } = useT();
  const [messages, setMessages] = useState<ReviewMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<PendingAction | null>(null);

  const refresh = useCallback(async () => {
    const { messages: rows } = await api.adminListReviewMessages();
    setMessages(rows);
    onCountChanged(rows.length);
  }, [onCountChanged]);

  useEffect(() => {
    refresh().catch(() => setError(t.reviewLoadFailed));
    const timer = window.setInterval(() => refresh().catch(() => {}), POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const run = async (id: string, op: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await op();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t.reviewActionConflict);
      else setError(err instanceof ApiError ? err.message : t.reviewActionFailed);
    } finally {
      setBusyId(null);
      await refresh().catch(() => {});
    }
  };

  const confirmProps = (action: PendingAction) => {
    const { message } = action;
    switch (action.kind) {
      case 'approve':
        return {
          title: t.reviewApprove,
          note: message.pastDue
            ? t.reviewApproveConfirmPastDue(message.clientName)
            : t.reviewApproveConfirm(message.clientName),
          confirmLabel: t.reviewApprove,
          danger: false,
          onConfirm: () => void run(message.id, () => api.adminApproveReviewMessage(message.id)),
        };
      case 'regenerate':
        return {
          title: t.reviewRegenerate,
          note: t.reviewRegenerateConfirm(message.clientName),
          confirmLabel: t.reviewRegenerate,
          danger: false,
          onConfirm: () => void run(message.id, () => api.adminRegenerateReviewMessage(message.id)),
        };
      case 'pauseClient':
        return {
          title: t.reviewPauseClient,
          note: t.reviewPauseClientConfirm(message.clientName),
          confirmLabel: t.reviewPauseClient,
          danger: true,
          onConfirm: () => void run(message.id, () => api.adminSetClientAdminPause(message.clientId, true)),
        };
      case 'resumeClient':
        return {
          title: t.reviewResumeClient,
          note: t.reviewResumeClientConfirm(message.clientName),
          confirmLabel: t.reviewResumeClient,
          danger: false,
          onConfirm: () => void run(message.id, () => api.adminSetClientAdminPause(message.clientId, false)),
        };
    }
  };

  return (
    <>
      <section className="card">
        <h2>{t.reviewTitle}</h2>
        <p className="muted">{t.reviewLead}</p>
        {error && <div className="error-banner">{error}</div>}
        {messages === null && <p className="muted">{t.loading}</p>}
        {messages !== null && messages.length === 0 && <p className="muted">{t.reviewEmpty}</p>}
      </section>

      {messages?.map((m) => {
        const busy = busyId === m.id;
        return (
          <section className="card" key={m.id}>
            <div className="card-header">
              <div className="card-title-row">
                <h3>{m.clientName}</h3>
                <span className="badge badge-neutral">{m.isTemplate ? t.reviewTemplateBadge : t.reviewFreeformBadge}</span>
                {m.clientAdminPaused && <span className="badge badge-danger">{t.reviewClientPausedBadge}</span>}
              </div>
            </div>
            <p className="muted">
              {t.reviewAccountantLabel}: {m.accountantName ?? m.accountantEmail ?? '—'}
              {m.instanceName ? ` · ${m.instanceName}` : ''}
            </p>
            {m.scheduledFor && !m.pastDue && (
              <p className="muted">{t.reviewScheduledFor(timeFmt.format(new Date(m.scheduledFor)))}</p>
            )}
            {m.pastDue && <div className="error-banner">{t.reviewPastDue}</div>}

            <div className="wa-number-display" dir="rtl" style={{ whiteSpace: 'pre-wrap', textAlign: 'right' }}>
              {m.body}
            </div>

            {m.reasoning && (
              <p className="muted">
                {t.reviewReasoningLabel}: {m.reasoning}
              </p>
            )}

            <div className="btn-row">
              <button
                className="btn btn-primary btn-small"
                disabled={busy || m.clientAdminPaused}
                onClick={() => setConfirming({ kind: 'approve', message: m })}
              >
                {t.reviewApprove}
              </button>
              <button
                className="btn btn-ghost btn-small"
                disabled={busy || m.clientAdminPaused}
                onClick={() => setConfirming({ kind: 'regenerate', message: m })}
              >
                {t.reviewRegenerate}
              </button>
              <button
                className={`btn btn-ghost btn-small ${m.clientAdminPaused ? '' : 'danger-action'}`}
                disabled={busy}
                onClick={() => setConfirming({ kind: m.clientAdminPaused ? 'resumeClient' : 'pauseClient', message: m })}
              >
                {m.clientAdminPaused ? t.reviewResumeClient : t.reviewPauseClient}
              </button>
            </div>
          </section>
        );
      })}

      {confirming && <ConfirmModal {...confirmProps(confirming)} onClose={() => setConfirming(null)} />}
    </>
  );
}
