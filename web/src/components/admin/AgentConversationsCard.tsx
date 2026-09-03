import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type AdminClient, type AdminConversation } from '../../api';
import { displayClientName, formatTimestamp } from '../../format';
import { useT } from '../../i18n';

/**
 * Admin conversation viewer: the full thread (drafts, held and sent rows) the
 * agent is having with one client. Read-only — actions on messages live in
 * the review queue (#/review).
 */
function ConversationModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const { t } = useT();
  const [conversation, setConversation] = useState<AdminConversation | null>(null);
  const [error, setError] = useState<string | null>(null);

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

        {conversation?.messages.map((m) => {
          const scheduled = m.direction === 'outbound' && m.status === 'draft';
          const held = m.status === 'held' || m.reviewStatus === 'pending';
          return (
            <div key={m.id} style={{ marginBottom: 14 }}>
              <p className="muted" style={{ marginBottom: 4 }}>
                {m.direction === 'inbound' ? '⬅' : '➡'} {formatTimestamp(m.sentAt ?? m.createdAt)}
                {' · '}
                {m.channel === 'whatsapp' ? 'WhatsApp' : t.mwColEmail}
                {m.isTemplate && <span className="badge badge-neutral">{t.adminMsgStatusTemplate}</span>}
                {scheduled && !held && <span className="badge badge-pending">{t.adminMsgStatusScheduled}</span>}
                {held && <span className="badge badge-danger">{t.adminMsgStatusHeld}</span>}
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
