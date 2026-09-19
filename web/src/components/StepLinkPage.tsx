import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, type AdminConversationStep } from '../api';
import { useT } from '../i18n';
import { StepDetailModal } from './StepDetailModal';
import { parseStepHash } from './stepLink';

/**
 * What a step link (#/steps/:id) opens: that one audited code step in the
 * step detail modal, loaded by id. Admin-only — App mounts it only for an
 * admin (impersonating or not) and the endpoint sits behind requireAdmin.
 * A malformed id or an id that matches no audit row shows an in-app "step not
 * found" card. `onClose` returns to the normal shell.
 */
export function StepLinkPage({ hash, onClose }: { hash: string; onClose: () => void }) {
  const { t } = useT();
  const stepId = parseStepHash(hash);
  const [step, setStep] = useState<AdminConversationStep | null>(null);
  const [missing, setMissing] = useState(stepId === null);

  useEffect(() => {
    setStep(null);
    setMissing(stepId === null);
    if (!stepId) return;
    let stale = false;
    api
      .adminGetStep(stepId)
      .then((res) => {
        if (!stale) setStep(res.step);
      })
      .catch(() => {
        if (!stale) setMissing(true);
      });
    return () => {
      stale = true;
    };
  }, [stepId]);

  if (step) return <StepDetailModal step={step} onClose={onClose} />;
  if (!missing) return <div className="screen-center muted">{t.loading}</div>;

  return createPortal(
    <div className="modal-backdrop">
      <div className="card modal modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="step-not-found-title">
        <h2 id="step-not-found-title">{t.stepNotFound}</h2>
        <p className="muted">{t.stepNotFoundHint}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-primary" type="button" onClick={onClose} autoFocus>
            {t.stepBackToApp}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
