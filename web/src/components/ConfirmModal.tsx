import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface Props {
  title: string;
  note: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Generic styled confirmation dialog — use this instead of window.confirm
 * (native browser popups are banned). Closes itself before firing onConfirm;
 * the caller's own busy indicators cover the in-flight state.
 */
export function ConfirmModal({ title, note, confirmLabel, danger, onConfirm, onClose }: Props) {
  const { t } = useT();

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
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
