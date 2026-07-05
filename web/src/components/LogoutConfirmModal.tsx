import { useState } from 'react';

interface Props {
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function LogoutConfirmModal({ onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>להתנתק מהמערכת?</h2>
        <p className="muted">כדי לחזור, תצטרכו להתחבר שוב עם חשבון Google.</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="btn btn-danger" type="button" onClick={confirm} disabled={busy} autoFocus>
            {busy ? 'מתנתק…' : 'התנתקות'}
          </button>
        </div>
      </div>
    </div>
  );
}
