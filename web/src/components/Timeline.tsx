import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { formatFileSize, formatTimestamp, formatUsd, humanizePurpose, LOCALE } from '../format';
import { useT } from '../i18n';
import { useViewer } from '../agents/ApiContext';
import { CallDetailModal } from './admin/AdminLlmCalls';
import { ConfirmModal } from './ConfirmModal';
import { FileViewModal } from './FileViewModal';
import { StepDetailModal, gateReasonOf, gateResultOf } from './StepDetailModal';
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

function mergeTrace(
  emails: Email[],
  trace: AdminConversation | null,
  show: { calls: boolean; steps: boolean },
): TimelineRow[] {
  const rows: TimelineRow[] = emails.map((email, index) => ({
    kind: 'message',
    at: Date.parse(email.sent_at ?? email.created_at),
    email,
    index,
  }));
  if (!trace) return rows;
  // A call's row is written when the answer arrives (createdAt = end), while
  // its gate is audited right after — order calls by their START so the call
  // precedes the gate that checks it.
  // A generate_message call (and its send_reply) whose draft a replan threw
  // away never produced a visible message — dropped along with the draft.
  if (show.calls)
    for (const call of trace.calls) {
      if (call.discarded) continue;
      rows.push({ kind: 'call', at: Date.parse(call.createdAt) - (call.durationMs ?? 0), call });
    }
  if (show.steps)
    for (const step of trace.steps) {
      if (step.discarded) continue;
      rows.push({ kind: 'step', at: Date.parse(step.occurredAt), step });
    }
  return rows.sort((a, b) => a.at - b.at || ROW_RANK[a.kind] - ROW_RANK[b.kind]);
}

// Two independent toggles (LLM calls / code steps), each remembered per browser.
const TRACE_KEYS = { calls: 'fm.conversationTrace.calls', steps: 'fm.conversationTrace.steps' } as const;
type TraceKind = keyof typeof TRACE_KEYS;

function readTraceToggle(kind: TraceKind): boolean {
  try {
    return localStorage.getItem(TRACE_KEYS[kind]) === '1';
  } catch {
    return false;
  }
}

/**
 * An LLM call: just its stage name in a clickable chip; the click opens the
 * call's drill-down (metadata, system prompt, history, query, answer). The
 * numbers live in the chip's tooltip.
 */
function CallChip({ call }: { call: LlmCallSummary }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  // The human label; the technical stage key lives inside the modal.
  const label = t.llmPurposeLabels[call.purpose] ?? humanizePurpose(call.purpose);
  const tooltip = [
    formatTimestamp(call.createdAt),
    call.model,
    `${call.inputTokens.toLocaleString(LOCALE)}/${call.outputTokens.toLocaleString(LOCALE)} tok`,
    call.cost === null ? '—' : formatUsd(call.cost),
    ...(call.error ? [call.error] : []),
  ].join(' · ');
  return (
    <li className="timeline-trace timeline-trace-call" dir="ltr">
      <button
        type="button"
        className={`timeline-trace-chip ${call.status === 'error' ? 'timeline-trace-chip-error' : ''}`}
        title={tooltip}
        onClick={() => setOpen(true)}
      >
        <span className="timeline-trace-icon" aria-hidden="true">🤖</span>
        <span dir="ltr">{label}</span>
      </button>
      {open && <CallDetailModal callId={call.id} onClose={() => setOpen(false)} />}
    </li>
  );
}

function TraceRow({ entry }: { entry: TraceEntry }) {
  if (entry.kind === 'call') return <CallChip call={entry.call} />;
  return <StepRow step={entry.step} />;
}

/**
 * One audited code step. Every row is a button that opens the step detail
 * modal: what the step did (document names, evidence, channel, times) and,
 * for a gate row, its check list (✓ / ✗ per check).
 */
