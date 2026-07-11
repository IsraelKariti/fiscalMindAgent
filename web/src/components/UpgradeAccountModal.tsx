import { useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../api';
import { useT } from '../i18n';

interface Props {
  email: string;
  onUpgraded: () => void;
  onClose: () => void;
}

/** Warns the admin they are granting Premium without payment before switching the tier. */
export function UpgradeAccountModal({ email, onUpgraded, onClose }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminSetTier(email, 'premium');
      onUpgraded();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.upgradeAccountFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal modal-warning"
        role="alertdialog"
        aria-labelledby="upgrade-account-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="warning-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </span>
        <h2 id="upgrade-account-title">
          <span className="warning-highlight">{t.upgradeToPremium}</span>
        </h2>
        <p className="muted">{t.upgradeAccountWarning(email)}</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-danger" type="button" onClick={confirm} disabled={busy} autoFocus>
            {busy ? t.upgrading : t.upgradeToPremium}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
