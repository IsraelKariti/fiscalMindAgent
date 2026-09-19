import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { AdminConversationStep } from '../api';
import { formatTimestamp, humanizePurpose } from '../format';
import { useT } from '../i18n';
import { CopyButton } from './CopyButton';
import { stepDetailsText, stepLinkOf } from './stepLink';
import { isIsoDateTime, stepSummaryOf } from './stepSummary';

/** One code check of a gate, as the audit row records it (`detail.checks`). */
export interface GateCheckView {
  key: string;
  passed: boolean;
  note: string | null;
  /** The value the check inspected; null on rows recorded before values were kept. */
  observed: string | null;
  /** What the value was compared with, when the check has a reference. */
  expected: string | null;
}

const optionalText = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

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
  return checks.map((c) => ({
    key: c.key,
    passed: c.passed,
    note: optionalText(c.note),
    observed: optionalText((c as { observed?: unknown }).observed),
    expected: optionalText((c as { expected?: unknown }).expected),
  }));
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

/** Human label of a step action: gate labels, then the step labels, then a title-cased fallback. */
export function stepActionLabel(labels: { gate: Record<string, string>; step: Record<string, string> }, action: string): string {
  return labels.gate[action] ?? labels.step[action] ?? humanizePurpose(action.replace(/\./g, '_'));
}

/**
 * Read-only drill-down of one audited code step: what the step did (its
 * detail as labelled rows), and, for a gate row, which checks ran, which
 * passed (✓) and which failed (✗) with the failure note. Rendered only where
 * the admin trace itself is rendered. The copy buttons (link, details) sit at
 * the top beside the title; there is no close button — it closes on the
 * backdrop and Escape.
 */
export function StepDetailModal({ step, onClose }: { step: AdminConversationStep; onClose: () => void }) {
  const { t } = useT();
  const checks = gateChecksOf(step);
  const result = gateResultOf(step);
  const reason = gateReasonOf(step);
  const summary = stepSummaryOf(step.action, step.detail);
  const label = stepActionLabel({ gate: t.codeGateLabels, step: t.stepActionLabels }, step.action);
  const titleId = `gate-modal-title-${step.id}`;
  const fieldLabel = (key: string) => t.stepFieldLabels[key] ?? humanizePurpose(key);
  const valueText = (value: string) => (isIsoDateTime(value) ? formatTimestamp(value) : value);

  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Focus the dialog itself (no close button to take it) so Escape and Tab
  // start inside the modal; preventScroll keeps the title in view.
  useEffect(() => {
    dialogRef.current?.focus({ preventScroll: true });
  }, []);

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal gate-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="gate-modal-head">
          <h2 id={titleId}>{label}</h2>
          <div className="btn-row gate-modal-copy">
            <CopyButton text={stepLinkOf(step.id, window.location.origin)} label={t.stepCopyLink} />
            <CopyButton text={stepDetailsText(step, window.location.origin)} label={t.stepCopyDetails} />
          </div>
        </div>
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
        <h3 className="gate-modal-section">{t.gateModalSummary}</h3>
        {summary.length === 0 ? (
          <p className="muted gate-summary-empty">{t.gateModalSummaryEmpty}</p>
        ) : (
          <dl className="gate-summary-list">
            {summary.map((row) => (
              <div key={row.key} className="gate-summary-row">
                <dt>
                  {fieldLabel(row.key)}
                  <span className="mono muted gate-check-key" dir="ltr">
                    {row.key}
                  </span>
                </dt>
                <dd>
                  {'items' in row ? (
                    <ul className="gate-summary-items">
                      {row.items.map((item, i) => (
                        <li key={i} dir="auto">
                          {valueText(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span dir="auto">{valueText(row.value)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {checks && (
          <>
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
                    {(c.observed || c.expected) && (
                      <span className="gate-check-value">
                        {c.observed && (
                          <span>
                            <span className="muted">{t.gateCheckObserved}</span> <span dir="auto">{c.observed}</span>
                          </span>
                        )}
                        {c.expected && (
                          <span>
                            <span className="muted">{t.gateCheckExpected}</span> <span dir="auto">{c.expected}</span>
                          </span>
                        )}
                      </span>
                    )}
                    {!c.passed && c.note && (
                      <span className="gate-check-note" dir="auto">
                        {c.note}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <details className="gate-modal-raw">
          <summary className="muted">{t.gateModalRawDetail}</summary>
          <pre className="mono" dir="ltr">
            {JSON.stringify(step.detail, null, 2)}
          </pre>
        </details>
      </div>
    </div>,
    document.body,
  );
}