function StepRow({ step: s }: { step: AdminConversationStep }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const result = gateResultOf(s);
  const reason = gateReasonOf(s);
  const glyph = s.severity === 'critical' ? '⛔' : s.action.startsWith('apply_') || s.action === 'send_reply' ? '⚙️' : '🛡️';
  return (
    <li className={`timeline-trace timeline-trace-step ${s.severity === 'critical' ? 'timeline-trace-critical' : ''}`} dir="ltr">
      <button type="button" className="timeline-trace-gate" aria-label={`${t.gateModalOpen}: ${s.action}`} onClick={() => setOpen(true)}>
        <span className="timeline-trace-icon" aria-hidden="true">{glyph}</span>
        <span className="muted">{formatTimestamp(s.occurredAt)}</span>
        <span className="mono">{s.action}</span>
        {result !== null && <span className={`badge ${result ? 'badge-success' : 'badge-danger'}`}>result: {String(result)}</span>}
        {reason && <span className="muted timeline-trace-reason">{reason}</span>}
      </button>
      {open && <StepDetailModal step={s} onClose={() => setOpen(false)} />}
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
  const listRef = useRef<HTMLOListElement>(null);
  // Admin-only LLM trace. The toggle exists only for an admin viewer with a
  // clientId; the accountant never sees it and the endpoint behind it
  // (requireAdmin, checked on the REAL user) refuses their session anyway.
  const { isAdmin } = useViewer();
  const traceAvailable = isAdmin && clientId !== undefined;
  const [showCalls, setShowCalls] = useState<boolean>(() => readTraceToggle('calls'));
  const [showSteps, setShowSteps] = useState<boolean>(() => readTraceToggle('steps'));
  const [trace, setTrace] = useState<AdminConversation | null>(null);
  const [traceError, setTraceError] = useState<string | null>(null);
  const traceOn = traceAvailable && (showCalls || showSteps);
  // Fetched for any admin viewer, not only with a trace toggle on: the same
  // payload tells whether the scheduled draft awaits admin review (048), which
  // drives the in-conversation approve button below.
  const loadTrace = useCallback(async () => {
    if (!traceAvailable || !clientId) return;
    try {
      setTrace(await api.adminGetClientConversation(clientId));
      setTraceError(null);
    } catch {
      setTraceError(t.conversationTraceFailed);
    }
  }, [traceAvailable, clientId, t]);
  useEffect(() => {
    if (!traceAvailable || !clientId) {
      setTrace(null);
      return;
    }
    let cancelled = false;
    // Background: this follows every reload of the thread, including the 15s
    // refresh — unmarked, it would keep an admin's view-as session alive forever.
    // (Opening a client is still counted through the client/thread requests.)
    api
      .adminGetClientConversation(clientId, { background: true })
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
  }, [traceAvailable, clientId, emails, nextScheduled]);
  // The live draft awaiting admin review, if any (admin viewer only). A replan's
  // discarded draft never counts — the endpoint flags those.
  const pendingReview = useMemo(
    () =>
      nextScheduled && trace
        ? (trace.messages.find((m) => m.direction === 'outbound' && m.reviewStatus === 'pending' && !m.discarded) ?? null)
        : null,
    [trace, nextScheduled],
  );
  // Which approve modal is open. Decided at click time (not render time) so a
  // trace refresh can't flip the modal's wording under the admin's cursor:
  // 'now' = the send time already passed (parked as 'held', or by the clock),
  // so approval sends immediately; 'scheduled' = it will send on schedule.
  const [confirmingApprove, setConfirmingApprove] = useState<'scheduled' | 'now' | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  // Id of the draft the server just sent at once (approved past due). Drives a
  // dismissable notice that outlives the scheduled block (which vanishes as
  // soon as the send lands) and clears itself once a different draft is up.
  const [sentNowId, setSentNowId] = useState<string | null>(null);
  const openApproveModal = () => {
    if (!pendingReview || !nextScheduled) return;
    const pastDue = pendingReview.status === 'held' || Date.parse(nextScheduled.scheduledFor) <= Date.now();
    setConfirmingApprove(pastDue ? 'now' : 'scheduled');
  };
  const approveDraft = async () => {
    if (!pendingReview) return;
    const draftId = pendingReview.id;
    setApproveBusy(true);
    setApproveError(null);
    setSentNowId(null);
    try {
      // The server, not the client's guess, says whether it went out at once.
      const { sentImmediately } = await api.adminApproveReviewMessage(draftId);
      if (sentImmediately) setSentNowId(draftId);
      await loadTrace();
    } catch (err) {
      setApproveError(err instanceof ApiError ? err.message : t.reviewActionFailed);
    } finally {
      setApproveBusy(false);
    }
  };
  useEffect(() => {
    if (sentNowId && pendingReview && pendingReview.id !== sentNowId) setSentNowId(null);
  }, [sentNowId, pendingReview]);
  const toggleTrace = (kind: TraceKind, on: boolean) => {
    (kind === 'calls' ? setShowCalls : setShowSteps)(on);
    try {
      localStorage.setItem(TRACE_KEYS[kind], on ? '1' : '0');
    } catch {
      /* per-viewer convenience only */
    }
  };
  // Whether the user is scrolled near the bottom — sampled on every scroll so the
  // auto-scroll below never yanks someone who is reading older messages.
  const nearBottomRef = useRef(true);

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

  const attachmentLabel = (file: DocumentFile): string => {
    if (file.label) return file.label;
    // A child cut out of a multi-document PDF: the original's name plus its pages.
    const parent = file.parent_file_id ? files.find((f) => f.id === file.parent_file_id) : undefined;
    if (parent && file.page_from != null && file.page_to != null) {
      return `${attachmentLabel(parent)} · ${t.splitPagesShort(file.page_from, file.page_to)}`;
    }
    if (!hasSyntheticName(file)) return file.filename;
    if (file.content_type.startsWith('image/')) return t.attachmentImage;
    if (file.content_type === 'application/pdf') return t.attachmentPdf;
    return t.attachmentFile;
  };

  const trackScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  // Open at the latest message and stay there while the content grows — messages
  // arriving, trace rows loading, images decoding, the panel getting its final
  // height — unless the user has scrolled up to read older messages. A
  // ResizeObserver on the list (and on the panel, for viewport changes) sees
  // every one of those; an effect keyed on the data cannot, because the DOM often
  // has not reached its final size when React commits.
  useEffect(() => {
    const el = bodyRef.current;
    const list = listRef.current;
    if (!el || !list) return;
    const follow = () => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
    };
    follow();
    const ro = new ResizeObserver(follow);
    ro.observe(list);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
            <>
              <label className="muted timeline-trace-toggle" title={t.conversationTraceTitle}>
                <input id="conversation-trace-calls" type="checkbox" checked={showCalls} onChange={(e) => toggleTrace('calls', e.target.checked)} />
                {t.conversationTraceCalls}
              </label>
              <label className="muted timeline-trace-toggle" title={t.conversationTraceTitle}>
                <input id="conversation-trace-steps" type="checkbox" checked={showSteps} onChange={(e) => toggleTrace('steps', e.target.checked)} />
                {t.conversationTraceSteps}
              </label>
            </>
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
        {approveError && <div className="error-banner">{approveError}</div>}
        {sentNowId && !approveError && (
          <div className="ok-banner sent-now-banner" role="status">
            <span>{t.approveDraftSentNow}</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setSentNowId(null)}>
              {t.dismiss}
            </button>
          </div>
        )}
        {visibleEmails.length === 0 && !showScheduled && goalStatus !== 'pending' && (
          <p className="muted">{t.noEmailsExchangedYet}</p>
        )}
        {traceError && traceOn && <div className="error-banner">{traceError}</div>}
        <ol className="timeline" ref={listRef}>
          {mergeTrace(visibleEmails, traceOn ? trace : null, { calls: showCalls, steps: showSteps }).map((row) => {
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
                                : file.analysis_status === 'split'
                                  ? t.analysisSplitTitle
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
                {pendingReview && (
                  <span className="badge badge-pending review-pending-badge">{t.adminMsgStatusHeld}</span>
                )}
                {pendingReview && !paused && (
                  <button
                    type="button"
                    className="btn btn-primary btn-small approve-draft-btn"
                    onClick={openApproveModal}
                    disabled={approveBusy || regenBusy || pauseBusy}
                  >
                    {approveBusy ? t.approvingDraft : t.reviewApprove}
                  </button>
                )}
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
      {confirmingApprove === 'now' && pendingReview && (
        <ConfirmModal
          warning
          title={t.approveDraftNowTitle}
          note={t.approveDraftNowNote}
          confirmLabel={t.approveDraftNowConfirm}
          onConfirm={() => void approveDraft()}
          onClose={() => setConfirmingApprove(null)}
        />
      )}
      {confirmingApprove === 'scheduled' && pendingReview && nextScheduled && (
        <ConfirmModal
          title={t.reviewApprove}
          note={t.approveDraftConfirm(formatTimestamp(nextScheduled.scheduledFor))}
          confirmLabel={t.reviewApprove}
          onConfirm={() => void approveDraft()}
          onClose={() => setConfirmingApprove(null)}
        />
      )}
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
