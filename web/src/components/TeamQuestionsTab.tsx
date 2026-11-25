import { useState } from 'react';
import type { Email, TeamQuestion } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';

/**
 * The questions tab (openspec `team-questions`): one card per question the
 * agent asked the client's team, newest first. An open card carries the
 * answer box and the "I answered the client myself" control; a closed card
 * shows how it was closed. Every signed-in person of the workspace may close a
 * question (the accountant, a staff viewer, an admin viewing as); only the
 * read-only view of a deleted client hides the controls.
 */
export function TeamQuestionsTab({
  clientId,
  questions,
  emails,
  readOnly,
  onFocusMessage,
  onClosed,
}: {
  clientId: string;
  questions: TeamQuestion[];
  emails: Email[];
  readOnly: boolean;
  onFocusMessage: (messageId: string) => void;
  onClosed: () => Promise<void>;
}) {
  const { t } = useT();
  const open = questions.filter((q) => q.closedAt === null).length;
  return (
    <section className="panel team-questions-panel">
      <div className="panel-header">
        <h3>
          {t.teamQuestionsTitle}
          {questions.length > 0 && <span className="panel-count muted"> · {open > 0 ? t.teamQuestionsOpenCount(open) : t.teamQuestionsAllClosed}</span>}
        </h3>
      </div>
      {questions.length === 0 ? (
        <p className="muted team-questions-empty">{t.teamQuestionsEmpty}</p>
      ) : (
        <ul className="team-question-list">
          {questions.map((q) => (
            <TeamQuestionCard
              key={q.id}
              clientId={clientId}
              question={q}
              quoted={q.evidenceMessageId ? (emails.find((e) => e.id === q.evidenceMessageId) ?? null) : null}
              readOnly={readOnly}
              onFocusMessage={onFocusMessage}
              onClosed={onClosed}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function TeamQuestionCard({
  clientId,
  question: q,
  quoted,
  readOnly,
  onFocusMessage,
  onClosed,
}: {
  clientId: string;
  question: TeamQuestion;
  quoted: Email | null;
  readOnly: boolean;
  onFocusMessage: (messageId: string) => void;
  onClosed: () => Promise<void>;
}) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [handled, setHandled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOpen = q.closedAt === null;

  const close = async (how: 'answered' | 'handled_outside', text: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.closeTeamQuestion(clientId, q.id, how, text);
      await onClosed();
    } catch (err) {
      // 409 = someone closed it first; 400 = blank answer. The card refreshes
      // on the next load either way, so the message is enough.
      const message = err instanceof Error ? err.message : String(err);
      setError(/already closed|409/.test(message) ? t.teamQuestionAlreadyClosed : t.teamQuestionCloseFailed(message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`team-question-card ${isOpen ? 'is-open' : 'is-closed'}`}>
      <div className="team-question-text">{q.question}</div>
      {quoted && (
        <div className="team-question-quote">
          <span className="team-question-label muted">{t.teamQuestionQuoteLabel}</span>{' '}
          <button type="button" className="doc-evidence-link" title={t.teamQuestionQuoteTitle} onClick={() => onFocusMessage(quoted.id)}>
            {`"${quoted.body}"`}
          </button>
        </div>
      )}
      <div className="team-question-meta muted">
        {t.teamQuestionAskedMeta(q.toName, formatTimestamp(q.askedAt))}
        {isOpen && <span className="team-question-open-chip">{t.teamQuestionOpenChip}</span>}
      </div>
      {!isOpen && (
        <div className="team-question-closed">
          {q.closedHow === 'answered' ? (
            <>
              <div className="team-question-answer">{q.closedText}</div>
              <div className="muted">{t.teamQuestionAnsweredMeta(q.closedByName ?? q.toName, formatTimestamp(q.closedAt!))}</div>
            </>
          ) : (
            <>
              <div className="team-question-handled">{t.teamQuestionHandledMeta(q.closedByName ?? q.toName, formatTimestamp(q.closedAt!))}</div>
              {q.closedText && q.closedText.trim() !== '' && (
                <div className="muted">
                  <span className="team-question-label">{t.teamQuestionNoteLabel}</span> {q.closedText}
                </div>
              )}
            </>
          )}
        </div>
      )}
      {isOpen && !readOnly && (
        <div className="team-question-actions">
          {!handled ? (
            <>
              <textarea
                className="team-question-input"
                rows={3}
                placeholder={t.teamQuestionAnswerPlaceholder}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                disabled={busy}
              />
              <div className="btn-row team-question-buttons">
                <button type="button" className="btn btn-primary" disabled={busy || answer.trim() === ''} onClick={() => void close('answered', answer.trim())}>
                  {t.teamQuestionSendAnswer}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setHandled(true)}>
                  {t.teamQuestionHandledMyself}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="team-question-handled-hint muted">{t.teamQuestionHandledHint}</div>
              <textarea
                className="team-question-input"
                rows={2}
                placeholder={t.teamQuestionNotePlaceholder}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
              />
              <div className="btn-row team-question-buttons">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void close('handled_outside', note.trim())}>
                  {t.teamQuestionConfirmHandled}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setHandled(false)}>
                  {t.cancel}
                </button>
              </div>
            </>
          )}
          {error && (
            <div className="error-banner team-question-error" role="alert">
              {error}
            </div>
          )}
        </div>
      )}
    </li>
  );
}
