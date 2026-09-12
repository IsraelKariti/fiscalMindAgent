import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { AdminConversationStep } from '../api';
import { formatTimestamp, humanizePurpose } from '../format';
import { useT } from '../i18n';

/** One code check of a gate, as the audit row records it (`detail.checks`). */
export interface GateCheckView {
  key: string;
  passed: boolean;
  note: string | null;
}

/** True for a well-formed `detail.checks` list; anything else means "no checks recorded". */
export function isGateCheckList(value: unknown): value is GateCheckView[] {
  return (
    Array.isArray(value) &&
    value.every(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as { key?: unknown }).key === 'string' &&
        typeof (c as { passed?: unknown }).passed === 'boolean',
    )
  );
}

/** The step's check list, or null when the row carries none (old rows, apply_* steps). */
export function gateChecksOf(step: AdminConversationStep): GateCheckView[] | null {
  const checks = step.detail['checks'];
  if (!isGateCheckList(checks)) return null;
  return checks.map((c) => ({ key: c.key, passed: c.passed, note: typeof c.note === 'string' && c.note !== '' ? c.note : null }));
}

/** The step's overall result badge value, or null when the row has none. */
export function gateResultOf(step: AdminConversationStep): boolean | null {
  return typeof step.detail['result'] === 'boolean' ? (step.detail['result'] as boolean) : null;
}

/** The step's general reason line, or null. */
export function gateReasonOf(step: AdminConversationStep): string | null {
  const reason = step.detail['reason'];
  return typeof reason === 'string' && reason !== '' ? reason : null;
}

/**
 * Read-only drill-down of one code gate row: which checks ran, which passed
 * (✓) and which failed (✗) with the failure note. Rendered only where the
 * admin trace itself is rendered; closes on the button, the backdrop and Escape.
 */
export function GateChecksModal({ step, checks, onClose }: { step: AdminConversationStep; checks: GateCheckView[]; onClose: () => void }) {
  const { t } = useT();
  const result = gateResultOf(step);
  const reason = gateReasonOf(step);
  const label = t.codeGateLabels[step.action] ?? humanizePurpose(step.action);
  const titleId = `gate-modal-title-${step.id}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal gate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId}>{label}</h2>
        <div className="gate-modal-meta" dir="ltr">
          <span className="mono">{step.action}</span>
          <span className="muted">{formatTimestamp(step.occurredAt)}</span>
          {result !== null && <span className={`badge ${result ? 'badge-success' : 'badge-danger'}`}>result: {String(result)}</span>}
        </div>
        {reason && (
          <p className="muted gate-modal-reason">
            <span>{t.gateModalReason}</span> <span dir="auto">{reason}</span>
          </p>
        )}
        <h3 className="gate-modal-section">{t.gateModalChecks}</h3>
        <ul className="gate-check-list">
          {checks.map((c, i) => (
            <li key={`${c.key}-${i}`} className={`gate-check ${c.passed ? 'gate-check-pass' : 'gate-check-fail'}`}>
              <span className="gate-check-glyph" aria-hidden="true">
                {c.passed ? '✓' : '✗'}
              </span>
              <span className="gate-check-body">
                <span className="gate-check-label">
                  {t.gateCheckLabels[c.key] ?? humanizePurpose(c.key)}
                  <span className="mono muted gate-check-key" dir="ltr">
                    {c.key}
                  </span>
                  <span className="gate-sr-only">{c.passed ? t.gateCheckPassed : t.gateCheckFailed}</span>
                </span>
                {!c.passed && c.note && (
                  <span className="muted gate-check-note" dir="auto">
                    {c.note}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <details className="gate-modal-raw">
          <summary className="muted">{t.gateModalRawDetail}</summary>
          <pre className="mono" dir="ltr">
            {JSON.stringify(step.detail, null, 2)}
          </pre>
        </details>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} autoFocus>
            {t.closeViewer}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
