import { useEffect, useState } from 'react';
import { ApiError, api, type FetchEvidenceReply, type FetchEvidenceStep } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';

/**
 * The evidence gallery of one website-fetch session (openspec
 * `fetch-step-evidence`): the steps the runner recorded, in order, each with
 * its screenshot and buttons for the HTML copy (rendered only inside a
 * sandboxed frame), the snapshot download and the step record. Shared by the
 * step detail modal (as its second pane) and the admin evidence screen.
 */
export type EvidenceState = FetchEvidenceReply | 'loading' | 'missing' | 'failed';

/** Loads a session's evidence once, on mount; `null` asks for nothing. */
export function useFetchEvidence(sessionId: string | null): EvidenceState | 'none' {
  const [state, setState] = useState<EvidenceState | 'none'>(sessionId ? 'loading' : 'none');
  useEffect(() => {
    setState(sessionId ? 'loading' : 'none');
    if (!sessionId) return;
    let stale = false;
    api
      .adminFetchEvidence(sessionId)
      .then((reply) => {
        if (!stale) setState(reply);
      })
      .catch((err: unknown) => {
        if (stale) return;
        setState(err instanceof ApiError && err.status === 404 ? 'missing' : 'failed');
      });
    return () => {
      stale = true;
    };
  }, [sessionId]);
  return state;
}

/** True when the session has stored steps (the modal renders two panes only then). */
export function hasEvidence(state: EvidenceState | 'none'): state is FetchEvidenceReply {
  return typeof state === 'object' && state.steps.length > 0;
}

