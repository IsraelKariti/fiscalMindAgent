import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';

interface Props {
  email: string;
  /** Starts a fresh view-as session for the same accountant; the page reloads on success. */
  onRestart: () => Promise<void>;
  /** Leaves view-as for the admin panel; the page reloads on success. */
  onExit: () => Promise<void>;
}

/**
 * Shown when the server reports that the admin's view-as session ended (idle
 * timeout, exit or switch in another tab). Deliberately not dismissible:
 * every workspace request behind it is rejected until one of the two is chosen.
 */
export function ImpersonationEndedModal({ email, onRestart, onExit }: Props) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      // e.g. the admin's own sign-in expired too — exiting stays available.
      setError(t.viewAsRestartFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop">
      <div
        className="card modal modal-confirm modal-view-as-ended"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="view-as-ended-title"
      >
        <h2 id="view-as-ended-title">{t.viewAsEndedTitle}</h2>
        <p className="muted">{t.viewAsEndedText}</p>
        <p className="id-card-email" dir="ltr">
          {email}
        </p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={() => run(onExit)} disabled={busy}>
            {t.viewAsBackToAdmin}
          </button>
          <button className="btn btn-primary" type="button" onClick={() => run(onRestart)} disabled={busy} autoFocus>
            {t.viewAsRestart}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
