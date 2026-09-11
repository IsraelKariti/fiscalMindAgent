import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  api,
  ApiError,
  type AdminConversation,
  type AdminConversationStep,
  type DocumentFile,
  type Email,
  type GoalStatus,
  type LlmCallSummary,
  type MessageChannel,
  type NextScheduled,
} from '../api';
import { formatFileSize, formatTimestamp, formatUsd, LOCALE } from '../format';
import { useT } from '../i18n';
import { useViewer } from '../agents/ApiContext';
import { FileViewModal } from './FileViewModal';
import { SendNowModal } from './SendNowModal';

type ChannelFilter = 'all' | MessageChannel;

// "Re: X" is the same thread title as "X" — ignore reply/forward prefixes when
// deciding whether a message actually renamed the thread.
function subjectKey(subject: string): string {
  return subject.replace(/^(\s*(re|fwd?)\s*:\s*)+/i, '').trim().toLowerCase();
}

// Tiny unlinked images are almost always signature logos / social icons that
// arrived with an explicit `attachment` disposition (ingestion already drops
// the inline-referenced ones). Hide them from the conversation only — they
// stay listed in the Documents tab's files card.
const SIGNATURE_IMAGE_MAX_BYTES = 20 * 1024;

function isTimelineAttachment(file: DocumentFile): boolean {
  if (!file.content_type.startsWith('image/')) return true;
  if (file.client_document_id) return true;
  return Number(file.size_bytes) >= SIGNATURE_IMAGE_MAX_BYTES;
}

// WhatsApp media carries no real filename — ingestion synthesizes
// "whatsapp-media-N.ext", which means nothing to the accountant.
function hasSyntheticName(file: DocumentFile): boolean {
  return /^whatsapp-media-\d+\./.test(file.filename);
}

/**
 * Admin-only trace rows woven between the messages: the LLM calls and the
 * audited code steps (gates, apply_*, send_reply) of this client, as served
 * by the admin conversation endpoint. Ties on the same instant break steps →
 * calls → messages, so a cycle reads inbound, regex, scan, decide,
 * validate_message, apply_*, send_reply, outbound.
 */
type TraceEntry =
  | { kind: 'call'; at: number; call: LlmCallSummary }
  | { kind: 'step'; at: number; step: AdminConversationStep };

type TimelineRow = { kind: 'message'; at: number; email: Email; index: number } | TraceEntry;

const ROW_RANK = { step: 0, call: 1, message: 2 } as const;

function mergeTrace(emails: Email[], trace: AdminConversation | null): TimelineRow[] {
  const rows: TimelineRow[] = emails.map((email, index) => ({
    kind: 'message',
    at: Date.parse(email.sent_at ?? email.created_at),
    email,
    index,
  }));
  if (!trace) return rows;
  for (const call of trace.calls) rows.push({ kind: 'call', at: Date.parse(call.createdAt), call });
  for (const step of trace.steps) rows.push({ kind: 'step', at: Date.parse(step.occurredAt), step });
  return rows.sort((a, b) => a.at - b.at || ROW_RANK[a.kind] - ROW_RANK[b.kind]);
}

const TRACE_TOGGLE_KEY = 'fm.conversationTrace';

function readTraceToggle(): boolean {
  try {
    return localStorage.getItem(TRACE_TOGGLE_KEY) === '1';
  } catch {
    return false;
  }
}

