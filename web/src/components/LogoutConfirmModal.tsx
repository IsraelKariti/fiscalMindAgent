import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface Props {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function LogoutConfirmModal({ onConfirm, onClose }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{t.logoutQuestion}</h2>
        <p className="muted">{t.logoutNote}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-danger" type="button" onClick={confirm} disabled={busy} autoFocus>
            {busy ? t.loggingOut : t.logout}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