export function EvidencePane({ sessionId, state }: { sessionId: string; state: EvidenceState }) {
  const { t } = useT();
  return (
    <section className="gate-modal-doc evidence-pane" aria-label={t.fetchEvidencePane}>
      {state === 'loading' ? (
        <div className="gate-modal-doc-body">
          <p className="muted">{t.fetchEvidenceLoading}</p>
        </div>
      ) : state === 'failed' ? (
        <div className="gate-modal-doc-body">
          <p className="muted">{t.fetchEvidenceLoadFailed}</p>
        </div>
      ) : state === 'missing' || state.steps.length === 0 ? (
        <div className="gate-modal-doc-body">
          <p className="muted">{t.fetchEvidenceNone}</p>
        </div>
      ) : (
        <div className="gate-modal-doc-body evidence-steps">
          {state.steps.map((step) => (
            <EvidenceStepCard key={step.seq} sessionId={sessionId} step={step} />
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceStepCard({ sessionId, step }: { sessionId: string; step: FetchEvidenceStep }) {
  const { t } = useT();
  const [showHtml, setShowHtml] = useState(false);
  const [showRecord, setShowRecord] = useState(false);
  const url = (part: 'screenshot' | 'html' | 'mhtml' | 'record', as: 'view' | 'download') => api.adminFetchEvidenceUrl(sessionId, step.seq, part, as);
  const has = (part: 'screenshot' | 'html' | 'mhtml' | 'record') => step.parts.includes(part);
  const missing = Object.entries(step.missing ?? {});
  return (
    <article className={`evidence-step${step.error ? ' evidence-step-failed' : ''}`} dir="ltr">
      <header className="evidence-step-head">
        <span className="evidence-step-seq">{t.fetchEvidenceStep(step.seq)}</span>
        <span className="mono evidence-step-name">{step.name}</span>
        {step.at && <span className="muted">{formatTimestamp(step.at)}</span>}
        {step.error && <span className="badge badge-danger">{t.fetchEvidenceError}</span>}
      </header>
      {step.title && (
        <p className="evidence-step-title" dir="auto">
          {step.title}
        </p>
      )}
      {step.url && (
        <p className="mono muted evidence-step-url" title={step.url}>
          {step.url}
        </p>
      )}
      {step.error && (
        <p className="evidence-step-error" dir="auto">
          {step.error}
        </p>
      )}
      {has('screenshot') ? (
        <a href={url('screenshot', 'view')} target="_blank" rel="noopener noreferrer" className="evidence-shot-link">
          <img className="evidence-shot" src={url('screenshot', 'view')} alt={`${t.fetchEvidenceStep(step.seq)}: ${step.name}`} loading="lazy" />
        </a>
      ) : (
        <p className="muted">{t.fetchEvidenceNoScreenshot}</p>
      )}
      <div className="btn-row evidence-step-actions">
        {has('html') && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowHtml((v) => !v)} aria-expanded={showHtml}>
            {showHtml ? t.fetchEvidenceHideHtml : t.fetchEvidenceViewHtml}
          </button>
        )}
        {has('html') && (
          <a className="btn btn-ghost" href={url('html', 'download')}>
            {t.fetchEvidenceDownloadHtml}
          </a>
        )}
        {has('mhtml') && (
          <a className="btn btn-ghost" href={url('mhtml', 'download')}>
            {t.fetchEvidenceDownloadSnapshot}
          </a>
        )}
        {has('screenshot') && (
          <a className="btn btn-ghost" href={url('screenshot', 'download')}>
            {t.fetchEvidenceDownloadScreenshot}
          </a>
        )}
        {step.record && (
          <button type="button" className="btn btn-ghost" onClick={() => setShowRecord((v) => !v)} aria-expanded={showRecord}>
            {showRecord ? t.fetchEvidenceHideRecord : t.fetchEvidenceRecord}
          </button>
        )}
      </div>
      {showHtml && has('html') && (
        <div className="evidence-html">
          <p className="muted evidence-sandbox-note" dir="rtl">
            {t.fetchEvidenceSandboxNote}
          </p>
          {/* sandbox="" (no allow-*) plus the server's CSP: opaque origin, no scripts, nothing from the copied page can act on this origin. */}
          <iframe src={url('html', 'view')} sandbox="" title={`${step.name} (HTML)`} referrerPolicy="no-referrer" />
        </div>
      )}
      {missing.length > 0 && (
        <p className="muted evidence-missing" dir="rtl">
          <span>{t.fetchEvidenceMissing}:</span>{' '}
          {missing.map(([part, reason]) => (
            <span key={part} dir="ltr">
              <span className="mono">{part}</span> — {reason}
            </span>
          ))}
        </p>
      )}
      {showRecord && step.record && <EvidenceRecord step={step} />}
    </article>
  );
}

function EvidenceRecord({ step }: { step: FetchEvidenceStep }) {
  const { t } = useT();
  const record = step.record;
  if (!record) return null;
  return (
    <div className="evidence-record" dir="rtl">
      <h4>{t.fetchEvidenceFrames}</h4>
      {record.frames.length === 0 ? (
        <p className="muted">{t.fetchEvidenceNoneInRecord}</p>
      ) : (
        <ul className="mono" dir="ltr">
          {record.frames.map((f, i) => (
            <li key={i}>{f}</li>
          ))}
        </ul>
      )}
      <h4>{t.fetchEvidenceConsole}</h4>
      {record.console.length === 0 ? (
        <p className="muted">{t.fetchEvidenceNoneInRecord}</p>
      ) : (
        <ul className="mono" dir="ltr">
          {record.console.map((c, i) => (
            <li key={i}>
              <span className="muted">[{c.type}]</span> {c.text}
            </li>
          ))}
        </ul>
      )}
      <h4>{t.fetchEvidenceResponses}</h4>
      {record.responses.length === 0 ? (
        <p className="muted">{t.fetchEvidenceNoneInRecord}</p>
      ) : (
        <ul className="mono" dir="ltr">
          {record.responses.map((r, i) => (
            <li key={i}>
              {r.method} {r.status ?? r.failure ?? '?'} {r.url}
            </li>
          ))}
        </ul>
      )}
      <details className="gate-modal-raw">
        <summary className="muted">JSON</summary>
        <pre className="mono" dir="ltr">
          {JSON.stringify({ ...step, record }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
