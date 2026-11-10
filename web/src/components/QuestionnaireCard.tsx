import type { Client } from '../api';
import { useT } from '../i18n';
import { questionnairePairs } from './questionnairePairs';

/**
 * The admin-only questionnaire tab (openspec `admin-questionnaire-tab`): the
 * form the client submitted before the conversation, as stored on the client
 * at enrollment — one card per answered question, in the form's order. Read
 * only, text only: answers are client-typed and untrusted, so they render as
 * escaped text with their line breaks (no markdown, no link detection). No
 * server call — the pairs ride on the client record the view already holds.
 */
export function QuestionnaireCard({ client }: { client: Client }) {
  const { t } = useT();
  const pairs = questionnairePairs(client.agent_fields);

  return (
    <section className="card panel">
      <div className="panel-header">
        <h3>{t.questionnaireTitle}</h3>
        {pairs.length > 0 && <span className="badge badge-neutral">{t.questionnaireCount(pairs.length)}</span>}
      </div>
      <div className="panel-body">
        {pairs.length === 0 ? (
          <div className="questionnaire-empty">
            <p className="muted">{t.questionnaireEmpty}</p>
            <p className="muted questionnaire-empty-note">{t.questionnaireEmptyNote}</p>
          </div>
        ) : (
          <ol className="questionnaire-list">
            {pairs.map((pair, i) => (
              <li key={i} className="questionnaire-card">
                <div className="questionnaire-question">{pair.question}</div>
                <div className="questionnaire-answer">{pair.answer}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
