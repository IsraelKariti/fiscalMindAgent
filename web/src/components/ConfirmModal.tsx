import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface Props {
  title: string;
  note: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  /** Hazard styling: orange-gradient frame plus a warning-triangle icon above the title. */
  warning?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Generic styled confirmation dialog — use this instead of window.confirm
 * (native browser popups are banned). Closes itself before firing onConfirm;
 * the caller's own busy indicators cover the in-flight state.
 */
export function ConfirmModal({ title, note, confirmLabel, danger, warning, onConfirm, onClose }: Props) {
  const { t } = useT();

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`card modal modal-confirm ${warning ? 'modal-warning' : ''}`} onClick={(e) => e.stopPropagation()}>
        {warning && (
          <span className="warning-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
        )}
        <h2>{title}</h2>
        <p className="muted">{note}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            type="button"
            autoFocus
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
