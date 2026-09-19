import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type AdminClient,
  type AdminConversation,
  type AdminConversationMessage,
  type AdminConversationStep,
  type LlmCallSummary,
} from '../../api';
import { displayClientName, formatTimestamp, formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { StepDetailModal, gateReasonOf, gateResultOf } from '../StepDetailModal';

type TimelineEntry =
  | { kind: 'message'; at: number; message: AdminConversationMessage }
  | { kind: 'call'; at: number; call: LlmCallSummary }
  | { kind: 'step'; at: number; step: AdminConversationStep };

/**
 * One time-ordered list of messages, LLM calls and code steps (gates,
 * apply_*, send_reply) — the conversation as the pipeline saw it. Ties break
 * steps → calls → messages, so a cycle reads: inbound, regex, scan, decide,
 * validate_message, apply_*, send_reply, outbound.
 */
function interleave(c: AdminConversation, withSteps: boolean): TimelineEntry[] {
  const rank = { step: 0, call: 1, message: 2 } as const;
  const entries: TimelineEntry[] = c.messages.map((m) => ({ kind: 'message', at: Date.parse(m.sentAt ?? m.createdAt), message: m }));
  if (withSteps) {
    // createdAt is the call's END (the row is written on answer); sort by its start.
    for (const call of c.calls) entries.push({ kind: 'call', at: Date.parse(call.createdAt) - (call.durationMs ?? 0), call });
    for (const step of c.steps) entries.push({ kind: 'step', at: Date.parse(step.occurredAt), step });
  }
  return entries.sort((a, b) => a.at - b.at || rank[a.kind] - rank[b.kind]);
}

/**
 * Admin conversation viewer: the full thread (drafts, held and sent rows) the
 * agent is having with one client, optionally interleaved with every LLM call
 * and code step. Read-only — actions on messages live in the review queue
 * (#/review).
 */
function ConversationModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { t } = useT();
  const [conversation, setConversation] = useState<AdminConversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(true);

  useEffect(() => {
    api
      .adminGetClientConversation(clientId)
      .then(setConversation)
      .catch(() => setError(t.adminConversationLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(760px, 92vw)', maxHeight: '85vh', overflowY: 'auto' }}
      >
        <h2>{t.adminConversationTitle(conversation ? displayClientName(conversation.client.name) : '…')}</h2>
        {conversation && (
          <p className="muted">
            {conversation.accountantName ?? conversation.accountantEmail ?? '—'}
            {conversation.instanceName ? ` · ${conversation.instanceName}` : ''}
          </p>
        )}
        {error && <div className="error-banner">{error}</div>}
        {!conversation && !error && <p className="muted">{t.loading}</p>}
        {conversation && conversation.messages.length === 0 && <p className="muted">{t.adminConversationEmpty}</p>}

        {conversation && (
          <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10 }}>
            <input id="admin-conversation-show-steps" type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} />
            {t.adminConversationShowSteps}
          </label>
        )}

        {conversation &&
          interleave(conversation, showSteps).map((entry) => {
            if (entry.kind === 'message') {
              const m = entry.message;
              const scheduled = m.direction === 'outbound' && m.status === 'draft' && !m.discarded;
              const held = !m.discarded && (m.status === 'held' || m.reviewStatus === 'pending');
              return (
                <div key={`m-${m.id}`} style={{ marginBottom: 14 }}>
                  <p className="muted" style={{ marginBottom: 4 }}>
                    {m.direction === 'inbound' ? '⬅' : '➡'} {formatTimestamp(m.sentAt ?? m.createdAt)}
                    {' · '}
                    {m.channel === 'whatsapp' ? 'WhatsApp' : t.mwColEmail}
                    {m.isTemplate && <span className="badge badge-neutral">{t.adminMsgStatusTemplate}</span>}
                    {scheduled && !held && <span className="badge badge-pending">{t.adminMsgStatusScheduled}</span>}
                    {held && <span className="badge badge-danger">{t.adminMsgStatusHeld}</span>}
                    {m.discarded && <span className="badge badge-neutral">{t.adminMsgStatusDiscarded}</span>}
                  </p>
                  {m.subject && <p style={{ fontWeight: 600, marginBottom: 4 }}>{m.subject}</p>}
                  <div className="wa-number-display" dir="rtl" style={{ whiteSpace: 'pre-wrap', textAlign: 'right' }}>
                    {m.body}
                  </div>
                  {m.reasoning && (
                    <p className="muted" style={{ marginTop: 4 }}>
                      {t.reviewReasoningLabel}: {m.reasoning}
                    </p>
                  )}
                </div>
              );
            }
            if (entry.kind === 'call') {
              const c = entry.call;
              return (
                <p key={`c-${c.id}`} className="muted admin-timeline-call" dir="ltr" style={{ textAlign: 'left', marginBottom: 6 }}>
                  🤖 {formatTimestamp(c.createdAt)} · <span className="mono">{c.purpose}</span> · {c.model} ·{' '}
                  {c.inputTokens.toLocaleString(LOCALE)}/{c.outputTokens.toLocaleString(LOCALE)} tok · {c.cost === null ? '—' : formatUsd(c.cost)}
                  {c.status === 'error' && <span className="badge badge-danger">error</span>}{' '}
                  <a href={`#/llm-calls/${encodeURIComponent(c.id)}`}>{t.adminConversationOpenCall}</a>
                </p>
              );
            }
            return <AdminStepRow key={`s-${entry.step.id}`} step={entry.step} />;
          })}

        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The instance's clients as the admin sees them: status, last activity, and
 * the door into each conversation.
 */
export function AgentConversationsCard({ instanceId }: { instanceId: string }) {
  const { t } = useT();
  const [clients, setClients] = useState<AdminClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setClients((await api.adminListInstanceClients(instanceId)).clients);
  }, [instanceId]);

  useEffect(() => {
    setClients(null);
    load().catch(() => setError(t.adminClientsLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return (
    <section className="card">
      <div className="settings-section">
        <h3>{t.adminConversationsTitle}</h3>
        <p className="muted">{t.adminConversationsDesc}</p>
        {error && <div className="error-banner">{error}</div>}
        {clients === null && !error && <p className="muted">{t.loading}</p>}
        {clients !== null && clients.length === 0 && <p className="muted">{t.adminConversationsEmpty}</p>}

        {clients !== null && clients.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.adminConversationsColClient}</th>
                  <th>{t.adminConversationsColStatus}</th>
                  <th>{t.adminConversationsColLastMessage}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td className="admin-table-name">{displayClientName(c.name)}</td>
                    <td>
                      {c.goalStatus === 'complete' ? (
                        <span className="badge badge-success">{t.adminGoalComplete}</span>
                      ) : (
                        <span className="badge badge-neutral">{t.adminGoalPending}</span>
                      )}
                      {(c.paused || c.adminPaused) && (
                        <span className="badge badge-danger">{t.adminClientPausedBadge}</span>
                      )}
                    </td>
                    <td dir="ltr">{c.lastMessageAt ? formatTimestamp(c.lastMessageAt) : '—'}</td>
                    <td>
                      <button className="btn btn-ghost btn-small" onClick={() => setViewing(c.id)}>
                        {t.adminConversationView}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewing && <ConversationModal clientId={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

/**
 * One audited code step in the admin viewer. Every row is a button that
 * opens the shared step detail modal (what the step did, plus the check
 * list for a gate row).
 */
function AdminStepRow({ step: s }: { step: AdminConversationStep }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const result = gateResultOf(s);
  const reason = gateReasonOf(s);
  return (
    <p
      className={`muted admin-timeline-step ${s.severity === 'critical' ? 'admin-timeline-critical' : ''}`}
      dir="ltr"
      style={{ textAlign: 'left', marginBottom: 6 }}
    >
      <button type="button" className="timeline-trace-gate" aria-label={`${t.gateModalOpen}: ${s.action}`} onClick={() => setOpen(true)}>
        {s.severity === 'critical' ? '⛔' : s.action.startsWith('apply_') || s.action === 'send_reply' || s.action === 'withhold_reply' ? '⚙️' : '🛡️'}{' '}
        {formatTimestamp(s.occurredAt)} · <span className="mono">{s.action}</span>
        {result !== null && (
          <span className={`badge ${result ? 'badge-success' : 'badge-danger'}`} style={{ marginInlineStart: 6 }}>
            result: {String(result)}
          </span>
        )}
        {reason && ` · ${reason}`}
      </button>
      {open && <StepDetailModal step={s} onClose={() => setOpen(false)} />}
    </p>
  );
}
