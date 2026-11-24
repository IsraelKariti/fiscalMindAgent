import { useT } from '../../i18n';
import { formatTimestamp } from '../../format';
import { EvidencePane, useFetchEvidence } from '../EvidencePane';

/**
 * The evidence screen of one website-fetch session (#/site-access/sessions/:id,
 * openspec `fetch-step-evidence`): a header with the session's site, state,
 * year, time and error, then the same step gallery the trace step modal
 * shows, full width. Reached from a site-access card's last-access line.
 */
export function AdminFetchEvidence({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { t } = useT();
  const state = useFetchEvidence(sessionId);

  return (
    <div className="fetch-evidence-page">
      <div className="btn-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          ← {t.fetchEvidenceBack}
        </button>
      </div>
      <h2 className="fetch-evidence-title">{t.fetchEvidenceTitle}</h2>
      <p className="muted">{t.fetchEvidenceIntro}</p>
      {state === 'missing' ? (
        <div className="error-banner">{t.fetchEvidenceNotFound}</div>
      ) : state === 'failed' ? (
        <div className="error-banner">{t.fetchEvidenceLoadFailed}</div>
      ) : state === 'loading' || state === 'none' ? (
        <p className="muted">{t.fetchEvidenceLoading}</p>
      ) : (
        <>
          <div className="card fetch-evidence-session">
            <dl className="gate-summary-list">
              <div className="gate-summary-row">
                <dt>{t.fetchEvidenceSession}</dt>
                <dd className="mono" dir="ltr">
                  {state.session.id}
                </dd>
              </div>
              <div className="gate-summary-row">
                <dt>{t.fetchEvidenceProvider}</dt>
                <dd className="mono" dir="ltr">
                  {state.session.provider}
                </dd>
              </div>
              <div className="gate-summary-row">
                <dt>{t.fetchEvidenceStatus}</dt>
                <dd className="mono" dir="ltr">
                  {state.session.status}
                </dd>
              </div>
              <div className="gate-summary-row">
                <dt>{t.fetchEvidenceTaxYear}</dt>
                <dd dir="ltr">{state.session.taxYear}</dd>
              </div>
              <div className="gate-summary-row">
                <dt>{t.fetchEvidenceStarted}</dt>
                <dd>{formatTimestamp(state.session.createdAt)}</dd>
              </div>
              {state.session.error && (
                <div className="gate-summary-row">
                  <dt>{t.fetchEvidenceError}</dt>
                  <dd className="mono site-access-error" dir="ltr">
                    {state.session.error}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="card fetch-evidence-gallery">
            <EvidencePane sessionId={sessionId} state={state} />
          </div>
        </>
      )}
    </div>
  );
}