function TraceRow({ entry }: { entry: TraceEntry }) {
  if (entry.kind === 'call') {
    const c = entry.call;
    return (
      <li className="timeline-trace timeline-trace-call" dir="ltr" title={c.error ?? undefined}>
        <span className="timeline-trace-icon" aria-hidden="true">🤖</span>
        <span className="muted">{formatTimestamp(c.createdAt)}</span>
        <span className="mono">{c.purpose}</span>
        <span className="muted">{c.model}</span>
        <span className="muted">
          {c.inputTokens.toLocaleString(LOCALE)}/{c.outputTokens.toLocaleString(LOCALE)} tok · {c.cost === null ? '—' : formatUsd(c.cost)}
        </span>
        {c.status === 'error' && <span className="badge badge-danger">error</span>}
      </li>
    );
  }
  const s = entry.step;
  const result = typeof s.detail['result'] === 'boolean' ? (s.detail['result'] as boolean) : null;
  const reason = typeof s.detail['reason'] === 'string' && s.detail['reason'] !== '' ? String(s.detail['reason']) : null;
  const glyph = s.severity === 'critical' ? '⛔' : s.action.startsWith('apply_') || s.action === 'send_reply' ? '⚙️' : '🛡️';
  return (
    <li
      className={`timeline-trace timeline-trace-step ${s.severity === 'critical' ? 'timeline-trace-critical' : ''}`}
      dir="ltr"
      title={JSON.stringify(s.detail)}
    >
      <span className="timeline-trace-icon" aria-hidden="true">{glyph}</span>
      <span className="muted">{formatTimestamp(s.occurredAt)}</span>
      <span className="mono">{s.action}</span>
      {result !== null && <span className={`badge ${result ? 'badge-success' : 'badge-danger'}`}>result: {String(result)}</span>}
      {reason && <span className="muted timeline-trace-reason">{reason}</span>}
    </li>
  );
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
  image: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  ),
  file: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
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
  files = [],
  nextScheduled,
  goalStatus,
  paused,
  overdueStopped = false,
  draftFailed,
  draftStale,
  onSendNow,
  onTogglePause,
  onRetryDraft,
  onRetrySend,
  channels,
  hideStatusFooter = false,
  clientId,
}: {
  emails: Email[];
  /**
   * Enables the admin-only LLM trace toggle (calls + audited code steps woven
   * between the messages). Only shown to an admin viewer (ViewerProvider); the
   * data comes from the admin-gated conversation endpoint.
   */
  clientId?: string;
  /** The client's stored files; each carries email_id, linking it to the message it arrived (or was sent) on. */
  files?: DocumentFile[];
  nextScheduled: NextScheduled | null;
  goalStatus: GoalStatus;
  /** True while the agent's outreach to this client is paused. */
  paused: boolean;
  /** Doc collector: the pause is because the collection due date passed — swap the paused copy for the handed-off copy. */
  overdueStopped?: boolean;
  /** The last drafting attempt threw — show the failure notice with a Retry button. */
  draftFailed: boolean;
  /** Drafting has been "in progress" implausibly long (attempt killed mid-flight) — offer Retry too. */
  draftStale: boolean;
  onSendNow: () => Promise<void>;
  onTogglePause: (paused: boolean) => Promise<void>;
  onRetryDraft: () => Promise<void>;
  /** Re-fires a scheduled send whose attempt failed (nextScheduled.sendFailedAt), keeping the same draft. */
  onRetrySend: () => Promise<void>;
  /**
   * The channels the agent type speaks (AgentTypeUI.channels). Single-channel
   * agents get no channel filter and no per-message channel badges — there is
   * nothing to tell apart.
   */
  channels: readonly MessageChannel[];
  /** Goal-less agents (customer service) pass goalStatus="complete" just to mute the scheduling UI — hide its footer too. */
  hideStatusFooter?: boolean;
}) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [confirmingSendNow, setConfirmingSendNow] = useState(false);
  const [viewingFile, setViewingFile] = useState<DocumentFile | null>(null);
  const [pauseBusy, setPauseBusy] = useState(false);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [regenBusy, setRegenBusy] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [sendRetryBusy, setSendRetryBusy] = useState(false);
  const [sendRetryError, setSendRetryError] = useState<string | null>(null);
  // A single-channel agent has nothing to filter or badge — the control and the
  // per-message channel badges only exist when the agent speaks several channels.
  const multiChannel = channels.length > 1;
  // Order matters: the segmented control's sliding thumb is positioned by index.
  const channelFilters: readonly ChannelFilter[] = ['all', ...channels];
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const bodyRef = useRef<HTMLDivElement>(null);
  // Admin-only LLM trace. The toggle exists only for an admin viewer with a
  // clientId; the accountant never sees it and the endpoint behind it
  // (requireAdmin, checked on the REAL user) refuses their session anyway.
  const { isAdmin } = useViewer();
  const traceAvailable = isAdmin && clientId !== undefined;
  const [showTrace, setShowTrace] = useState<boolean>(() => readTraceToggle());
  const [trace, setTrace] = useState<AdminConversation | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const traceOn = traceAvailable && showTrace;
  useEffect(() => {
    if (!traceOn || !clientId) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    api
      .adminGetClientConversation(clientId)
      .then((c) => {
        if (!cancelled) {
          setTrace(c);
          setTraceError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setTraceError(t.conversationTraceFailed);
      });
    return () => {
      cancelled = true;
    };
    // Refetch whenever the thread changes (a new message means new calls/steps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceOn, clientId, emails, nextScheduled]);
  const toggleTrace = (on: boolean) => {
    setShowTrace(on);
    try {
      localStorage.setItem(TRACE_TOGGLE_KEY, on ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  };
  // Whether the user is scrolled near the bottom — sampled on every scroll so the
  // auto-scroll below never yanks someone who is reading older messages.
  const nearBottomRef = useRef(true);
  const didInitRef = useRef(false);

  // The filter only exists when the client actually has (or is about to get)
  // WhatsApp traffic — email-only conversations keep the plain header.
  const hasWhatsApp = emails.some((e) => e.channel === 'whatsapp') || nextScheduled?.channel === 'whatsapp';
  const showChannelFilter = multiChannel && hasWhatsApp;
  const showChannelBadges = multiChannel && hasWhatsApp;
  const visibleEmails = filter === 'all' ? emails : emails.filter((e) => e.channel === filter);
  // Pausing preserves the draft and its time, so the bubble stays visible while
  // paused — just with a paused note and a Resume button instead of Send now.
  const showScheduled = nextScheduled !== null && (filter === 'all' || nextScheduled.channel === filter);
  // The scheduled send's last attempt threw: the bubble stays (same draft) but
  // flips to error styling with Retry instead of Send now. The paused treatment
  // wins — a paused row's send isn't going anywhere regardless.
  const sendFailed = !paused && nextScheduled?.sendFailedAt != null;
  const channelLabel = (channel: MessageChannel) => (channel === 'whatsapp' ? t.channelWhatsApp : t.channelEmail);

  // Files grouped under the message they arrived on. Chronological, so chip
  // order inside a bubble matches the order the attachments were sent in.
  const filesByEmail = useMemo(() => {
    const map = new Map<string, DocumentFile[]>();
    for (const file of files) {
      if (!file.email_id || !isTimelineAttachment(file)) continue;
      const group = map.get(file.email_id);
      if (group) group.push(file);
      else map.set(file.email_id, [file]);
    }
    return map;
  }, [files]);

  const attachmentLabel = (file: DocumentFile) => {
    if (file.label) return file.label;
    if (!hasSyntheticName(file)) return file.filename;
    if (file.content_type.startsWith('image/')) return t.attachmentImage;
    if (file.content_type === 'application/pdf') return t.attachmentPdf;
    return t.attachmentFile;
  };

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

  const retrySend = async () => {
    setSendRetryBusy(true);
    setSendRetryError(null);
    try {
      await onRetrySend();
    } catch (err) {
      setSendRetryError(err instanceof ApiError ? err.message : t.retrySendFailed);
    } finally {
      setSendRetryBusy(false);
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
    const messages: { time: string; sender: string; channel: string; status: string; subject: string; body: string; agent_reasoning?: string; attachments?: string[] }[] =
      emails.map((email) => {
        const attachments = filesByEmail.get(email.id);
        return {
          time: email.sent_at ?? email.created_at,
          sender: email.direction === 'outbound' ? 'agent' : 'client',
          channel: email.channel,
          status: email.status,
          subject: email.subject,
          body: email.body,
          ...(email.reasoning ? { agent_reasoning: email.reasoning } : {}),
          ...(attachments ? { attachments: attachments.map((f) => f.filename) } : {}),
        };
      });
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
        {showChannelFilter && (
          <div
            className="seg-control"
            role="group"
            aria-label={t.conversationTimeline}
            style={{ '--seg-i': channelFilters.indexOf(filter), '--seg-n': channelFilters.length } as CSSProperties}
          >
            <span className="seg-thumb" aria-hidden="true" />
            {channelFilters.map((option) => (
              <button
                key={option}
                type="button"
                className={`seg-option ${filter === option ? 'seg-active' : ''}`}
                aria-pressed={filter === option}
                onClick={() => setFilter(option)}
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
        <div className="panel-header-actions">
          {traceAvailable && (
            <label className="muted timeline-trace-toggle" title={t.conversationTraceTitle}>
              <input id="conversation-trace-toggle" type="checkbox" checked={showTrace} onChange={(e) => toggleTrace(e.target.checked)} />
              {t.conversationTraceToggle}
            </label>
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
        {sendRetryError && <div className="error-banner">{sendRetryError}</div>}
        {visibleEmails.length === 0 && !showScheduled && goalStatus !== 'pending' && (
          <p className="muted">{t.noEmailsExchangedYet}</p>
        )}
        {traceError && traceOn && <div className="error-banner">{traceError}</div>}
        <ol className="timeline">
          {mergeTrace(visibleEmails, traceOn ? trace : null).map((row) => {
            if (row.kind !== 'message') {
              return <TraceRow key={`${row.kind}-${row.kind === 'call' ? row.call.id : row.step.id}`} entry={row} />;
            }
            const { email, index: i } = row;
            const outbound = email.direction === 'outbound';
            const prev = i > 0 ? visibleEmails[i - 1] : undefined;
            // WhatsApp messages have no subject; only email bubbles show a thread title.
            const newSubject =
              email.channel === 'email' &&
              email.subject !== '' &&
              (!prev || subjectKey(email.subject) !== subjectKey(prev.subject));
            const attachments = filesByEmail.get(email.id) ?? [];
            return (
              <li key={email.id} className={`timeline-item ${outbound ? 'outbound' : 'inbound'}`}>
                <div className="timeline-meta">
                  {showChannelBadges && (
                    <span className={`channel-badge channel-${email.channel}`}>{channelLabel(email.channel)}</span>
                  )}
                  <span className="muted">{formatTimestamp(email.sent_at ?? email.created_at)}</span>
                </div>
                <div className="bubble">
                  {newSubject && <div className="bubble-subject" dir="auto">{email.subject}</div>}
                  {/* WhatsApp media can arrive with no text at all — a chip-only bubble. */}
                  {(email.body !== '' || attachments.length === 0) && (
                    <div className="bubble-body" dir="auto">{email.body}</div>
                  )}
                  {email.blocked && (
                    <div className="bubble-blocked">
                      <span className="badge badge-danger" title={t.messageBlockedTitle}>{t.messageBlocked}</span>
                    </div>
                  )}
                  {attachments.length > 0 && (
                    <div className="bubble-attachments">
                      {attachments.map((file) => (
                        <button
                          key={file.id}
                          type="button"
                          className={`attachment-chip ${file.analysis?.injection_suspected || file.analysis_status === 'blocked' ? 'attachment-chip-danger' : ''}`}
                          title={
                            file.analysis_status === 'blocked'
                              ? t.analysisBlockedTitle
                              : file.analysis?.injection_suspected
                                ? t.analysisSuspiciousTitle
                                : file.filename
                          }
                          onClick={() => setViewingFile(file)}
                        >
                          <span className="attachment-chip-icon">
                            {file.content_type.startsWith('image/') ? icon.image : icon.file}
                          </span>
                          <span className="attachment-chip-name">{attachmentLabel(file)}</span>
                          <span className="attachment-chip-size">{formatFileSize(file.size_bytes)}</span>
                        </button>
                      ))}
                    </div>
                  )}
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
            <li className={`timeline-item outbound scheduled ${paused ? 'paused' : ''} ${sendFailed ? 'send-failed' : ''}`}>
              <div className="timeline-meta">
                {paused && (
                  <span className="timeline-author">
                    <span className="paused-icon">{icon.pause}</span>
                  </span>
                )}
                {showChannelBadges && (
                  <span className={`channel-badge channel-${nextScheduled.channel}`}>
                    {channelLabel(nextScheduled.channel)}
                  </span>
                )}
                <span className={`scheduled-note ${sendFailed ? 'scheduled-note-failed' : ''}`}>
                  {paused ? (
                    overdueStopped ? (
                      t.overdueScheduledNote(formatTimestamp(nextScheduled.scheduledFor))
                    ) : (
                      t.pausedScheduledNote(formatTimestamp(nextScheduled.scheduledFor))
                    )
                  ) : sendFailed ? (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
                        <path d="M12 9v4M12 17h.01" />
                      </svg>
                      {t.sendFailedNote}
                    </>
                  ) : (
                    <>
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
                      {formatTimestamp(nextScheduled.scheduledFor)}
                    </>
                  )}
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
                ) : sendFailed ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small retry-send-btn"
                      onClick={retrySend}
                      disabled={sendRetryBusy || regenBusy}
                    >
                      {sendRetryBusy ? t.retryingSend : t.retrySend}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small regenerate-btn"
                      onClick={regenerateDraft}
                      disabled={regenBusy || sendRetryBusy}
                    >
                      {regenBusy ? t.regeneratingDraft : t.regenerateDraft}
                    </button>
                  </>
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
                <span>{overdueStopped ? t.overdueNotice : t.pausedNotice}</span>
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
        {!nextScheduled && goalStatus === 'complete' && !hideStatusFooter && (
          <p className="muted timeline-footer">{t.goalCompleteFooter}</p>
        )}
      </div>
      {confirmingSendNow && nextScheduled && (
        <SendNowModal
          channel={nextScheduled.channel}
          onSendNow={onSendNow}
          onClose={() => setConfirmingSendNow(false)}
        />
      )}
      {viewingFile && (
        <FileViewModal clientId={viewingFile.client_id} file={viewingFile} onClose={() => setViewingFile(null)} />
      )}
    </section>
  );
}
